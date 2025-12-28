import OpenAI from 'openai';
import type {
  PRData,
  RepoInfo,
  ReleaseData,
  PRGroupingResult,
  GroupSummaryResult,
  ReleaseType,
  ReleaseCluster,
} from '../types.js';

// JSON Schema for PR grouping (Step 1)
const PR_GROUPING_SCHEMA = {
  name: 'pr_grouping',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            prNumbers: {
              type: 'array',
              items: { type: 'number' },
            },
            reason: { type: 'string' },
          },
          required: ['prNumbers', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['groups'],
    additionalProperties: false,
  },
} as const;

// JSON Schema for group summarization (Step 2)
const GROUP_SUMMARY_SCHEMA = {
  name: 'group_summary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      category: {
        type: 'string',
        enum: [
          'feature',
          'enhancement',
          'bugfix',
          'breaking',
          'deprecation',
          'performance',
          'security',
          'docs',
        ],
      },
      significance: {
        type: 'string',
        enum: ['major', 'minor', 'patch', 'internal'],
      },
    },
    required: ['title', 'summary', 'category', 'significance'],
    additionalProperties: false,
  },
} as const;

// JSON Schema for release cluster summary
const RELEASE_CLUSTER_SCHEMA = {
  name: 'release_cluster_summary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      significance: {
        type: 'string',
        enum: ['major', 'minor', 'patch', 'internal'],
      },
    },
    required: ['title', 'summary', 'significance'],
    additionalProperties: false,
  },
} as const;

// JSON Schema for single release summary
const RELEASE_SUMMARY_SCHEMA = {
  name: 'release_summary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
    },
    required: ['summary'],
    additionalProperties: false,
  },
} as const;

export class ClassifierService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  // ============ RELEASE TYPE DETECTION (Heuristic) ============

  /**
   * Classify release type based on tag name patterns
   */
  classifyReleaseType(tagName: string): ReleaseType {
    const normalized = tagName.toLowerCase();

    // Nightly builds
    if (/-nightly|\.nightly\.|nightly\d|canary/.test(normalized)) {
      return 'nightly';
    }

    // Preview/pre-release versions
    if (/-preview|-alpha|-beta|-rc\.?\d*|\.dev\d*|-dev\./.test(normalized)) {
      return 'preview';
    }

    // Stable release (semantic versioning: X.Y.Z)
    const cleanTag = tagName.replace(/^v/, '');
    if (/^\d+\.\d+\.\d+$/.test(cleanTag)) {
      return 'stable';
    }

    // Patch release (has patch indicators or is a point release)
    if (/patch|hotfix|\.\d+\.\d+\.\d+/.test(normalized)) {
      return 'patch';
    }

    // Default to stable for other formats
    return 'stable';
  }

  /**
   * Extract base version for grouping (e.g., "v0.24.0-nightly.123" → "0.24.x")
   */
  extractBaseVersion(tagName: string): string | null {
    const match = tagName.match(/v?(\d+)\.(\d+)/);
    if (!match) return null;
    return `${match[1]}.${match[2]}.x`;
  }

  /**
   * Cluster releases by base version + type + date
   */
  clusterReleases(releases: ReleaseData[]): {
    clusters: ReleaseCluster[];
    standalone: ReleaseData[];
  } {
    const clusters: ReleaseCluster[] = [];
    const standalone: ReleaseData[] = [];

    // Classify and group by key
    const grouped = new Map<string, ReleaseData[]>();

    for (const release of releases) {
      const releaseType = this.classifyReleaseType(release.tagName);
      const baseVersion = this.extractBaseVersion(release.tagName);
      const date = release.publishedAt.split('T')[0];

      // Key: baseVersion-releaseType-date (for same-day clustering)
      const key = `${baseVersion ?? 'unknown'}-${releaseType}-${date}`;

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(release);
    }

    // Create clusters for groups with 2+ releases, otherwise standalone
    for (const [key, groupedReleases] of grouped) {
      if (groupedReleases.length >= 2) {
        const [baseVersion, releaseType] = key.split('-');
        clusters.push({
          clusterId: `cluster-${key}`,
          baseVersion: baseVersion ?? 'unknown',
          releaseType: releaseType as ReleaseType,
          releases: groupedReleases,
        });
      } else {
        standalone.push(...groupedReleases);
      }
    }

    return { clusters, standalone };
  }

  // ============ PR GROUPING (LLM Step 1) ============

  private static readonly BATCH_SIZE = 8; // PRs per grouping call

  /**
   * Group PRs semantically using LLM (batched and parallel)
   * PRs are batched by time proximity since related PRs are usually merged close together
   */
  async groupPRs(prs: PRData[], repoInfo: RepoInfo): Promise<PRGroupingResult> {
    if (prs.length === 0) {
      return { groups: [] };
    }

    // If only 1 PR, no need for LLM grouping
    if (prs.length === 1) {
      return {
        groups: [{ prNumbers: [prs[0].number], reason: 'Single PR' }],
      };
    }

    // PRs are already sorted by merge date (newest first)
    // Batch them so temporally close PRs are grouped together
    const batches: PRData[][] = [];
    for (let i = 0; i < prs.length; i += ClassifierService.BATCH_SIZE) {
      batches.push(prs.slice(i, i + ClassifierService.BATCH_SIZE));
    }

    console.log(`Grouping ${prs.length} PRs in ${batches.length} parallel batches`);

    // Run all batch grouping calls in parallel
    const batchResults = await Promise.all(
      batches.map((batch) => this.groupPRBatch(batch, repoInfo))
    );

    // Combine all groups
    const allGroups = batchResults.flatMap((result) => result.groups);

    return { groups: allGroups };
  }

  /**
   * Group a single batch of PRs
   */
  private async groupPRBatch(
    prs: PRData[],
    repoInfo: RepoInfo
  ): Promise<PRGroupingResult> {
    // Single PR = standalone group
    if (prs.length === 1) {
      return {
        groups: [{ prNumbers: [prs[0].number], reason: 'Single PR' }],
      };
    }

    const prompt = this.buildGroupingPrompt(prs, repoInfo);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at analyzing GitHub PRs and identifying semantic relationships between them. Group related PRs together.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: PR_GROUPING_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in grouping response');
        return this.fallbackGrouping(prs);
      }

      const result = JSON.parse(content) as PRGroupingResult;

      // Validate all PRs are accounted for
      const groupedPRs = new Set(result.groups.flatMap((g) => g.prNumbers));
      const allPRNumbers = new Set(prs.map((p) => p.number));

      // Add any missing PRs as standalone groups
      for (const prNumber of allPRNumbers) {
        if (!groupedPRs.has(prNumber)) {
          result.groups.push({
            prNumbers: [prNumber],
            reason: 'Not grouped with others',
          });
        }
      }

      return result;
    } catch (error) {
      console.error('Error grouping PR batch:', error);
      return this.fallbackGrouping(prs);
    }
  }

  private buildGroupingPrompt(prs: PRData[], repoInfo: RepoInfo): string {
    const prDescriptions = prs
      .map((pr) => {
        const commits = pr.commits
          .slice(0, 5)
          .map((c) => c.message.split('\n')[0])
          .join('; ');

        return `[PR #${pr.number}] ${pr.title}
Merged: ${pr.mergedAt}
Author: ${pr.author ?? 'unknown'}
Labels: ${pr.labels?.join(', ') || 'none'}
Description: ${(pr.body || 'No description').slice(0, 400)}
Commits: ${commits || 'none'}`;
      })
      .join('\n---\n');

    return `You are analyzing ${prs.length} recent PRs from ${repoInfo.owner}/${repoInfo.name}.
${repoInfo.description ? `Repository: ${repoInfo.description}` : ''}

Your task: Group these PRs by SEMANTIC CHANGE - what capability or fix they represent together.

Guidelines:
- PRs implementing the same feature across multiple steps → ONE group
- A feature PR + its test PR + its docs PR → ONE group
- A bug fix + its follow-up fixes → ONE group
- Unrelated PRs → SEPARATE groups (each in their own group)
- Dependency bumps from same tool (dependabot) → can be grouped as "Dependency updates"
- Internal refactors with no user impact → can be grouped as "Internal improvements"

PRs to analyze:
${prDescriptions}

Return a JSON object with groups. Each group should have:
- prNumbers: array of PR numbers that belong together
- reason: brief explanation of why they're grouped (e.g., "Same feature: authentication", "Related bug fixes")

IMPORTANT: Every PR must appear in exactly one group. If a PR is unrelated to others, put it in its own group.`;
  }

  private fallbackGrouping(prs: PRData[]): PRGroupingResult {
    // Fallback: each PR in its own group
    return {
      groups: prs.map((pr) => ({
        prNumbers: [pr.number],
        reason: 'Fallback: individual classification',
      })),
    };
  }

  // ============ GROUP SUMMARIZATION (LLM Step 2) ============

  /**
   * Summarize a group of PRs
   */
  async summarizeGroup(
    prNumbers: number[],
    prsById: Map<number, PRData>,
    repoInfo: RepoInfo
  ): Promise<GroupSummaryResult> {
    const prs = prNumbers.map((n) => prsById.get(n)!).filter(Boolean);

    if (prs.length === 0) {
      return {
        title: 'Unknown changes',
        summary: '- No PR data available',
        category: 'docs',
        significance: 'internal',
      };
    }

    const prompt = this.buildSummaryPrompt(prs, repoInfo);

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a technical writer creating concise, user-focused summaries of code changes. Focus on what users can do, not implementation details.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: GROUP_SUMMARY_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in summary response');
        return this.fallbackSummary(prs);
      }

      return JSON.parse(content) as GroupSummaryResult;
    } catch (error) {
      console.error('Error summarizing group:', error);
      return this.fallbackSummary(prs);
    }
  }

  private buildSummaryPrompt(prs: PRData[], repoInfo: RepoInfo): string {
    const isMultiplePRs = prs.length > 1;

    const prDescriptions = prs
      .map((pr) => {
        const commits = pr.commits
          .slice(0, 5)
          .map((c) => `- ${c.sha.substring(0, 7)}: ${c.message.split('\n')[0]}`)
          .join('\n');

        return `[PR #${pr.number}] ${pr.title}
Description: ${(pr.body || 'No description').slice(0, 500)}
Commits:
${commits || '- No commits'}`;
      })
      .join('\n\n---\n\n');

    const multiPRNote = isMultiplePRs
      ? `\nThese ${prs.length} PRs are RELATED and should be summarized as ONE cohesive change.`
      : '';

    return `Summarize ${isMultiplePRs ? 'these related PRs' : 'this PR'} from ${repoInfo.owner}/${repoInfo.name}.
${repoInfo.description ? `Repository: ${repoInfo.description}` : ''}
${multiPRNote}

${prDescriptions}

Provide:
- title: A clear, plain English title (5-10 words) describing the main change
- summary: 2-4 SHORT bullet points (each starting with "- "). Keep each bullet under 15 words. Focus on what users can do, not implementation details.
- category: one of "feature", "enhancement", "bugfix", "breaking", "deprecation", "performance", "security", "docs"
- significance: one of "major" (new capabilities, breaking changes), "minor" (enhancements), "patch" (bug fixes), "internal" (refactors, tests only)

If the changes have no user-facing impact, use category "docs" and significance "internal".`;
  }

  private fallbackSummary(prs: PRData[]): GroupSummaryResult {
    const title =
      prs.length === 1 ? prs[0].title : `${prs.length} related changes`;
    return {
      title,
      summary: prs.map((pr) => `- ${pr.title}`).join('\n'),
      category: 'enhancement',
      significance: 'minor',
    };
  }

  /**
   * Process all groups in parallel
   */
  async summarizeAllGroups(
    grouping: PRGroupingResult,
    prs: PRData[],
    repoInfo: RepoInfo
  ): Promise<Map<string, GroupSummaryResult>> {
    const prsById = new Map(prs.map((pr) => [pr.number, pr]));
    const results = new Map<string, GroupSummaryResult>();

    // Process groups in parallel (with concurrency limit)
    const concurrency = 5;
    const groups = grouping.groups;

    for (let i = 0; i < groups.length; i += concurrency) {
      const batch = groups.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (group) => {
          const key = group.prNumbers.sort().join('-');
          const summary = await this.summarizeGroup(
            group.prNumbers,
            prsById,
            repoInfo
          );
          return { key, summary };
        })
      );

      for (const { key, summary } of batchResults) {
        results.set(key, summary);
      }
    }

    return results;
  }

  // ============ RELEASE SUMMARIZATION ============

  /**
   * Summarize a single release
   */
  async summarizeRelease(
    release: ReleaseData,
    repoInfo: RepoInfo
  ): Promise<string | null> {
    // Skip if no body to summarize
    if (!release.body || release.body.trim().length < 20) {
      return null;
    }

    const prompt = `Summarize this GitHub Release for developers.

Repository: ${repoInfo.owner}/${repoInfo.name}
${repoInfo.description ? `Description: ${repoInfo.description}` : ''}

Release: ${release.title} (${release.tagName})

Release Notes:
${release.body.slice(0, 4000)}

Provide 3-5 SHORT bullet points (each starting with "- ") describing the key changes.
Keep each bullet under 15 words. Focus on what users can do or what changed.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a technical writer summarizing release notes concisely.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: RELEASE_SUMMARY_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const result = JSON.parse(content) as { summary: string };
      return result.summary;
    } catch (error) {
      console.error('Error summarizing release:', error);
      return null;
    }
  }

  /**
   * Summarize a cluster of related releases
   */
  async summarizeReleaseCluster(
    cluster: ReleaseCluster,
    repoInfo: RepoInfo
  ): Promise<{ title: string; summary: string; significance: string } | null> {
    const releaseBodies = cluster.releases
      .map((r) => `${r.tagName}:\n${(r.body || 'No notes').slice(0, 1000)}`)
      .join('\n\n---\n\n');

    const prompt = `Summarize these ${cluster.releases.length} related releases from ${repoInfo.owner}/${repoInfo.name}.

These are all ${cluster.releaseType} releases for version ${cluster.baseVersion}.

Release Notes:
${releaseBodies}

Create ONE unified summary covering the most important changes across all releases.
- title: e.g., "v0.23.x preview releases" or "v1.2.x patch updates"
- summary: 3-5 bullet points covering key changes (each starting with "- ", under 15 words)
- significance: "major", "minor", "patch", or "internal"`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a technical writer creating concise release summaries.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: RELEASE_CLUSTER_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      return JSON.parse(content);
    } catch (error) {
      console.error('Error summarizing release cluster:', error);
      return null;
    }
  }

  /**
   * Process multiple releases (handles both clusters and standalone)
   */
  async processReleases(
    releases: ReleaseData[],
    repoInfo: RepoInfo
  ): Promise<{
    processed: Array<{
      release: ReleaseData;
      summary: string | null;
      releaseType: ReleaseType;
      baseVersion: string | null;
      clusterId: string | null;
      isClusterHead: boolean;
    }>;
  }> {
    const { clusters, standalone } = this.clusterReleases(releases);
    const processed: Array<{
      release: ReleaseData;
      summary: string | null;
      releaseType: ReleaseType;
      baseVersion: string | null;
      clusterId: string | null;
      isClusterHead: boolean;
    }> = [];

    // Process clusters
    for (const cluster of clusters) {
      const clusterSummary = await this.summarizeReleaseCluster(
        cluster,
        repoInfo
      );

      // First release in cluster is the head (shown in feed)
      const sortedReleases = [...cluster.releases].sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      for (let i = 0; i < sortedReleases.length; i++) {
        const release = sortedReleases[i];
        processed.push({
          release,
          summary: i === 0 ? clusterSummary?.summary ?? null : null,
          releaseType: cluster.releaseType,
          baseVersion: cluster.baseVersion,
          clusterId: cluster.clusterId,
          isClusterHead: i === 0,
        });
      }
    }

    // Process standalone releases
    const concurrency = 5;
    for (let i = 0; i < standalone.length; i += concurrency) {
      const batch = standalone.slice(i, i + concurrency);
      const summaries = await Promise.all(
        batch.map((r) => this.summarizeRelease(r, repoInfo))
      );

      for (let j = 0; j < batch.length; j++) {
        const release = batch[j];
        processed.push({
          release,
          summary: summaries[j],
          releaseType: this.classifyReleaseType(release.tagName),
          baseVersion: this.extractBaseVersion(release.tagName),
          clusterId: null,
          isClusterHead: true,
        });
      }
    }

    return { processed };
  }
}
