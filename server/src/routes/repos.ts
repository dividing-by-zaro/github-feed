import { Router, Request, Response } from 'express';
import { createHash } from 'crypto';
import { prisma } from '../db.js';
import { GitHubService } from '../services/github.js';
import { ClassifierService } from '../services/classifier.js';
import { requireAuth, getUser } from '../auth/middleware.js';
import { validateDocsUrl, detectDocsUrl, validateUrlExists } from '../services/urlValidator.js';
import type { GlobalRepo } from '@prisma/client';
import type { Update, PRInfo, PRData } from '../types.js';

const router = Router();

// Stale threshold: 1 hour
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

// Generate deterministic hash from PR numbers for deduplication
function hashPRGroup(prNumbers: number[]): string {
  const sorted = [...prNumbers].sort((a, b) => a - b).join('-');
  return createHash('sha256').update(sorted).digest('hex');
}

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
    createdAt: Date;
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
    createdAt: u.createdAt.toISOString(),
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

// Progress callback type for indexing
type ProgressCallback = (progress: string) => Promise<void>;

// Index a repo (fetch from GitHub, group with AI, summarize)
async function indexRepo(
  globalRepo: GlobalRepo,
  github: GitHubService,
  classifier: ClassifierService,
  sinceDate: Date,
  onProgress?: ProgressCallback
) {
  const { owner, name } = globalRepo;
  const repoIdStr = `${owner}/${name}`;

  console.log(`Indexing ${repoIdStr} since ${sinceDate.toISOString()}`);

  // Update lastFetchedAt IMMEDIATELY to prevent concurrent indexing race conditions
  // Other requests will see this repo as "recently fetched" and skip
  await prisma.globalRepo.update({
    where: { id: globalRepo.id },
    data: { lastFetchedAt: new Date() },
  });

  // Fetch repo info
  if (onProgress) await onProgress('Fetching repository info...');
  const repoInfo = await github.getRepoInfo(owner, name);

  // Auto-detect docs URL if not already set
  let detectedDocsUrl: string | null = null;
  if (!globalRepo.docsUrl) {
    detectedDocsUrl = await detectDocsUrl(repoInfo.homepage, owner, name);
  }

  // Update GlobalRepo with latest info
  await prisma.globalRepo.update({
    where: { id: globalRepo.id },
    data: {
      description: repoInfo.description,
      avatarUrl: repoInfo.avatarUrl,
      starCount: repoInfo.starCount,
      homepage: repoInfo.homepage,
      ...(detectedDocsUrl && !globalRepo.docsUrl
        ? { docsUrl: detectedDocsUrl, docsValidatedAt: new Date() }
        : {}),
    },
  });

  // Fetch merged PRs
  if (onProgress) await onProgress('Fetching pull requests...');
  const prs = await github.getMergedPRs(owner, name, sinceDate);
  console.log(`Found ${prs.length} merged PRs`);

  // Fetch releases
  if (onProgress) await onProgress('Fetching releases...');
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
    if (onProgress) await onProgress(`Grouping ${newPRs.length} PRs...`);
    const grouping = await classifier.groupPRs(newPRs, repoInfo);
    console.log(`Created ${grouping.groups.length} semantic groups`);

    console.log('Step 2: Summarizing groups with LLM...');
    if (onProgress) await onProgress(`Summarizing ${grouping.groups.length} updates...`);
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

      // Generate hash for deduplication
      const groupHash = hashPRGroup(group.prNumbers);

      // Upsert the Update (prevents duplicates via unique constraint)
      const update = await prisma.globalUpdate.upsert({
        where: {
          globalRepoId_groupHash: {
            globalRepoId: globalRepo.id,
            groupHash,
          },
        },
        update: {}, // No update needed if exists
        create: {
          globalRepoId: globalRepo.id,
          groupHash,
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
    if (onProgress) await onProgress(`Processing ${newReleases.length} releases...`);
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

  console.log(`Finished indexing ${repoIdStr}`);
}

// Background indexing function - runs asynchronously, updates UserRepo status
async function indexRepoInBackground(
  userRepoId: string,
  globalRepoId: string,
  sinceDate: Date,
  needsIndexing: boolean
) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!openaiApiKey) {
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { status: 'failed', error: 'OpenAI API key not configured', progress: null },
    });
    return;
  }

  try {
    // Update status to indexing
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { status: 'indexing', progress: 'Starting...', error: null },
    });

    const globalRepo = await prisma.globalRepo.findUnique({
      where: { id: globalRepoId },
    });

    if (!globalRepo) {
      throw new Error('Global repo not found');
    }

    // Only run indexing if needed (new repo or stale)
    if (needsIndexing) {
      const github = new GitHubService(githubToken || undefined);
      const classifier = new ClassifierService(openaiApiKey);

      // Progress callback updates the UserRepo
      const onProgress = async (progress: string) => {
        await prisma.userRepo.update({
          where: { id: userRepoId },
          data: { progress },
        });
      };

      await indexRepo(globalRepo, github, classifier, sinceDate, onProgress);
    }

    // Mark as completed
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { status: 'completed', progress: null, error: null },
    });

    console.log(`Background indexing completed for UserRepo ${userRepoId}`);
  } catch (error) {
    console.error(`Background indexing failed for UserRepo ${userRepoId}:`, error);
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: null,
      },
    });
  }
}

// Background function for fetching older PRs
async function fetchOlderInBackground(userRepoId: string, globalRepoId: string) {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!openaiApiKey) {
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { status: 'failed', error: 'OpenAI API key not configured', progress: null },
    });
    return;
  }

  try {
    // Update status to indexing
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { status: 'indexing', progress: 'Fetching older PRs...', error: null },
    });

    const globalRepo = await prisma.globalRepo.findUnique({
      where: { id: globalRepoId },
    });

    if (!globalRepo) {
      throw new Error('Global repo not found');
    }

    const { owner, name } = globalRepo;
    const repoIdStr = `${owner}/${name}`;
    const github = new GitHubService(githubToken || undefined);
    const classifier = new ClassifierService(openaiApiKey);

    console.log(`Background: Fetching older PRs for ${repoIdStr}`);

    // Get repo info
    const repoInfo = await github.getRepoInfo(owner, name);

    // Find the oldest PR we have
    const oldestPR = await prisma.globalPR.findFirst({
      where: { globalRepoId: globalRepo.id },
      orderBy: { mergedAt: 'asc' },
      select: { mergedAt: true },
    });

    const beforeDate = oldestPR?.mergedAt ?? new Date();

    // Fetch older PRs
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { progress: 'Searching for older PRs...' },
    });

    const prs = await github.getOlderMergedPRs(owner, name, beforeDate, 10);
    console.log(`Found ${prs.length} older merged PRs`);

    // Get existing PR numbers
    const existingPRNumbers = new Set(
      (
        await prisma.globalPR.findMany({
          where: { globalRepoId: globalRepo.id },
          select: { prNumber: true },
        })
      ).map((p) => p.prNumber)
    );

    const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
    console.log(`${newPRs.length} new PRs to process`);

    if (newPRs.length > 0) {
      // Group PRs
      await prisma.userRepo.update({
        where: { id: userRepoId },
        data: { progress: `Grouping ${newPRs.length} PRs...` },
      });

      const grouping = await classifier.groupPRs(newPRs, repoInfo);

      // Summarize groups
      await prisma.userRepo.update({
        where: { id: userRepoId },
        data: { progress: `Summarizing ${grouping.groups.length} updates...` },
      });

      const summaries = await classifier.summarizeAllGroups(grouping, newPRs, repoInfo);

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
        const totalCommits = groupPRs.reduce((sum, p) => sum + p.commits.length, 0);

        // Generate hash for deduplication
        const groupHash = hashPRGroup(group.prNumbers);

        // Upsert the Update (prevents duplicates via unique constraint)
        const update = await prisma.globalUpdate.upsert({
          where: {
            globalRepoId_groupHash: {
              globalRepoId: globalRepo.id,
              groupHash,
            },
          },
          update: {}, // No update needed if exists
          create: {
            globalRepoId: globalRepo.id,
            groupHash,
            title: summary.title,
            summary: summary.summary,
            category: summary.category,
            significance: summary.significance,
            date: latestDate,
            prCount: groupPRs.length,
            commitCount: totalCommits,
          },
        });

        // Create GlobalPRs
        await Promise.all(
          groupPRs.map((pr) =>
            prisma.globalPR.upsert({
              where: {
                globalRepoId_prNumber: {
                  globalRepoId: globalRepo.id,
                  prNumber: pr.number,
                },
              },
              update: { updateId: update.id },
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
      }
    }

    // Update lastFetchedAt
    await prisma.globalRepo.update({
      where: { id: globalRepo.id },
      data: { lastFetchedAt: new Date() },
    });

    // Mark as completed
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: { status: 'completed', progress: null, error: null },
    });

    console.log(`Background: Finished fetching older PRs for ${repoIdStr}`);
  } catch (error) {
    console.error(`Background fetch older failed for UserRepo ${userRepoId}:`, error);
    await prisma.userRepo.update({
      where: { id: userRepoId },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        progress: null,
      },
    });
  }
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
      globalRepoId: ur.globalRepoId,
      owner: ur.globalRepo.owner,
      name: ur.globalRepo.name,
      url: ur.globalRepo.url,
      description: ur.globalRepo.description,
      avatarUrl: ur.globalRepo.avatarUrl,
      starCount: ur.globalRepo.starCount,
      docsUrl: ur.globalRepo.docsUrl,
      displayName: ur.displayName,
      customColor: ur.customColor,
      feedSignificance: ur.feedSignificance,
      showReleases: ur.showReleases,
      status: ur.status,
      progress: ur.progress,
      error: ur.error,
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

// Add a new repo - returns immediately, indexes in background
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { repoUrl, since } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const github = new GitHubService(githubToken || undefined);

    // Parse repo URL (validates format)
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

    // Determine if we need to index
    let needsIndexing = false;

    if (!globalRepo) {
      // Create new GlobalRepo - fetch basic info from GitHub (fast)
      console.log(`Creating new GlobalRepo for ${owner}/${name}`);
      const repoInfo = await github.getRepoInfo(owner, name);

      globalRepo = await prisma.globalRepo.create({
        data: {
          owner,
          name,
          url: repoUrl,
          description: repoInfo.description,
          avatarUrl: repoInfo.avatarUrl,
          starCount: repoInfo.starCount,
          subscriberCount: 1, // First subscriber
        },
      });
      needsIndexing = true;
    } else {
      // Increment subscriber count for existing repo
      await prisma.globalRepo.update({
        where: { id: globalRepo.id },
        data: { subscriberCount: { increment: 1 } },
      });
      // Check if stale
      const isStale =
        !globalRepo.lastFetchedAt ||
        Date.now() - globalRepo.lastFetchedAt.getTime() > STALE_THRESHOLD_MS;

      if (isStale) {
        console.log(`Will refresh stale GlobalRepo ${owner}/${name}`);
        needsIndexing = true;
      } else {
        console.log(`Using cached GlobalRepo ${owner}/${name}`);
      }
    }

    // Create UserRepo link with appropriate status
    const userRepo = await prisma.userRepo.create({
      data: {
        userId: user.id,
        globalRepoId: globalRepo.id,
        status: needsIndexing ? 'pending' : 'completed',
      },
      include: {
        globalRepo: true,
      },
    });

    // Fire background indexing (don't await!)
    if (needsIndexing) {
      const refreshSince = globalRepo.lastFetchedAt || sinceDate;
      indexRepoInBackground(userRepo.id, globalRepo.id, refreshSince, true).catch(
        (err) => console.error('Background indexing error:', err)
      );
    }

    // Return immediately with status
    res.json({
      id: userRepo.id,
      globalRepoId: userRepo.globalRepoId,
      owner: userRepo.globalRepo.owner,
      name: userRepo.globalRepo.name,
      url: userRepo.globalRepo.url,
      description: userRepo.globalRepo.description,
      avatarUrl: userRepo.globalRepo.avatarUrl,
      starCount: userRepo.globalRepo.starCount,
      docsUrl: userRepo.globalRepo.docsUrl,
      displayName: userRepo.displayName,
      customColor: userRepo.customColor,
      feedSignificance: userRepo.feedSignificance,
      showReleases: userRepo.showReleases,
      status: userRepo.status,
      progress: userRepo.progress,
      error: userRepo.error,
      lastFetchedAt: userRepo.globalRepo.lastFetchedAt?.toISOString() ?? null,
      createdAt: userRepo.createdAt.toISOString(),
      updates: [], // Empty initially - will be populated after indexing
      releases: [],
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
      globalRepoId: userRepo.globalRepo.id,
      owner: userRepo.globalRepo.owner,
      name: userRepo.globalRepo.name,
      url: userRepo.globalRepo.url,
      description: userRepo.globalRepo.description,
      avatarUrl: userRepo.globalRepo.avatarUrl,
      starCount: userRepo.globalRepo.starCount,
      docsUrl: userRepo.globalRepo.docsUrl,
      displayName: userRepo.displayName,
      customColor: userRepo.customColor,
      feedSignificance: userRepo.feedSignificance,
      showReleases: userRepo.showReleases,
      status: userRepo.status,
      progress: userRepo.progress,
      error: userRepo.error,
      lastFetchedAt: userRepo.globalRepo.lastFetchedAt?.toISOString() ?? null,
      createdAt: userRepo.createdAt.toISOString(),
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
      globalRepoId: updated!.globalRepo.id,
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

// Update docs URL for a GlobalRepo (community resource)
router.put('/:globalRepoId/docs', async (req: Request, res: Response) => {
  try {
    const { globalRepoId } = req.params;
    const { docsUrl } = req.body;

    // Validate URL (returns sanitized or null)
    const sanitized = validateDocsUrl(docsUrl);
    if (docsUrl && !sanitized) {
      return res.status(400).json({
        error: 'Invalid URL. Must be HTTPS and from an allowed documentation host.',
      });
    }

    // Verify URL exists
    if (sanitized) {
      const exists = await validateUrlExists(sanitized);
      if (!exists) {
        return res.status(400).json({ error: 'URL could not be reached.' });
      }
    }

    // Update GlobalRepo
    const updated = await prisma.globalRepo.update({
      where: { id: globalRepoId },
      data: {
        docsUrl: sanitized,
        docsValidatedAt: sanitized ? new Date() : null,
      },
    });

    return res.json({
      id: updated.id,
      docsUrl: updated.docsUrl,
      docsValidatedAt: updated.docsValidatedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Error updating docs URL:', error);
    res.status(500).json({ error: 'Failed to update documentation URL' });
  }
});

// Delete a repo (just removes user's subscription)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    // First find the userRepo to get the globalRepoId
    const userRepo = await prisma.userRepo.findFirst({
      where: { id, userId: user.id },
      select: { globalRepoId: true },
    });

    if (!userRepo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    // Delete the subscription
    await prisma.userRepo.delete({
      where: { id },
    });

    // Decrement subscriber count on the global repo
    await prisma.globalRepo.update({
      where: { id: userRepo.globalRepoId },
      data: { subscriberCount: { decrement: 1 } },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting repo:', error);
    res.status(500).json({ error: 'Failed to delete repo' });
  }
});

// Check for updates - fetch new updates since last fetch (incremental, runs in background)
router.post('/:id/refresh', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    // Find the user's repo
    const userRepo = await prisma.userRepo.findFirst({
      where: { id, userId: user.id },
      include: { globalRepo: true },
    });

    if (!userRepo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    // Check if already indexing
    if (userRepo.status === 'pending' || userRepo.status === 'indexing') {
      return res.status(409).json({ error: 'Already checking for updates' });
    }

    const globalRepo = userRepo.globalRepo;
    const sinceDate = globalRepo.lastFetchedAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    console.log(`Checking for updates: ${globalRepo.owner}/${globalRepo.name} since ${sinceDate.toISOString()}`);

    // Set status to pending immediately
    await prisma.userRepo.update({
      where: { id: userRepo.id },
      data: { status: 'pending', progress: 'Starting...', error: null },
    });

    // Fire background indexing (don't await!)
    indexRepoInBackground(userRepo.id, globalRepo.id, sinceDate, true).catch(
      (err) => console.error('Background refresh error:', err)
    );

    // Return immediately with updated status
    res.json({
      status: 'pending',
      message: 'Checking for updates in background',
    });
  } catch (error) {
    console.error('Error starting refresh:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start refresh',
    });
  }
});

// Fetch older updates for a repo - returns immediately, runs in background
router.post('/:id/fetch-recent', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    // Find the user's repo
    const userRepo = await prisma.userRepo.findFirst({
      where: { id, userId: user.id },
      include: { globalRepo: true },
    });

    if (!userRepo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    // Check if already indexing
    if (userRepo.status === 'pending' || userRepo.status === 'indexing') {
      return res.status(409).json({ error: 'Already fetching updates for this repo' });
    }

    // Set status to pending immediately
    await prisma.userRepo.update({
      where: { id: userRepo.id },
      data: { status: 'pending', progress: 'Starting...', error: null },
    });

    // Fire background task (don't await!)
    fetchOlderInBackground(userRepo.id, userRepo.globalRepoId).catch(
      (err) => console.error('Background fetch older error:', err)
    );

    // Return immediately with updated status
    res.json({
      status: 'pending',
      message: 'Fetching older updates in background',
    });
  } catch (error) {
    console.error('Error starting fetch recent:', error);
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

    // Get user's repos with global repo data
    const userRepos = await prisma.userRepo.findMany({
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

    // Identify stale repos that need background refresh
    // Only refresh if we have API keys and repo is not already indexing
    const staleReposToRefresh: typeof userRepos = [];
    if (openaiApiKey && userRepos.length > 0) {
      for (const ur of userRepos) {
        const gr = ur.globalRepo;
        const isStale =
          !gr.lastFetchedAt ||
          Date.now() - gr.lastFetchedAt.getTime() > STALE_THRESHOLD_MS;
        const isAlreadyIndexing =
          ur.status === 'pending' || ur.status === 'indexing';

        if (isStale && !isAlreadyIndexing) {
          staleReposToRefresh.push(ur);
        }
      }
    }

    // Mark stale repos as indexing and fire background refresh
    if (staleReposToRefresh.length > 0) {
      console.log(`Background refreshing ${staleReposToRefresh.length} stale repos`);

      // Update status to indexing for all stale repos
      await prisma.userRepo.updateMany({
        where: { id: { in: staleReposToRefresh.map((ur) => ur.id) } },
        data: { status: 'indexing', progress: 'Refreshing...', error: null },
      });

      // Fire background tasks (don't await!)
      for (const ur of staleReposToRefresh) {
        const sinceDate =
          ur.globalRepo.lastFetchedAt ||
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Update local status so response reflects indexing state
        ur.status = 'indexing';
        ur.progress = 'Refreshing...';
        ur.error = null;

        indexRepoInBackground(ur.id, ur.globalRepoId, sinceDate, true).catch(
          (err) => console.error(`Background stale refresh error for ${ur.globalRepo.owner}/${ur.globalRepo.name}:`, err)
        );
      }
    }

    // Format response - return cached data immediately
    const repos = userRepos.map((ur) => ({
      id: ur.id,
      globalRepoId: ur.globalRepoId,
      owner: ur.globalRepo.owner,
      name: ur.globalRepo.name,
      url: ur.globalRepo.url,
      description: ur.globalRepo.description,
      avatarUrl: ur.globalRepo.avatarUrl,
      starCount: ur.globalRepo.starCount,
      docsUrl: ur.globalRepo.docsUrl,
      displayName: ur.displayName,
      customColor: ur.customColor,
      feedSignificance: ur.feedSignificance,
      showReleases: ur.showReleases,
      status: ur.status,
      progress: ur.progress,
      error: ur.error,
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
