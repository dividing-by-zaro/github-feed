import cron from 'node-cron';
import { prisma } from '../db.js';
import { GitHubService } from './github.js';
import { ClassifierService } from './classifier.js';
import { createHash } from 'crypto';
import type { GlobalRepo } from '@prisma/client';
import type { PRData } from '../types.js';

// Maximum number of repos to sweep per run
const MAX_REPOS_PER_SWEEP = 100;

// Generate deterministic hash from PR numbers for deduplication
function hashPRGroup(prNumbers: number[]): string {
  const sorted = [...prNumbers].sort((a, b) => a - b).join('-');
  return createHash('sha256').update(sorted).digest('hex');
}

// Index a single repo (fetch new PRs, classify, save)
async function indexRepoForSweep(
  globalRepo: GlobalRepo,
  github: GitHubService,
  classifier: ClassifierService
) {
  const { owner, name, id: globalRepoId } = globalRepo;
  const repoIdStr = `${owner}/${name}`;
  const sinceDate = globalRepo.lastFetchedAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  console.log(`[Sweep] Indexing ${repoIdStr} since ${sinceDate.toISOString()}`);

  // Update lastFetchedAt immediately to prevent concurrent processing
  await prisma.globalRepo.update({
    where: { id: globalRepoId },
    data: { lastFetchedAt: new Date() },
  });

  // Fetch repo info
  const repoInfo = await github.getRepoInfo(owner, name);

  // Update GlobalRepo with latest info (including star count)
  await prisma.globalRepo.update({
    where: { id: globalRepoId },
    data: {
      description: repoInfo.description,
      avatarUrl: repoInfo.avatarUrl,
      starCount: repoInfo.starCount,
    },
  });

  // Fetch merged PRs since last fetch
  const prs = await github.getMergedPRs(owner, name, sinceDate);
  console.log(`[Sweep] Found ${prs.length} merged PRs for ${repoIdStr}`);

  // Fetch releases
  const releases = await github.getReleases(owner, name, sinceDate);
  console.log(`[Sweep] Found ${releases.length} releases for ${repoIdStr}`);

  // Get existing PR numbers to avoid re-processing
  const existingPRNumbers = new Set(
    (
      await prisma.globalPR.findMany({
        where: { globalRepoId },
        select: { prNumber: true },
      })
    ).map((p) => p.prNumber)
  );

  // Filter to new PRs only
  const newPRs = prs.filter((pr) => !existingPRNumbers.has(pr.number));
  console.log(`[Sweep] ${newPRs.length} new PRs to process for ${repoIdStr}`);

  // Get existing release tags
  const existingTags = new Set(
    (
      await prisma.globalRelease.findMany({
        where: { globalRepoId },
        select: { tagName: true },
      })
    ).map((r) => r.tagName)
  );

  const newReleases = releases.filter((r) => !existingTags.has(r.tagName));
  console.log(`[Sweep] ${newReleases.length} new releases to process for ${repoIdStr}`);

  // Process new PRs with two-stage pipeline
  if (newPRs.length > 0) {
    console.log(`[Sweep] Grouping PRs for ${repoIdStr}...`);
    const grouping = await classifier.groupPRs(newPRs, repoInfo);
    console.log(`[Sweep] Created ${grouping.groups.length} semantic groups for ${repoIdStr}`);

    console.log(`[Sweep] Summarizing groups for ${repoIdStr}...`);
    const summaries = await classifier.summarizeAllGroups(grouping, newPRs, repoInfo);

    // Create GlobalPRs and GlobalUpdates
    const prsById = new Map(newPRs.map((pr) => [pr.number, pr]));

    for (const group of grouping.groups) {
      const key = group.prNumbers.sort().join('-');
      const summary = summaries.get(key);

      if (!summary) {
        console.error(`[Sweep] No summary for group ${key}`);
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
      const totalCommits = groupPRs.reduce((sum, p) => sum + p.commits.length, 0);

      // Generate hash for deduplication
      const groupHash = hashPRGroup(group.prNumbers);

      // Upsert the Update (prevents duplicates via unique constraint)
      const update = await prisma.globalUpdate.upsert({
        where: {
          globalRepoId_groupHash: {
            globalRepoId,
            groupHash,
          },
        },
        update: {}, // No update needed if exists
        create: {
          globalRepoId,
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
          globalRepoId,
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

      console.log(`[Sweep] Created update "${summary.title}" with ${groupPRs.length} PRs`);
    }
  }

  // Process new releases
  if (newReleases.length > 0) {
    console.log(`[Sweep] Processing releases for ${repoIdStr}...`);
    const { processed } = await classifier.processReleases(newReleases, repoInfo);

    await prisma.globalRelease.createMany({
      data: processed.map((p) => ({
        globalRepoId,
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

    console.log(`[Sweep] Created ${processed.length} releases for ${repoIdStr}`);
  }

  console.log(`[Sweep] Finished indexing ${repoIdStr}`);
}

// Run the sweep - fetch updates for top repos by subscriber count
async function runSweep() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;

  if (!openaiApiKey) {
    console.log('[Sweep] Skipping - OpenAI API key not configured');
    return;
  }

  console.log('[Sweep] Starting daily sweep...');
  const startTime = Date.now();

  try {
    // Get repos with at least one subscriber, ordered by subscriber count
    const eligibleRepos = await prisma.globalRepo.findMany({
      where: {
        subscriberCount: { gt: 0 },
      },
      orderBy: {
        subscriberCount: 'desc',
      },
      take: MAX_REPOS_PER_SWEEP,
    });

    console.log(`[Sweep] Found ${eligibleRepos.length} eligible repos`);

    if (eligibleRepos.length === 0) {
      console.log('[Sweep] No repos to sweep');
      return;
    }

    const github = new GitHubService(githubToken || undefined);
    const classifier = new ClassifierService(openaiApiKey);

    let successCount = 0;
    let errorCount = 0;

    for (const repo of eligibleRepos) {
      try {
        await indexRepoForSweep(repo, github, classifier);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error(`[Sweep] Error indexing ${repo.owner}/${repo.name}:`, error);
        // Continue with next repo - don't let one failure stop the sweep
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log(`[Sweep] Completed in ${duration}s - ${successCount} success, ${errorCount} errors`);
  } catch (error) {
    console.error('[Sweep] Fatal error during sweep:', error);
  }
}

// Backfill subscriber counts for existing repos
export async function backfillSubscriberCounts() {
  console.log('[Sweep] Backfilling subscriber counts...');

  const counts = await prisma.userRepo.groupBy({
    by: ['globalRepoId'],
    _count: { id: true },
  });

  for (const { globalRepoId, _count } of counts) {
    await prisma.globalRepo.update({
      where: { id: globalRepoId },
      data: { subscriberCount: _count.id },
    });
  }

  console.log(`[Sweep] Backfilled subscriber counts for ${counts.length} repos`);
}

// Initialize the sweep scheduler
export function initializeSweepScheduler() {
  // Run daily at 6am UTC
  // Cron format: minute hour day-of-month month day-of-week
  cron.schedule('0 6 * * *', () => {
    console.log('[Sweep] Triggered by cron schedule');
    runSweep();
  }, {
    timezone: 'UTC',
  });

  console.log('[Sweep] Scheduler initialized - will run daily at 6:00 UTC');

  // Run backfill on startup to ensure counts are correct
  backfillSubscriberCounts().catch((err) => {
    console.error('[Sweep] Error during startup backfill:', err);
  });
}

// Export for manual triggering (useful for testing)
export { runSweep };
