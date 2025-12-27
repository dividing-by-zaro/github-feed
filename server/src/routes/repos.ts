import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { GitHubService } from '../services/github.js';
import { ClassifierService } from '../services/classifier.js';
import { requireAuth, getUser } from '../auth/middleware.js';
import type { Prisma } from '@prisma/client';
import type {
  FeedGroup,
  Change,
  PRData,
  ClassifiedChange,
} from '../types.js';

const router = Router();

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

// ===== Authenticated Routes =====
router.use(requireAuth);

// List user's repos
router.get('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const repos = await prisma.repo.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(repos);
  } catch (error) {
    console.error('Error fetching repos:', error);
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
});

// Add a new repo (and analyze it)
router.post('/', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { repoUrl, since } = req.body;

    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    // Use API keys from environment variables
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured on server' });
    }

    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const github = new GitHubService(githubToken || undefined);
    const classifier = new ClassifierService(openaiApiKey);

    // Parse repo URL
    const { owner, name } = github.parseRepoUrl(repoUrl);
    const repoIdStr = `${owner}/${name}`;

    // Check if already exists
    const existing = await prisma.repo.findUnique({
      where: {
        userId_owner_name: {
          userId: user.id,
          owner,
          name,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'This repo is already being tracked' });
    }

    console.log(`Analyzing ${repoIdStr} since ${sinceDate.toISOString()}`);

    // Fetch repo info
    const repoInfo = await github.getRepoInfo(owner, name);
    console.log(`Found repo: ${repoInfo.name} (${repoInfo.defaultBranch})`);

    // Fetch merged PRs
    const prs = await github.getMergedPRs(owner, name, sinceDate);
    console.log(`Found ${prs.length} merged PRs`);

    // Fetch releases
    const releases = await github.getReleases(owner, name, sinceDate);
    console.log(`Found ${releases.length} releases`);

    // Classify PRs
    console.log('Classifying PRs with OpenAI...');
    const classifiedChanges = await classifier.classifyMultiplePRs(prs, repoInfo);

    // Group into feed groups
    const feedGroups = groupPRsByDate(prs, classifiedChanges, repoIdStr);
    console.log(`Created ${feedGroups.length} feed groups`);

    // Save to database
    const repo = await prisma.repo.create({
      data: {
        owner,
        name,
        url: repoUrl,
        description: repoInfo.description,
        avatarUrl: repoInfo.avatarUrl,
        userId: user.id,
        lastFetchedAt: new Date(),
        feedGroups: {
          create: feedGroups.map((fg) => ({
            type: fg.type,
            title: fg.title,
            prNumber: fg.prNumber,
            prUrl: fg.prUrl,
            date: new Date(fg.date),
            changes: fg.changes as unknown as Prisma.InputJsonValue,
          })),
        },
        releases: {
          create: releases.map((r) => ({
            title: r.title,
            tagName: r.tagName,
            url: r.url,
            date: new Date(r.date),
            body: r.body,
          })),
        },
      },
      include: {
        feedGroups: true,
        releases: true,
      },
    });

    res.json(repo);
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

    const repo = await prisma.repo.findFirst({
      where: { id, userId: user.id },
      include: {
        feedGroups: {
          orderBy: { date: 'desc' },
        },
        releases: {
          orderBy: { date: 'desc' },
        },
      },
    });

    if (!repo) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    res.json(repo);
  } catch (error) {
    console.error('Error fetching repo:', error);
    res.status(500).json({ error: 'Failed to fetch repo' });
  }
});

// Update repo settings
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;
    const { displayName, customColor, feedSignificance } = req.body;

    const repo = await prisma.repo.updateMany({
      where: { id, userId: user.id },
      data: {
        displayName,
        customColor,
        feedSignificance,
      },
    });

    if (repo.count === 0) {
      return res.status(404).json({ error: 'Repo not found' });
    }

    const updated = await prisma.repo.findUnique({ where: { id } });
    res.json(updated);
  } catch (error) {
    console.error('Error updating repo:', error);
    res.status(500).json({ error: 'Failed to update repo' });
  }
});

// Delete a repo
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);
    const { id } = req.params;

    const result = await prisma.repo.deleteMany({
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

// Refresh a single repo if stale (returns true if refreshed)
async function refreshRepoIfStale(
  repo: { id: string; owner: string; name: string; lastFetchedAt: Date | null },
  github: GitHubService,
  classifier: ClassifierService
): Promise<boolean> {
  const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
  const now = Date.now();

  // Check if repo needs refresh
  if (repo.lastFetchedAt && now - repo.lastFetchedAt.getTime() < STALE_THRESHOLD_MS) {
    return false;
  }

  console.log(`Refreshing stale repo: ${repo.owner}/${repo.name}`);

  try {
    // Get the most recent feed group and release dates to use as "since"
    const [latestFeedGroup, latestRelease] = await Promise.all([
      prisma.feedGroup.findFirst({
        where: { repoId: repo.id },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      prisma.release.findFirst({
        where: { repoId: repo.id },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    // Use the most recent date, or 30 days ago if no data
    const dates = [latestFeedGroup?.date, latestRelease?.date].filter(Boolean) as Date[];
    const sinceDate = dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : new Date(now - 30 * 24 * 60 * 60 * 1000);

    // Fetch repo info
    const repoInfo = await github.getRepoInfo(repo.owner, repo.name);

    // Fetch new PRs and releases
    const [prs, releases] = await Promise.all([
      github.getMergedPRs(repo.owner, repo.name, sinceDate),
      github.getReleases(repo.owner, repo.name, sinceDate),
    ]);

    // Filter out PRs we already have (check by PR number in existing feed groups)
    const existingPRNumbers = new Set<number>();
    const existingFeedGroups = await prisma.feedGroup.findMany({
      where: { repoId: repo.id },
      select: { prNumber: true, changes: true },
    });
    for (const fg of existingFeedGroups) {
      if (fg.prNumber) {
        existingPRNumbers.add(fg.prNumber);
      }
      // Also check changes for PR IDs in daily batches
      const changes = fg.changes as unknown as Change[];
      for (const change of changes) {
        const prMatch = change.id.match(/^pr-(\d+)$/);
        if (prMatch) {
          existingPRNumbers.add(parseInt(prMatch[1], 10));
        }
      }
    }

    const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
    console.log(`Found ${newPRs.length} new PRs for ${repo.owner}/${repo.name}`);

    // Filter out releases we already have (check by tagName)
    const existingTags = new Set(
      (await prisma.release.findMany({
        where: { repoId: repo.id },
        select: { tagName: true },
      })).map((r) => r.tagName)
    );

    const newReleases = releases.filter((r) => !existingTags.has(r.tagName));
    console.log(`Found ${newReleases.length} new releases for ${repo.owner}/${repo.name}`);

    // Classify new PRs if any
    if (newPRs.length > 0) {
      const classifications = await classifier.classifyMultiplePRs(newPRs, repoInfo);
      const repoIdStr = `${repo.owner}/${repo.name}`;
      const newFeedGroups = groupPRsByDate(newPRs, classifications, repoIdStr);

      // Save new feed groups
      if (newFeedGroups.length > 0) {
        await prisma.feedGroup.createMany({
          data: newFeedGroups.map((fg) => ({
            repoId: repo.id,
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

    // Save new releases
    if (newReleases.length > 0) {
      await prisma.release.createMany({
        data: newReleases.map((r) => ({
          repoId: repo.id,
          title: r.title,
          tagName: r.tagName,
          url: r.url,
          date: new Date(r.date),
          body: r.body,
        })),
      });
    }

    // Update lastFetchedAt
    await prisma.repo.update({
      where: { id: repo.id },
      data: { lastFetchedAt: new Date() },
    });

    return newPRs.length > 0 || newReleases.length > 0;
  } catch (error) {
    console.error(`Error refreshing repo ${repo.owner}/${repo.name}:`, error);
    // Still update lastFetchedAt to prevent hammering on errors
    await prisma.repo.update({
      where: { id: repo.id },
      data: { lastFetchedAt: new Date() },
    });
    return false;
  }
}

// Get all feed data for the user
router.get('/feed/all', async (req: Request, res: Response) => {
  try {
    const user = getUser(req);

    // Get API keys
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const githubToken = process.env.GITHUB_TOKEN;

    // First, get repos to check for stale ones
    let repos = await prisma.repo.findMany({
      where: { userId: user.id },
      include: {
        feedGroups: {
          orderBy: { date: 'desc' },
        },
        releases: {
          orderBy: { date: 'desc' },
        },
      },
    });

    // Refresh stale repos if we have API keys
    if (openaiApiKey && repos.length > 0) {
      const github = new GitHubService(githubToken || undefined);
      const classifier = new ClassifierService(openaiApiKey);

      // Refresh stale repos (in parallel with limit)
      const refreshPromises = repos.map((repo) =>
        refreshRepoIfStale(repo, github, classifier)
      );
      const refreshResults = await Promise.all(refreshPromises);

      // If any repos were refreshed, re-fetch the data
      if (refreshResults.some((r) => r)) {
        repos = await prisma.repo.findMany({
          where: { userId: user.id },
          include: {
            feedGroups: {
              orderBy: { date: 'desc' },
            },
            releases: {
              orderBy: { date: 'desc' },
            },
          },
        });
      }
    }

    // Flatten and format the response
    const feedGroups = repos.flatMap((repo) =>
      repo.feedGroups.map((fg) => ({
        ...fg,
        repoId: `${repo.owner}/${repo.name}`,
        changes: fg.changes as unknown as Change[],
      }))
    );

    const releases = repos.flatMap((repo) =>
      repo.releases.map((r) => ({
        ...r,
        repoId: `${repo.owner}/${repo.name}`,
        type: 'release' as const,
      }))
    );

    res.json({
      repos: repos.map((r) => ({
        id: r.id,
        owner: r.owner,
        name: r.name,
        url: r.url,
        description: r.description,
        avatarUrl: r.avatarUrl,
        displayName: r.displayName,
        customColor: r.customColor,
        feedSignificance: r.feedSignificance,
      })),
      feedGroups,
      releases,
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

export default router;
