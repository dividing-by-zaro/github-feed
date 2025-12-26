import { Router, Request, Response } from 'express';
import { GitHubService } from '../services/github.js';
import { ClassifierService } from '../services/classifier.js';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
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
      message: c.message.split('\n')[0], // First line only
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

  // Group PRs by date
  for (const pr of prs) {
    const dateKey = pr.mergedAt.split('T')[0]; // YYYY-MM-DD
    if (!prsByDate.has(dateKey)) {
      prsByDate.set(dateKey, []);
    }
    prsByDate.get(dateKey)!.push(pr);
  }

  // Create feed groups
  for (const [dateKey, datePRs] of prsByDate) {
    if (datePRs.length >= 2) {
      // Daily batch - multiple PRs on same day
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
      // Single PR per day - show as individual PR
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

  // Sort by date, newest first
  return feedGroups.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { repoUrl, openaiApiKey, githubToken, since } = req.body as AnalyzeRequest;

    if (!repoUrl) {
      return res.status(400).json({ error: 'repoUrl is required' });
    }

    if (!openaiApiKey) {
      return res.status(400).json({ error: 'openaiApiKey is required' });
    }

    // Calculate since date (default 30 days)
    const sinceDate = since
      ? new Date(since)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const github = new GitHubService(githubToken);
    const classifier = new ClassifierService(openaiApiKey);

    // Parse repo URL
    const { owner, name } = github.parseRepoUrl(repoUrl);
    const repoId = `${owner}/${name}`;

    console.log(`Analyzing ${repoId} since ${sinceDate.toISOString()}`);

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
    const feedGroups = groupPRsByDate(prs, classifiedChanges, repoId);
    console.log(`Created ${feedGroups.length} feed groups`);

    const response: AnalyzeResponse = {
      repo: repoInfo,
      feedGroups,
      releases,
    };

    res.json(response);
  } catch (error) {
    console.error('Error analyzing repo:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
