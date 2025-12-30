import OpenAI from 'openai';
import { prisma } from '../db.js';
import type {
  ReportContent,
  ReportSection,
  ReportTheme,
  ExecutiveSummaryResult,
  PRData,
} from '../types.js';
import { loadSystemPrompt, loadUserPrompt } from '../prompts/loader.js';
import { GitHubService } from './github.js';
import { ClassifierService } from './classifier.js';

// JSON Schema for executive summary
const EXECUTIVE_SUMMARY_SCHEMA = {
  name: 'executive_summary',
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

interface UpdateWithPRs {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  significance: string;
  date: Date;
  prs: Array<{
    prNumber: number;
    title: string;
    url: string;
  }>;
}

export class ReportGenerator {
  private openai: OpenAI;
  private github: GitHubService;
  private classifier: ClassifierService;

  constructor(apiKey: string, githubToken?: string) {
    this.openai = new OpenAI({ apiKey });
    this.github = new GitHubService(githubToken);
    this.classifier = new ClassifierService(apiKey);
  }

  /**
   * Generate a complete report for a repository
   * Reports show existing Updates grouped by significance - no additional clustering
   */
  async generateReport(
    globalRepoId: string,
    startDate: Date,
    endDate: Date,
    repo: { owner: string; name: string; description?: string | null },
    onProgress: (progress: string) => Promise<void>
  ): Promise<ReportContent> {
    await onProgress('Checking for missing data...');

    // Phase 1: Index any missing PRs in the date range
    await this.indexMissingPRs(globalRepoId, startDate, endDate, repo, onProgress);

    await onProgress('Gathering updates...');

    // Phase 2: Gather updates from the date range
    const updates = await this.gatherUpdates(globalRepoId, startDate, endDate);

    if (updates.length === 0) {
      return {
        executiveSummary: 'No significant updates found in this date range.',
        sections: [],
        metadata: {
          repoName: repo.name,
          repoOwner: repo.owner,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          prCount: 0,
          updateCount: 0,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    await onProgress(`Organizing ${updates.length} updates...`);

    // Phase 3: Organize updates into sections by significance
    const sections = this.organizeSections(updates);

    // Phase 4: Generate executive summary
    await onProgress('Generating summary...');
    const executiveSummary = await this.generateExecutiveSummary(updates, repo, startDate, endDate);

    // Count total PRs
    const prCount = updates.reduce((sum, u) => sum + u.prs.length, 0);

    return {
      executiveSummary,
      sections,
      metadata: {
        repoName: repo.name,
        repoOwner: repo.owner,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        prCount,
        updateCount: updates.length,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Gather updates from the database for the given date range
   * Excludes docs and internal updates
   */
  private async gatherUpdates(
    globalRepoId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UpdateWithPRs[]> {
    const updates = await prisma.globalUpdate.findMany({
      where: {
        globalRepoId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        // Exclude docs and internal updates
        NOT: [
          { category: 'docs' },
          { significance: 'internal' },
        ],
      },
      include: {
        prs: {
          select: {
            prNumber: true,
            title: true,
            url: true,
          },
        },
      },
      orderBy: { date: 'desc' },
      take: 100, // Limit to 100 updates max
    });

    return updates;
  }

  /**
   * Index any missing PRs in the date range that aren't already in GlobalUpdate
   */
  private async indexMissingPRs(
    globalRepoId: string,
    startDate: Date,
    endDate: Date,
    repo: { owner: string; name: string; description?: string | null },
    onProgress: (progress: string) => Promise<void>
  ): Promise<void> {
    const { owner, name } = repo;

    // Get repo info for classifier
    const repoInfo = await this.github.getRepoInfo(owner, name);

    // Fetch PRs from GitHub within the date range
    await onProgress('Fetching PRs from GitHub...');
    const allPRs = await this.github.getMergedPRs(owner, name, startDate, 200);

    // Filter to only PRs within the date range
    const prsInRange = allPRs.filter((pr) => {
      const mergedAt = new Date(pr.mergedAt);
      return mergedAt >= startDate && mergedAt <= endDate;
    });

    if (prsInRange.length === 0) {
      console.log(`No PRs found in date range for ${owner}/${name}`);
      return;
    }

    console.log(`Found ${prsInRange.length} PRs in date range for ${owner}/${name}`);

    // Get existing PR numbers that are already indexed
    const existingPRNumbers = new Set(
      (
        await prisma.globalPR.findMany({
          where: { globalRepoId },
          select: { prNumber: true },
        })
      ).map((p) => p.prNumber)
    );

    // Filter to new PRs only
    const newPRs = prsInRange.filter((pr) => !existingPRNumbers.has(pr.number));

    if (newPRs.length === 0) {
      console.log(`All ${prsInRange.length} PRs already indexed`);
      return;
    }

    console.log(`${newPRs.length} new PRs to index`);
    await onProgress(`Indexing ${newPRs.length} new PRs...`);

    // Group PRs using classifier
    const grouping = await this.classifier.groupPRs(newPRs, repoInfo);
    console.log(`Created ${grouping.groups.length} semantic groups`);

    // Summarize groups
    await onProgress(`Summarizing ${grouping.groups.length} updates...`);
    const summaries = await this.classifier.summarizeAllGroups(grouping, newPRs, repoInfo);

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
          globalRepoId,
          title: summary.title,
          summary: summary.summary,
          category: summary.category,
          significance: summary.significance,
          date: latestDate,
          prCount: groupPRs.length,
          commitCount: totalCommits,
        },
      });

      // Create GlobalPRs linked to this Update
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

      console.log(`Created update "${summary.title}" with ${groupPRs.length} PRs`);
    }

    console.log(`Finished indexing missing PRs for ${owner}/${name}`);
  }

  /**
   * Organize updates into sections by significance
   * Each update becomes a "theme" in the report (no additional clustering)
   */
  private organizeSections(updates: UpdateWithPRs[]): ReportSection[] {
    const sections: ReportSection[] = [];

    const majorUpdates = updates.filter((u) => u.significance === 'major');
    const minorUpdates = updates.filter((u) => u.significance === 'minor');
    const patchUpdates = updates.filter((u) => u.significance === 'patch');

    if (majorUpdates.length > 0) {
      sections.push({
        significance: 'major',
        themes: majorUpdates.map((u) => this.updateToTheme(u)),
      });
    }

    if (minorUpdates.length > 0) {
      sections.push({
        significance: 'minor',
        themes: minorUpdates.map((u) => this.updateToTheme(u)),
      });
    }

    if (patchUpdates.length > 0) {
      sections.push({
        significance: 'patch',
        themes: patchUpdates.map((u) => this.updateToTheme(u)),
      });
    }

    return sections;
  }

  /**
   * Convert an Update to a ReportTheme
   */
  private updateToTheme(update: UpdateWithPRs): ReportTheme {
    return {
      name: update.title,
      summary: update.summary || 'No summary available',
      relatedPRs: update.prs.map((pr) => ({
        number: pr.prNumber,
        title: pr.title,
        url: pr.url,
      })),
    };
  }

  /**
   * Generate executive summary from updates
   */
  private async generateExecutiveSummary(
    updates: UpdateWithPRs[],
    repo: { owner: string; name: string; description?: string | null },
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    // Build a summary of updates by significance
    const majorCount = updates.filter((u) => u.significance === 'major').length;
    const minorCount = updates.filter((u) => u.significance === 'minor').length;
    const patchCount = updates.filter((u) => u.significance === 'patch').length;

    const updateSummaries = updates
      .slice(0, 20) // Limit to first 20 for context
      .map((u) => `- ${u.title} (${u.significance}): ${u.summary || 'No summary'}`)
      .join('\n');

    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const systemPrompt = loadSystemPrompt('reports', 'executive-summary-system');
    const userPrompt = loadUserPrompt('reports', 'executive-summary-user', {
      repoOwner: repo.owner,
      repoName: repo.name,
      repoDescription: repo.description,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      majorCount,
      minorCount,
      patchCount,
      updateSummaries,
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
          json_schema: EXECUTIVE_SUMMARY_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.fallbackExecutiveSummary(repo, startDate, endDate, majorCount, minorCount, patchCount);
      }

      const result = JSON.parse(content) as ExecutiveSummaryResult;
      return result.summary;
    } catch (error) {
      console.error('Error generating executive summary:', error);
      return this.fallbackExecutiveSummary(repo, startDate, endDate, majorCount, minorCount, patchCount);
    }
  }

  private fallbackExecutiveSummary(
    repo: { owner: string; name: string },
    startDate: Date,
    endDate: Date,
    majorCount: number,
    minorCount: number,
    patchCount: number
  ): string {
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const parts = [];
    if (majorCount > 0) parts.push(`${majorCount} major update${majorCount > 1 ? 's' : ''}`);
    if (minorCount > 0) parts.push(`${minorCount} minor enhancement${minorCount > 1 ? 's' : ''}`);
    if (patchCount > 0) parts.push(`${patchCount} bug fix${patchCount > 1 ? 'es' : ''}`);

    return `This report covers changes to ${repo.owner}/${repo.name} from ${formatDate(startDate)} to ${formatDate(endDate)}, including ${parts.join(', ')}.`;
  }
}
