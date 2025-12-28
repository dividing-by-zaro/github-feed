import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { GitHubService } from '../services/github.js';
import { ClassifierService } from '../services/classifier.js';
import { requireAuth, getUser } from '../auth/middleware.js';
import type { GlobalRepo } from '@prisma/client';
import type { Update, PRInfo, PRData } from '../types.js';

const router = Router();

// Stale threshold: 1 hour
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

// Helper: Build PRInfo from GlobalPR for client response
function buildPRInfo(globalPR: {
  id: string;
  prNumber: number;
  title: string;
  url: string;
  mergedAt: Date;
  author: string | null;
  commits: unknown;
}): PRInfo {
  const commits = globalPR.commits as Array<{
    sha: string;
    message: string;
    url: string;
  }>;
  return {
    id: globalPR.id,
    prNumber: globalPR.prNumber,
    title: globalPR.title,
    url: globalPR.url,
    mergedAt: globalPR.mergedAt.toISOString(),
    author: globalPR.author ?? undefined,
    commits: commits.map((c) => ({
      sha: c.sha.substring(0, 7),
      message: c.message.split('\n')[0],
      url: c.url,
    })),
  };
}

// Format Update for API response
function formatUpdate(
  u: {
    id: string;
    title: string;
    summary: string | null;
    category: string;
    significance: string;
    date: Date;
    prCount: number;
    commitCount: number;
    prs: Array<{
      id: string;
      prNumber: number;
      title: string;
      url: string;
      mergedAt: Date;
      author: string | null;
      commits: unknown;
    }>;
  },
  repoId: string
): Update {
  return {
    id: u.id,
    repoId,
    title: u.title,
    summary: u.summary,
    category: u.category as Update['category'],
    significance: u.significance as Update['significance'],
    date: u.date.toISOString(),
    prCount: u.prCount,
    commitCount: u.commitCount,
    prs: u.prs.map(buildPRInfo),
  };
}

// Format release for API response
function formatRelease(
  r: {
    id: string;
    title: string;
    tagName: string;
    url: string;
    publishedAt: Date | null;
    body: string | null;
    summary: string | null;
    releaseType: string | null;
    baseVersion: string | null;
    clusterId: string | null;
    isClusterHead: boolean | null;
  },
  repoId: string
) {
  return {
    id: r.id,
    repoId,
    title: r.title,
    tagName: r.tagName,
    url: r.url,
    publishedAt: r.publishedAt?.toISOString() ?? new Date().toISOString(),
    body: r.body ?? '',
    summary: r.summary,
    releaseType: r.releaseType,
    baseVersion: r.baseVersion,
    clusterId: r.clusterId,
    isClusterHead: r.isClusterHead,
  };
}

// Index a repo (fetch from GitHub, group with AI, summarize)
async function indexRepo(
  globalRepo: GlobalRepo,
  github: GitHubService,
  classifier: ClassifierService,
  sinceDate: Date
) {
  const { owner, name } = globalRepo;
  const repoIdStr = `${owner}/${name}`;

  console.log(`Indexing ${repoIdStr} since ${sinceDate.toISOString()}`);

  // Fetch repo info
  const repoInfo = await github.getRepoInfo(owner, name);

  // Update GlobalRepo with latest info
  await prisma.globalRepo.update({
    where: { id: globalRepo.id },
    data: {
      description: repoInfo.description,
      avatarUrl: repoInfo.avatarUrl,
    },
  });

  // Fetch merged PRs
  const prs = await github.getMergedPRs(owner, name, sinceDate);
  console.log(`Found ${prs.length} merged PRs`);

  // Fetch releases
  const releases = await github.getReleases(owner, name, sinceDate);
  console.log(`Found ${releases.length} releases`);

  // Get existing PR numbers to avoid re-processing
  const existingPRNumbers = new Set(
    (
      await prisma.globalPR.findMany({
        where: { globalRepoId: globalRepo.id },
        select: { prNumber: true },
      })
    ).map((p) => p.prNumber)
  );

  // Filter to new PRs only
  const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
  console.log(`${newPRs.length} new PRs to process`);

  // Get existing release tags
  const existingTags = new Set(
    (
      await prisma.globalRelease.findMany({
        where: { globalRepoId: globalRepo.id },
        select: { tagName: true },
      })
    ).map((r) => r.tagName)
  );

  const newReleases = releases.filter((r) => !existingTags.has(r.tagName));
  console.log(`${newReleases.length} new releases to process`);

  // Process new PRs with two-stage pipeline
  if (newPRs.length > 0) {
    console.log('Step 1: Grouping PRs with LLM...');
    const grouping = await classifier.groupPRs(newPRs, repoInfo);
    console.log(`Created ${grouping.groups.length} semantic groups`);

    console.log('Step 2: Summarizing groups with LLM...');
    const summaries = await classifier.summarizeAllGroups(
      grouping,
      newPRs,
      repoInfo
    );

    // Create GlobalPRs and GlobalUpdates
    const prsById = new Map(newPRs.map((pr) => [pr.number, pr]));

    for (const group of grouping.groups) {
      const key = group.prNumbers.sort().join('-');
      const summary = summaries.get(key);

      if (!summary) {
        console.error(`No summary for group ${key}`);
        continue;
      }

      // Get PRs in this group
      const groupPRs = group.prNumbers
        .map((n) => prsById.get(n))
        .filter((p): p is PRData => p !== undefined);

      if (groupPRs.length === 0) continue;

      // Calculate aggregates
      const latestDate = new Date(
        Math.max(...groupPRs.map((p) => new Date(p.mergedAt).getTime()))
      );
      const totalCommits = groupPRs.reduce(
        (sum, p) => sum + p.commits.length,
        0
      );

      // Create the Update
      const update = await prisma.globalUpdate.create({
        data: {
          globalRepoId: globalRepo.id,
          title: summary.title,
          summary: summary.summary,
          category: summary.category,
          significance: summary.significance,
          date: latestDate,
          prCount: groupPRs.length,
          commitCount: totalCommits,
        },
      });

      // Create GlobalPRs linked to this Update (skip any that already exist)
      await prisma.globalPR.createMany({
        data: groupPRs.map((pr) => ({
          globalRepoId: globalRepo.id,
          updateId: update.id,
          prNumber: pr.number,
          title: pr.title,
          body: pr.body,
          url: pr.url,
          mergedAt: new Date(pr.mergedAt),
          author: pr.author,
          labels: pr.labels ?? [],
          commits: pr.commits.map((c) => ({
            sha: c.sha,
            message: c.message,
            url: c.url,
          })),
        })),
        skipDuplicates: true,
      });

      console.log(
        `Created update "${summary.title}" with ${groupPRs.length} PRs`
      );
    }
  }

  // Process new releases
  if (newReleases.length > 0) {
    console.log('Processing releases...');
    const { processed } = await classifier.processReleases(newReleases, repoInfo);

    await prisma.globalRelease.createMany({
      data: processed.map((p) => ({
        globalRepoId: globalRepo.id,
        tagName: p.release.tagName,
        title: p.release.title,
        url: p.release.url,
        publishedAt: new Date(p.release.publishedAt),
        body: p.release.body,
        summary: p.summary,
        releaseType: p.releaseType,
        baseVersion: p.baseVersion,
        clusterId: p.clusterId,
        isClusterHead: p.isClusterHead,
      })),
    });

    console.log(`Created ${processed.length} releases`);
  }

  // Update lastFetchedAt
  await prisma.globalRepo.update({
    where: { id: globalRepo.id },
    data: { lastFetchedAt: new Date() },
  });

  console.log(`Finished indexing ${repoIdStr}`);
}

// ===== Authenticated Routes =====
router.use(requireAuth);

// List user's repos
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const userRepos = await prisma.userRepo.findMany({
      where: { userId: user.id },
      include: { globalRepo: true },
      orderBy: { createdAt: 'desc' },
    });

    // Format response to match client expectations
    const repos = userRepos.map((ur) => ({
      id: ur.id,
      owner: ur.globalRepo.owner,
      name: ur.globalRepo.name,
      url: ur.globalRepo.url,
      description: ur.globalRepo.description,
      avatarUrl: ur.globalRepo.avatarUrl,
      displayName: ur.displayName,
      customColor: ur.customColor,
      feedSignificance: ur.feedSignificance,
      showReleases: ur.showReleases,
      lastFetchedAt: ur.globalRepo.lastFetchedAt?.toISOString() ?? null,
      createdAt: ur.createdAt.toISOString(),
    }));

    res.json(repos);
  } catch (error) {
    console.error('Error fetching repos:', error);
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
});

// Search indexed repos (for autocomplete)
router.get('/search', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const query = ((req.query.q as string) || '').trim();

    if (query.length < 2) {
      return res.json([]);
    }

    // Find GlobalRepos matching the query, including whether user already follows them
    const results = await prisma.globalRepo.findMany({
      where: {
        OR: [
          { owner: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        owner: true,
        name: true,
        description: true,
        avatarUrl: true,
        url: true,
        userRepos: {
          where: { userId: user.id },
          select: { id: true },
        },
      },
      take: 8,
      orderBy: { name: 'asc' },
    });

    // Transform to include isFollowed flag
    const transformed = results.map(({ userRepos, ...repo }) => ({
      ...repo,
      isFollowed: userRepos.length > 0,
    }));

    res.json(transformed);
  } catch (error) {
    console.error('Error searching repos:', error);
    res.status(500).json({ error: 'Failed to search repos' });
  }
});

// Add a new repo
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { repoUrl, since } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!openaiApiKey) {
      return res
        .status(500)
        .json({ error: 'OpenAI API key not configured on server' });
    }

    const github = new GitHubService(githubToken || undefined);
    const classifier = new ClassifierService(openaiApiKey);

    // Parse repo URL
    const { owner, name } = github.parseRepoUrl(repoUrl);

    // Check if user already has this repo
    const existingUserRepo = await prisma.userRepo.findFirst({
      where: {
        userId: user.id,
        globalRepo: { owner, name },
      },
    });

    if (existingUserRepo) {
      return res.status(400).json({ error: 'This repo is already being tracked' });
    }

    // Check if GlobalRepo exists
    let globalRepo = await prisma.globalRepo.findUnique({
      where: { owner_name: { owner, name } },
    });

    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    if (!globalRepo) {
      // Create new GlobalRepo
      console.log(`Creating new GlobalRepo for ${owner}/${name}`);
      const repoInfo = await github.getRepoInfo(owner, name);

      globalRepo = await prisma.globalRepo.create({
        data: {
          owner,
          name,
          url: repoUrl,
          description: repoInfo.description,
          avatarUrl: repoInfo.avatarUrl,
        },
      });

      // Index the repo (fetch PRs, releases, classify)
      await indexRepo(globalRepo, github, classifier, sinceDate);
    } else {
      // Check if stale and refresh if needed
      const isStale =
        !globalRepo.lastFetchedAt ||
        Date.now() - globalRepo.lastFetchedAt.getTime() > STALE_THRESHOLD_MS;

      if (isStale) {
        console.log(`Refreshing stale GlobalRepo ${owner}/${name}`);
        const refreshSince = globalRepo.lastFetchedAt || sinceDate;
        await indexRepo(globalRepo, github, classifier, refreshSince);
      } else {
        console.log(`Using cached GlobalRepo ${owner}/${name}`);
      }
    }

    // Reload globalRepo with all data
    globalRepo = await prisma.globalRepo.findUnique({
      where: { id: globalRepo.id },
    });

    // Create UserRepo link
    const userRepo = await prisma.userRepo.create({
      data: {
        userId: user.id,
        globalRepoId: globalRepo!.id,
      },
      include: {
        globalRepo: {
          include: {
            updates: {
              orderBy: { date: 'desc' },
              include: { prs: true },
            },
            releases: { orderBy: { publishedAt: 'desc' } },
          },
        },
      },
    });

    // Format response
    const repoIdStr = `${userRepo.globalRepo.owner}/${userRepo.globalRepo.name}`;
    res.json({
      id: userRepo.id,
      owner: userRepo.globalRepo.owner,
      name: userRepo.globalRepo.name,
      url: userRepo.globalRepo.url,
      description: userRepo.globalRepo.description,
      avatarUrl: userRepo.globalRepo.avatarUrl,
      displayName: userRepo.displayName,
      customColor: userRepo.customColor,
      feedSignificance: userRepo.feedSignificance,
      showReleases: userRepo.showReleases,
      lastFetchedAt: userRepo.globalRepo.lastFetchedAt?.toISOString() ?? null,
      createdAt: userRepo.createdAt.toISOString(),
      updates: userRepo.globalRepo.updates.map((u) => formatUpdate(u, repoIdStr)),
      releases: userRepo.globalRepo.releases
        .filter((r) => r.isClusterHead)
        .map((r) => formatRelease(r, repoIdStr)),
    });
  } catch (error) {
    console.error('Error adding repo:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get a specific repo with its data
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const userRepo = await prisma.userRepo.findFirst({
      where: { id, userId: user.id },
      include: {
        globalRepo: {
          include: {
            updates: {
              orderBy: { date: 'desc' },
              include: { prs: true },
            },
            releases: { orderBy: { publishedAt: 'desc' } },
          },
        },
      },
    });

    if (!userRepo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const repoIdStr = `${userRepo.globalRepo.owner}/${userRepo.globalRepo.name}`;
    res.json({
      id: userRepo.id,
      owner: userRepo.globalRepo.owner,
      name: userRepo.globalRepo.name,
      url: userRepo.globalRepo.url,
      description: userRepo.globalRepo.description,
      avatarUrl: userRepo.globalRepo.avatarUrl,
      displayName: userRepo.displayName,
      customColor: userRepo.customColor,
      feedSignificance: userRepo.feedSignificance,
      showReleases: userRepo.showReleases,
      lastFetchedAt: userRepo.globalRepo.lastFetchedAt?.toISOString() ?? null,
      updates: userRepo.globalRepo.updates.map((u) => formatUpdate(u, repoIdStr)),
      releases: userRepo.globalRepo.releases
        .filter((r) => r.isClusterHead)
        .map((r) => formatRelease(r, repoIdStr)),
    });
  } catch (error) {
    console.error('Error fetching repo:', error);
    res.status(500).json({ error: 'Failed to fetch repo' });
  }
});

// Update repo settings (user-specific)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;
    const { displayName, customColor, feedSignificance, showReleases } =
      req.body;

    const userRepo = await prisma.userRepo.updateMany({
      where: { id, userId: user.id },
      data: {
        displayName,
        customColor,
        feedSignificance,
        showReleases,
      },
    });

    if (userRepo.count === 0) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const updated = await prisma.userRepo.findUnique({
      where: { id },
      include: { globalRepo: true },
    });

    res.json({
      id: updated!.id,
      owner: updated!.globalRepo.owner,
      name: updated!.globalRepo.name,
      url: updated!.globalRepo.url,
      description: updated!.globalRepo.description,
      avatarUrl: updated!.globalRepo.avatarUrl,
      displayName: updated!.displayName,
      customColor: updated!.customColor,
      feedSignificance: updated!.feedSignificance,
      showReleases: updated!.showReleases,
    });
  } catch (error) {
    console.error('Error updating repo:', error);
    res.status(500).json({ error: 'Failed to update repo' });
  }
});

// Delete a repo (just removes user's subscription)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const result = await prisma.userRepo.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting repo:', error);
    res.status(500).json({ error: 'Failed to delete repo' });
  }
});

// Refresh repo - delete all data and re-index fresh
router.post('/:id/refresh', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!openaiApiKey) {
      return res
        .status(500)
        .json({ error: 'OpenAI API key not configured on server' });
    }

    // Find the user's repo
    const userRepo = await prisma.userRepo.findFirst({
      where: { id, userId: user.id },
      include: { globalRepo: true },
    });

    if (!userRepo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const globalRepo = userRepo.globalRepo;
    const { owner, name } = globalRepo;
    const repoIdStr = `${owner}/${name}`;

    console.log(`Refreshing repo ${repoIdStr} - deleting existing data`);

    // Delete all existing data for this repo
    await prisma.$transaction([
      // Delete GlobalPRs (must be first due to FK constraint)
      prisma.globalPR.deleteMany({
        where: { globalRepoId: globalRepo.id },
      }),
      // Delete GlobalUpdates
      prisma.globalUpdate.deleteMany({
        where: { globalRepoId: globalRepo.id },
      }),
      // Delete GlobalReleases
      prisma.globalRelease.deleteMany({
        where: { globalRepoId: globalRepo.id },
      }),
      // Reset lastFetchedAt to null
      prisma.globalRepo.update({
        where: { id: globalRepo.id },
        data: { lastFetchedAt: null },
      }),
    ]);

    console.log(`Deleted existing data for ${repoIdStr}, re-indexing...`);

    // Re-index the repo fresh (30 days back, like initial add)
    const github = new GitHubService(githubToken || undefined);
    const classifier = new ClassifierService(openaiApiKey);
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await indexRepo(globalRepo, github, classifier, sinceDate);

    // Fetch the newly created data
    const refreshedRepo = await prisma.userRepo.findUnique({
      where: { id },
      include: {
        globalRepo: {
          include: {
            updates: {
              orderBy: { date: 'desc' },
              include: { prs: true },
            },
            releases: { orderBy: { publishedAt: 'desc' } },
          },
        },
      },
    });

    if (!refreshedRepo) {
      return res.status(404).json({ error: 'Repo not found after refresh' });
    }

    console.log(`Finished refreshing ${repoIdStr}`);

    // Format response
    res.json({
      id: refreshedRepo.id,
      owner: refreshedRepo.globalRepo.owner,
      name: refreshedRepo.globalRepo.name,
      url: refreshedRepo.globalRepo.url,
      description: refreshedRepo.globalRepo.description,
      avatarUrl: refreshedRepo.globalRepo.avatarUrl,
      displayName: refreshedRepo.displayName,
      customColor: refreshedRepo.customColor,
      feedSignificance: refreshedRepo.feedSignificance,
      showReleases: refreshedRepo.showReleases,
      lastFetchedAt: refreshedRepo.globalRepo.lastFetchedAt?.toISOString() ?? null,
      createdAt: refreshedRepo.createdAt.toISOString(),
      updates: refreshedRepo.globalRepo.updates.map((u) => formatUpdate(u, repoIdStr)),
      releases: refreshedRepo.globalRepo.releases
        .filter((r) => r.isClusterHead)
        .map((r) => formatRelease(r, repoIdStr)),
    });
  } catch (error) {
    console.error('Error refreshing repo:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to refresh repo',
    });
  }
});

// Fetch older updates for a repo (paginate backwards from oldest known PR)
router.post('/:id/fetch-recent', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!openaiApiKey) {
      return res
        .status(500)
        .json({ error: 'OpenAI API key not configured on server' });
    }

    // Find the user's repo
    const userRepo = await prisma.userRepo.findFirst({
      where: { id, userId: user.id },
      include: { globalRepo: true },
    });

    if (!userRepo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const globalRepo = userRepo.globalRepo;
    const { owner, name } = globalRepo;
    const repoIdStr = `${owner}/${name}`;

    const github = new GitHubService(githubToken || undefined);
    const classifier = new ClassifierService(openaiApiKey);

    console.log(`Fetching older PRs for ${repoIdStr}`);

    // Get repo info (includes pushedAt - last activity on GitHub)
    const repoInfo = await github.getRepoInfo(owner, name);

    // Find the oldest PR we have for this repo
    const oldestPR = await prisma.globalPR.findFirst({
      where: { globalRepoId: globalRepo.id },
      orderBy: { mergedAt: 'asc' },
      select: { mergedAt: true },
    });

    // If no PRs exist, use current date as the cutoff
    const beforeDate = oldestPR?.mergedAt ?? new Date();

    // Fetch 10 PRs older than our oldest known PR
    const prs = await github.getOlderMergedPRs(owner, name, beforeDate, 10);
    console.log(`Found ${prs.length} older merged PRs`);

    // Get existing PR numbers to avoid re-processing (safety check)
    const existingPRNumbers = new Set(
      (
        await prisma.globalPR.findMany({
          where: { globalRepoId: globalRepo.id },
          select: { prNumber: true },
        })
      ).map((p) => p.prNumber)
    );

    // Filter to new PRs only (should be all of them, but just in case)
    const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
    console.log(`${newPRs.length} new PRs to process`);

    const newUpdates: Update[] = [];

    if (newPRs.length > 0) {
      // Process with two-stage pipeline
      console.log('Step 1: Grouping PRs with LLM...');
      const grouping = await classifier.groupPRs(newPRs, repoInfo);

      console.log('Step 2: Summarizing groups with LLM...');
      const summaries = await classifier.summarizeAllGroups(
        grouping,
        newPRs,
        repoInfo
      );

      const prsById = new Map(newPRs.map((pr) => [pr.number, pr]));

      for (const group of grouping.groups) {
        const key = group.prNumbers.sort().join('-');
        const summary = summaries.get(key);

        if (!summary) continue;

        const groupPRs = group.prNumbers
          .map((n) => prsById.get(n))
          .filter((p): p is PRData => p !== undefined);

        if (groupPRs.length === 0) continue;

        const latestDate = new Date(
          Math.max(...groupPRs.map((p) => new Date(p.mergedAt).getTime()))
        );
        const totalCommits = groupPRs.reduce(
          (sum, p) => sum + p.commits.length,
          0
        );

        // Create the Update
        const update = await prisma.globalUpdate.create({
          data: {
            globalRepoId: globalRepo.id,
            title: summary.title,
            summary: summary.summary,
            category: summary.category,
            significance: summary.significance,
            date: latestDate,
            prCount: groupPRs.length,
            commitCount: totalCommits,
          },
        });

        // Create or update GlobalPRs (handles duplicates gracefully)
        const createdPRs = await Promise.all(
          groupPRs.map((pr) =>
            prisma.globalPR.upsert({
              where: {
                globalRepoId_prNumber: {
                  globalRepoId: globalRepo.id,
                  prNumber: pr.number,
                },
              },
              update: {
                updateId: update.id,
              },
              create: {
                globalRepoId: globalRepo.id,
                updateId: update.id,
                prNumber: pr.number,
                title: pr.title,
                body: pr.body,
                url: pr.url,
                mergedAt: new Date(pr.mergedAt),
                author: pr.author,
                labels: pr.labels ?? [],
                commits: pr.commits.map((c) => ({
                  sha: c.sha,
                  message: c.message,
                  url: c.url,
                })),
              },
            })
          )
        );

        // Add to response
        newUpdates.push({
          id: update.id,
          repoId: repoIdStr,
          title: update.title,
          summary: update.summary,
          category: update.category as Update['category'],
          significance: update.significance as Update['significance'],
          date: update.date.toISOString(),
          prCount: update.prCount,
          commitCount: update.commitCount,
          prs: createdPRs.map((pr) => buildPRInfo(pr)),
        });
      }
    }

    // Update lastFetchedAt
    await prisma.globalRepo.update({
      where: { id: globalRepo.id },
      data: { lastFetchedAt: new Date() },
    });

    console.log(`Finished fetching recent updates for ${repoIdStr}`);

    res.json({
      newUpdates,
      totalPRsFetched: prs.length,
      newPRsProcessed: newPRs.length,
      lastActivityAt: repoInfo.pushedAt,
    });
  } catch (error) {
    console.error('Error fetching recent updates:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get all feed data for the user
router.get('/feed/all', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    // Get user's repos with global repo data
    let userRepos = await prisma.userRepo.findMany({
      where: { userId: user.id },
      include: {
        globalRepo: {
          include: {
            updates: {
              orderBy: { date: 'desc' },
              include: { prs: true },
            },
            releases: { orderBy: { publishedAt: 'desc' } },
          },
        },
      },
    });

    // Refresh stale global repos if we have API keys
    if (openaiApiKey && userRepos.length > 0) {
      const github = new GitHubService(githubToken || undefined);
      const classifier = new ClassifierService(openaiApiKey);

      const staleRepos = userRepos.filter((ur) => {
        const gr = ur.globalRepo;
        return (
          !gr.lastFetchedAt ||
          Date.now() - gr.lastFetchedAt.getTime() > STALE_THRESHOLD_MS
        );
      });

      if (staleRepos.length > 0) {
        console.log(`Refreshing ${staleRepos.length} stale repos`);
        await Promise.all(
          staleRepos.map((ur) => {
            const sinceDate =
              ur.globalRepo.lastFetchedAt ||
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            return indexRepo(ur.globalRepo, github, classifier, sinceDate);
          })
        );

        // Reload data after refresh
        userRepos = await prisma.userRepo.findMany({
          where: { userId: user.id },
          include: {
            globalRepo: {
              include: {
                updates: {
                  orderBy: { date: 'desc' },
                  include: { prs: true },
                },
                releases: { orderBy: { publishedAt: 'desc' } },
              },
            },
          },
        });
      }
    }

    // Format response
    const repos = userRepos.map((ur) => ({
      id: ur.id,
      owner: ur.globalRepo.owner,
      name: ur.globalRepo.name,
      url: ur.globalRepo.url,
      description: ur.globalRepo.description,
      avatarUrl: ur.globalRepo.avatarUrl,
      displayName: ur.displayName,
      customColor: ur.customColor,
      feedSignificance: ur.feedSignificance,
      showReleases: ur.showReleases,
      lastFetchedAt: ur.globalRepo.lastFetchedAt?.toISOString() ?? null,
      createdAt: ur.createdAt.toISOString(),
    }));

    const updates = userRepos.flatMap((ur) => {
      const repoIdStr = `${ur.globalRepo.owner}/${ur.globalRepo.name}`;
      return ur.globalRepo.updates.map((u) => formatUpdate(u, repoIdStr));
    });

    const releases = userRepos.flatMap((ur) => {
      const repoIdStr = `${ur.globalRepo.owner}/${ur.globalRepo.name}`;
      return ur.globalRepo.releases
        .filter((r) => r.isClusterHead)
        .map((r) => formatRelease(r, repoIdStr));
    });

    res.json({ repos, updates, releases });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

export default router;
