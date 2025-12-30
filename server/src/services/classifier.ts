import OpenAI from 'openai';
import type {
  PRData,
  RepoInfo,
  ReleaseData,
  ThemeClusterResult,
  PRGroupingResult,
  GroupSummaryResult,
  ReleaseType,
  ReleaseCluster,
} from '../types.js';
import { loadSystemPrompt, loadUserPrompt } from '../prompts/loader.js';

// JSON Schema for theme clustering (Phase 1 - lightweight)
const THEME_CLUSTERING_SCHEMA = {
  name: 'theme_clustering',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      themes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            prNumbers: {
              type: 'array',
              items: { type: 'number' },
            },
          },
          required: ['name', 'prNumbers'],
          additionalProperties: false,
        },
      },
    },
    required: ['themes'],
    additionalProperties: false,
  },
} as const;

// JSON Schema for PR grouping (Phase 2 - detailed)
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

  // ============ PR GROUPING (Two-Phase Approach) ============

  /**
   * Group PRs semantically using a two-phase LLM approach:
   * Phase 1: Cluster all PRs by theme (lightweight, sees all PRs)
   * Phase 2: Detailed grouping within each theme cluster
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

    // If 5 or fewer PRs, skip Phase 1 and go directly to detailed grouping
    if (prs.length <= 5) {
      console.log(`Grouping ${prs.length} PRs directly (small batch)`);
      return this.groupPRsWithinTheme(prs, repoInfo, 'All changes');
    }

    console.log(`Phase 1: Clustering ${prs.length} PRs by theme...`);

    // Phase 1: Cluster by theme (lightweight - just titles and labels)
    const themeClusters = await this.clusterPRsByTheme(prs, repoInfo);
    console.log(`Identified ${themeClusters.themes.length} theme clusters`);

    // Deduplicate: ensure each PR appears in only one theme (first occurrence wins)
    const assignedPRs = new Set<number>();
    const deduplicatedThemes = themeClusters.themes.map((theme) => ({
      ...theme,
      prNumbers: theme.prNumbers.filter((prNum) => {
        if (assignedPRs.has(prNum)) {
          return false; // Skip - already assigned to another theme
        }
        assignedPRs.add(prNum);
        return true;
      }),
    })).filter((theme) => theme.prNumbers.length > 0); // Remove empty themes

    console.log(`After deduplication: ${deduplicatedThemes.length} themes with ${assignedPRs.size} unique PRs`);

    // Phase 2: Detailed grouping within each theme cluster (parallel)
    console.log(`Phase 2: Detailed grouping within ${deduplicatedThemes.length} themes...`);

    const prsById = new Map(prs.map((pr) => [pr.number, pr]));
    const allGroups: PRGroupingResult['groups'] = [];
    const groupedPRNumbers = new Set<number>();

    // Process theme clusters in parallel (with concurrency limit)
    const concurrency = 3;
    for (let i = 0; i < deduplicatedThemes.length; i += concurrency) {
      const batch = deduplicatedThemes.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (theme) => {
          const themePRs = theme.prNumbers
            .map((n) => prsById.get(n))
            .filter((p): p is PRData => p !== undefined);

          if (themePRs.length === 0) return { groups: [] };

          // Single PR in theme = standalone group
          if (themePRs.length === 1) {
            return {
              groups: [{ prNumbers: [themePRs[0].number], reason: theme.name }],
            };
          }

          return this.groupPRsWithinTheme(themePRs, repoInfo, theme.name);
        })
      );

      for (const result of batchResults) {
        // Deduplicate groups: ensure each PR only appears once across all groups
        for (const group of result.groups) {
          const uniquePRs = group.prNumbers.filter((prNum) => {
            if (groupedPRNumbers.has(prNum)) {
              return false; // Skip - already in another group
            }
            groupedPRNumbers.add(prNum);
            return true;
          });

          if (uniquePRs.length > 0) {
            allGroups.push({
              prNumbers: uniquePRs,
              reason: group.reason,
            });
          }
        }
      }
    }

    // Add any missing PRs as standalone groups
    const allPRNumbers = new Set(prs.map((p) => p.number));
    for (const prNumber of allPRNumbers) {
      if (!groupedPRNumbers.has(prNumber)) {
        allGroups.push({
          prNumbers: [prNumber],
          reason: 'Not grouped with others',
        });
        groupedPRNumbers.add(prNumber);
      }
    }

    console.log(`Final: ${allGroups.length} groups with ${groupedPRNumbers.size} PRs`);

    return { groups: allGroups };
  }

  /**
   * Phase 1: Cluster PRs by theme using lightweight info (titles + labels only)
   */
  private async clusterPRsByTheme(
    prs: PRData[],
    repoInfo: RepoInfo
  ): Promise<ThemeClusterResult> {
    // Build lightweight PR briefs (just title and labels)
    const prBriefs = prs
      .map((pr) => {
        const labels = pr.labels?.length ? ` [${pr.labels.join(', ')}]` : '';
        return `#${pr.number}: ${pr.title}${labels}`;
      })
      .join('\n');

    const systemPrompt = loadSystemPrompt('classifier', 'theme-clustering-system');
    const userPrompt = loadUserPrompt('classifier', 'theme-clustering-user', {
      prCount: prs.length,
      repoOwner: repoInfo.owner,
      repoName: repoInfo.name,
      repoDescription: repoInfo.description,
      prBriefs,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: THEME_CLUSTERING_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in theme clustering response');
        return this.fallbackThemeClustering(prs);
      }

      const result = JSON.parse(content) as ThemeClusterResult;

      // Validate all PRs are accounted for
      const clusteredPRs = new Set(result.themes.flatMap((t) => t.prNumbers));
      const allPRNumbers = prs.map((p) => p.number);
      const missingPRs = allPRNumbers.filter((n) => !clusteredPRs.has(n));

      if (missingPRs.length > 0) {
        // Add missing PRs as "Miscellaneous" theme
        result.themes.push({
          name: 'Miscellaneous changes',
          prNumbers: missingPRs,
        });
      }

      return result;
    } catch (error) {
      console.error('Error clustering PRs by theme:', error);
      return this.fallbackThemeClustering(prs);
    }
  }

  /**
   * Phase 2: Detailed grouping within a theme cluster
   */
  private async groupPRsWithinTheme(
    prs: PRData[],
    repoInfo: RepoInfo,
    themeName: string
  ): Promise<PRGroupingResult> {
    const prDescriptions = this.buildPRDescriptions(prs);
    const systemPrompt = loadSystemPrompt('classifier', 'pr-grouping-system');
    const userPrompt = loadUserPrompt('classifier', 'pr-grouping-user', {
      prCount: prs.length,
      repoOwner: repoInfo.owner,
      repoName: repoInfo.name,
      repoDescription: repoInfo.description,
      themeName,
      prDescriptions,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
      console.error('Error grouping PRs within theme:', error);
      return this.fallbackGrouping(prs);
    }
  }

  private buildPRDescriptions(prs: PRData[]): string {
    return prs
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
  }

  private fallbackThemeClustering(prs: PRData[]): ThemeClusterResult {
    // Fallback: all PRs in one theme
    return {
      themes: [
        {
          name: 'All changes',
          prNumbers: prs.map((p) => p.number),
        },
      ],
    };
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

    const isMultiplePRs = prs.length > 1;
    const prDescriptions = this.buildSummaryPRDescriptions(prs);

    const systemPrompt = loadSystemPrompt('classifier', 'group-summary-system');
    const userPrompt = loadUserPrompt('classifier', 'group-summary-user', {
      isMultiplePRs,
      prCount: prs.length,
      repoOwner: repoInfo.owner,
      repoName: repoInfo.name,
      repoDescription: repoInfo.description,
      prDescriptions,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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

  private buildSummaryPRDescriptions(prs: PRData[]): string {
    return prs
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

    const systemPrompt = loadSystemPrompt('classifier', 'release-summary-system');
    const userPrompt = loadUserPrompt('classifier', 'release-summary-user', {
      repoOwner: repoInfo.owner,
      repoName: repoInfo.name,
      repoDescription: repoInfo.description,
      releaseTitle: release.title,
      releaseTagName: release.tagName,
      releaseBody: release.body.slice(0, 4000),
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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

    const systemPrompt = loadSystemPrompt('classifier', 'release-cluster-system');
    const userPrompt = loadUserPrompt('classifier', 'release-cluster-user', {
      releaseCount: cluster.releases.length,
      repoOwner: repoInfo.owner,
      repoName: repoInfo.name,
      releaseType: cluster.releaseType,
      baseVersion: cluster.baseVersion,
      releaseBodies,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
