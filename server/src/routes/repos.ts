import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { GitHubService } from '../services/github.js';
import { ClassifierService } from '../services/classifier.js';
import { requireAuth, getUser } from '../auth/middleware.js';
import type { Prisma, GlobalRepo } from '@prisma/client';
import type {
  FeedGroup,
  Change,
  PRData,
  ClassifiedChange,
} from '../types.js';

const router = Router();

// Stale threshold: 1 hour
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

// Build a Change from a PR and its classification
function buildChange(pr: PRData, classification: ClassifiedChange): Change {
  return {
    id: `pr-${pr.number}`,
    category: classification.category,
    significance: classification.significance,
    title: classification.title,
    summary: classification.summary,
    commits: pr.commits.map((c) => ({
      sha: c.sha.substring(0, 7),
      message: c.message.split('\n')[0],
      url: c.url,
    })),
  };
}

// Group PRs by date if 2+ PRs on same day
function groupPRsByDate(
  prs: PRData[],
  classifications: Map<number, ClassifiedChange | null>,
  repoId: string
): FeedGroup[] {
  const feedGroups: FeedGroup[] = [];
  const prsByDate = new Map<string, PRData[]>();

  for (const pr of prs) {
    const dateKey = pr.mergedAt.split('T')[0];
    if (!prsByDate.has(dateKey)) {
      prsByDate.set(dateKey, []);
    }
    prsByDate.get(dateKey)!.push(pr);
  }

  for (const [dateKey, datePRs] of prsByDate) {
    if (datePRs.length >= 2) {
      const changes: Change[] = [];
      for (const pr of datePRs) {
        const classification = classifications.get(pr.number);
        if (classification) {
          changes.push(buildChange(pr, classification));
        }
      }

      if (changes.length > 0) {
        feedGroups.push({
          id: `daily-${dateKey}`,
          repoId,
          type: 'daily',
          title: `Changes on ${new Date(dateKey).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}`,
          date: dateKey,
          changes,
        });
      }
    } else {
      for (const pr of datePRs) {
        const classification = classifications.get(pr.number);
        if (classification) {
          feedGroups.push({
            id: `pr-${pr.number}`,
            repoId,
            type: 'pr',
            title: pr.title,
            prNumber: pr.number,
            prUrl: pr.url,
            date: pr.mergedAt,
            changes: [buildChange(pr, classification)],
          });
        }
      }
    }
  }

  return feedGroups.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// Index a repo (fetch from GitHub and classify with AI)
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

  // Get existing PR numbers to avoid re-classifying
  const existingPRNumbers = new Set<number>();
  const existingFeedGroups = await prisma.globalFeedGroup.findMany({
    where: { globalRepoId: globalRepo.id },
    select: { prNumber: true, changes: true },
  });
  for (const fg of existingFeedGroups) {
    if (fg.prNumber) {
      existingPRNumbers.add(fg.prNumber);
    }
    const changes = fg.changes as unknown as Change[];
    for (const change of changes) {
      const prMatch = change.id.match(/^pr-(\d+)$/);
      if (prMatch) {
        existingPRNumbers.add(parseInt(prMatch[1], 10));
      }
    }
  }

  // Filter to new PRs only
  const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
  console.log(`${newPRs.length} new PRs to classify`);

  // Get existing release tags
  const existingTags = new Set(
    (await prisma.globalRelease.findMany({
      where: { globalRepoId: globalRepo.id },
      select: { tagName: true },
    })).map((r) => r.tagName)
  );

  const newReleases = releases.filter((r) => !existingTags.has(r.tagName));
  console.log(`${newReleases.length} new releases to summarize`);

  // Classify new PRs
  if (newPRs.length > 0) {
    console.log('Classifying PRs with OpenAI...');
    const classifications = await classifier.classifyMultiplePRs(newPRs, repoInfo);
    const newFeedGroups = groupPRsByDate(newPRs, classifications, repoIdStr);

    if (newFeedGroups.length > 0) {
      await prisma.globalFeedGroup.createMany({
        data: newFeedGroups.map((fg) => ({
          globalRepoId: globalRepo.id,
          type: fg.type,
          title: fg.title,
          prNumber: fg.prNumber,
          prUrl: fg.prUrl,
          date: new Date(fg.date),
          changes: fg.changes as unknown as Prisma.InputJsonValue,
        })),
      });
    }
  }

  // Summarize new releases
  if (newReleases.length > 0) {
    console.log('Summarizing releases with OpenAI...');
    const releaseSummaries = await classifier.summarizeMultipleReleases(newReleases, repoInfo);
    await prisma.globalRelease.createMany({
      data: newReleases.map((r) => ({
        globalRepoId: globalRepo.id,
        title: r.title,
        tagName: r.tagName,
        url: r.url,
        date: new Date(r.date),
        body: r.body,
        summary: releaseSummaries.get(r.tagName) ?? null,
      })),
    });
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
    const query = (req.query.q as string || '').trim();

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
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
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
      const isStale = !globalRepo.lastFetchedAt ||
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
            feedGroups: { orderBy: { date: 'desc' } },
            releases: { orderBy: { date: 'desc' } },
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
      feedGroups: userRepo.globalRepo.feedGroups.map((fg) => ({
        ...fg,
        repoId: repoIdStr,
        changes: fg.changes as unknown as Change[],
      })),
      releases: userRepo.globalRepo.releases.map((r) => ({
        ...r,
        repoId: repoIdStr,
        type: 'release' as const,
      })),
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
            feedGroups: { orderBy: { date: 'desc' } },
            releases: { orderBy: { date: 'desc' } },
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
      feedGroups: userRepo.globalRepo.feedGroups.map((fg) => ({
        ...fg,
        repoId: repoIdStr,
        changes: fg.changes as unknown as Change[],
      })),
      releases: userRepo.globalRepo.releases.map((r) => ({
        ...r,
        repoId: repoIdStr,
        type: 'release' as const,
      })),
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
    const { displayName, customColor, feedSignificance, showReleases } = req.body;

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

// Fetch recent updates for a repo (last 10 PRs regardless of date)
router.post('/:id/fetch-recent', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
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

    console.log(`Fetching recent PRs for ${repoIdStr}`);

    // Get repo info (includes pushedAt - last activity on GitHub)
    const repoInfo = await github.getRepoInfo(owner, name);

    // Fetch last 10 merged PRs (no date filter)
    const prs = await github.getRecentMergedPRs(owner, name, 10);
    console.log(`Found ${prs.length} recent merged PRs`);

    // Get existing PR numbers to avoid re-classifying
    const existingPRNumbers = new Set<number>();
    const existingFeedGroups = await prisma.globalFeedGroup.findMany({
      where: { globalRepoId: globalRepo.id },
      select: { prNumber: true, changes: true },
    });
    for (const fg of existingFeedGroups) {
      if (fg.prNumber) {
        existingPRNumbers.add(fg.prNumber);
      }
      const changes = fg.changes as unknown as Change[];
      for (const change of changes) {
        const prMatch = change.id.match(/^pr-(\d+)$/);
        if (prMatch) {
          existingPRNumbers.add(parseInt(prMatch[1], 10));
        }
      }
    }

    // Filter to new PRs only
    const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
    console.log(`${newPRs.length} new PRs to classify`);

    let newFeedGroups: FeedGroup[] = [];

    if (newPRs.length > 0) {
      // Classify new PRs
      console.log('Classifying PRs with OpenAI...');
      const classifications = await classifier.classifyMultiplePRs(newPRs, repoInfo);
      newFeedGroups = groupPRsByDate(newPRs, classifications, repoIdStr);

      if (newFeedGroups.length > 0) {
        await prisma.globalFeedGroup.createMany({
          data: newFeedGroups.map((fg) => ({
            globalRepoId: globalRepo.id,
            type: fg.type,
            title: fg.title,
            prNumber: fg.prNumber,
            prUrl: fg.prUrl,
            date: new Date(fg.date),
            changes: fg.changes as unknown as Prisma.InputJsonValue,
          })),
        });
      }
    }

    // Update lastFetchedAt
    await prisma.globalRepo.update({
      where: { id: globalRepo.id },
      data: { lastFetchedAt: new Date() },
    });

    console.log(`Finished fetching recent updates for ${repoIdStr}`);

    // Return the new feed groups (empty array if none found)
    res.json({
      newFeedGroups,
      totalPRsFetched: prs.length,
      newPRsClassified: newPRs.length,
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
            feedGroups: { orderBy: { date: 'desc' } },
            releases: { orderBy: { date: 'desc' } },
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
        return !gr.lastFetchedAt ||
          Date.now() - gr.lastFetchedAt.getTime() > STALE_THRESHOLD_MS;
      });

      if (staleRepos.length > 0) {
        console.log(`Refreshing ${staleRepos.length} stale repos`);
        await Promise.all(
          staleRepos.map((ur) => {
            const sinceDate = ur.globalRepo.lastFetchedAt ||
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
                feedGroups: { orderBy: { date: 'desc' } },
                releases: { orderBy: { date: 'desc' } },
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

    const feedGroups = userRepos.flatMap((ur) => {
      const repoIdStr = `${ur.globalRepo.owner}/${ur.globalRepo.name}`;
      return ur.globalRepo.feedGroups.map((fg) => ({
        ...fg,
        repoId: repoIdStr,
        changes: fg.changes as unknown as Change[],
      }));
    });

    const releases = userRepos.flatMap((ur) => {
      const repoIdStr = `${ur.globalRepo.owner}/${ur.globalRepo.name}`;
      return ur.globalRepo.releases.map((r) => ({
        ...r,
        repoId: repoIdStr,
        type: 'release' as const,
      }));
    });

    res.json({ repos, feedGroups, releases });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

export default router;
