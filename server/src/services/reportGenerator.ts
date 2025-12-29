import OpenAI from 'openai';
import { prisma } from '../db.js';
import type {
  ReportContent,
  ReportSection,
  ReportTheme,
  ThemeGroupingResult,
  ThemeSummaryResult,
  ExecutiveSummaryResult,
  Significance,
} from '../types.js';

// JSON Schema for theme grouping
const THEME_GROUPING_SCHEMA = {
  name: 'theme_grouping',
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
            significance: {
              type: 'string',
              enum: ['major', 'minor', 'patch'],
            },
            updateIds: {
              type: 'array',
              items: { type: 'string' },
            },
            oneLineSummary: { type: 'string' },
          },
          required: ['name', 'significance', 'updateIds', 'oneLineSummary'],
          additionalProperties: false,
        },
      },
    },
    required: ['themes'],
    additionalProperties: false,
  },
} as const;

// JSON Schema for theme summary
const THEME_SUMMARY_SCHEMA = {
  name: 'theme_summary',
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

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate a complete report for a repository
   */
  async generateReport(
    globalRepoId: string,
    startDate: Date,
    endDate: Date,
    repo: { owner: string; name: string; description?: string | null },
    onProgress: (progress: string) => Promise<void>
  ): Promise<ReportContent> {
    await onProgress('Gathering data...');

    // Phase 1: Gather updates from the date range
    const updates = await this.gatherUpdates(globalRepoId, startDate, endDate);

    if (updates.length === 0) {
      // Return empty report
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

    await onProgress(`Analyzing ${updates.length} updates...`);

    // Phase 2: Group updates into semantic themes using LLM
    await onProgress('Grouping features...');
    const themes = await this.groupIntoThemes(updates, repo);

    // Phase 3: Generate detailed summaries for each theme (parallel)
    await onProgress('Generating summaries...');
    const themesWithSummaries = await this.generateThemeSummaries(themes, updates, repo);

    // Organize into sections by significance
    const sections = this.organizeSections(themesWithSummaries);

    // Phase 4: Generate executive summary
    await onProgress('Finalizing report...');
    const executiveSummary = await this.generateExecutiveSummary(themesWithSummaries, repo, startDate, endDate);

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
   * Group updates into themes using LLM
   */
  private async groupIntoThemes(
    updates: UpdateWithPRs[],
    repo: { owner: string; name: string; description?: string | null }
  ): Promise<ThemeGroupingResult['themes']> {
    const updateDescriptions = updates
      .map((u) => {
        const prList = u.prs.map((pr) => `#${pr.prNumber}`).join(', ');
        return `[${u.id}] ${u.title} (${u.significance}) - ${u.summary || 'No summary'} [PRs: ${prList}]`;
      })
      .join('\n');

    const prompt = `You are analyzing ${updates.length} updates from ${repo.owner}/${repo.name}.
${repo.description ? `Repository: ${repo.description}` : ''}

Group these updates into 3-8 high-level THEMES that represent the key changes.

Guidelines:
- Each theme should represent a distinct area of change (e.g., "Authentication Improvements", "Performance Optimizations", "UI Enhancements")
- Group related updates together even if they have different significance levels
- The theme's significance should be the HIGHEST significance among its updates (major > minor > patch)
- Every update must be assigned to exactly one theme
- Theme names should be user-friendly and descriptive

Updates to analyze:
${updateDescriptions}

Return themes with:
- name: A clear, descriptive theme name (e.g., "Authentication & Security")
- significance: The highest significance level among the theme's updates
- updateIds: Array of update IDs that belong to this theme
- oneLineSummary: A single sentence summarizing the theme`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at organizing software changes into meaningful themes for stakeholder reports.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: THEME_GROUPING_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return this.fallbackThemeGrouping(updates);
      }

      const result = JSON.parse(content) as ThemeGroupingResult;

      // Validate all updates are assigned
      const assignedIds = new Set(result.themes.flatMap((t) => t.updateIds));
      const missingUpdates = updates.filter((u) => !assignedIds.has(u.id));

      if (missingUpdates.length > 0) {
        // Add missing updates to an "Other Changes" theme
        const hasMaxor = missingUpdates.some((u) => u.significance === 'major');
        const hasMinor = missingUpdates.some((u) => u.significance === 'minor');
        const significance: Significance = hasMaxor ? 'major' : hasMinor ? 'minor' : 'patch';

        result.themes.push({
          name: 'Other Changes',
          significance,
          updateIds: missingUpdates.map((u) => u.id),
          oneLineSummary: 'Additional miscellaneous updates',
        });
      }

      return result.themes;
    } catch (error) {
      console.error('Error grouping themes:', error);
      return this.fallbackThemeGrouping(updates);
    }
  }

  /**
   * Fallback theme grouping by significance
   */
  private fallbackThemeGrouping(updates: UpdateWithPRs[]): ThemeGroupingResult['themes'] {
    const themes: ThemeGroupingResult['themes'] = [];

    const majorUpdates = updates.filter((u) => u.significance === 'major');
    const minorUpdates = updates.filter((u) => u.significance === 'minor');
    const patchUpdates = updates.filter((u) => u.significance === 'patch');

    if (majorUpdates.length > 0) {
      themes.push({
        name: 'Major Changes',
        significance: 'major',
        updateIds: majorUpdates.map((u) => u.id),
        oneLineSummary: `${majorUpdates.length} major updates`,
      });
    }

    if (minorUpdates.length > 0) {
      themes.push({
        name: 'Minor Enhancements',
        significance: 'minor',
        updateIds: minorUpdates.map((u) => u.id),
        oneLineSummary: `${minorUpdates.length} minor updates`,
      });
    }

    if (patchUpdates.length > 0) {
      themes.push({
        name: 'Bug Fixes & Patches',
        significance: 'patch',
        updateIds: patchUpdates.map((u) => u.id),
        oneLineSummary: `${patchUpdates.length} patch updates`,
      });
    }

    return themes;
  }

  /**
   * Generate detailed summaries for each theme (parallel)
   */
  private async generateThemeSummaries(
    themes: ThemeGroupingResult['themes'],
    updates: UpdateWithPRs[],
    repo: { owner: string; name: string; description?: string | null }
  ): Promise<Array<ThemeGroupingResult['themes'][0] & { detailedSummary: string; relatedPRs: ReportTheme['relatedPRs'] }>> {
    const updatesById = new Map(updates.map((u) => [u.id, u]));

    // Process in parallel with concurrency limit
    const concurrency = 5;
    const results: Array<ThemeGroupingResult['themes'][0] & { detailedSummary: string; relatedPRs: ReportTheme['relatedPRs'] }> = [];

    for (let i = 0; i < themes.length; i += concurrency) {
      const batch = themes.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (theme) => {
          const themeUpdates = theme.updateIds
            .map((id) => updatesById.get(id))
            .filter((u): u is UpdateWithPRs => u !== undefined);

          const detailedSummary = await this.generateThemeSummary(theme, themeUpdates, repo);

          // Collect all PRs for this theme
          const relatedPRs: ReportTheme['relatedPRs'] = [];
          for (const update of themeUpdates) {
            for (const pr of update.prs) {
              relatedPRs.push({
                number: pr.prNumber,
                title: pr.title,
                url: pr.url,
              });
            }
          }

          return {
            ...theme,
            detailedSummary,
            relatedPRs,
          };
        })
      );

      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Generate detailed summary for a single theme
   */
  private async generateThemeSummary(
    theme: ThemeGroupingResult['themes'][0],
    updates: UpdateWithPRs[],
    repo: { owner: string; name: string; description?: string | null }
  ): Promise<string> {
    const updateDescriptions = updates
      .map((u) => {
        const prList = u.prs.map((pr) => `#${pr.prNumber}: ${pr.title}`).join('; ');
        return `- ${u.title}: ${u.summary || 'No summary'}\n  PRs: ${prList}`;
      })
      .join('\n');

    const prompt = `Summarize this theme from ${repo.owner}/${repo.name} as scannable bullet points.

Theme: ${theme.name}

Updates:
${updateDescriptions}

FORMAT:
- Use 3-6 bullet points
- Bold **key terms, APIs, flags, or metrics** that a developer would search for
- Cite PR numbers inline (e.g., "Added X (#123)")
- Each bullet = one concrete change users will notice

CONTENT RULES:
- Only include changes that affect end users or developers using this project
- Skip: docs updates, version bumps, internal refactors, test-only changes, dependency updates
- Be specific: "**streaming responses** now supported" not "improved performance"
- Include concrete details: config names, CLI flags, error messages, % improvements
- No filler phrases ("This release includes", "We're excited to", "Various improvements")

TONE:
- Direct and technical - our audience is developers who want facts, not marketing
- Lead with the what, not the why
- If a bug was fixed, state what broke and what works now`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You write concise, technical changelogs for developers. No fluff, just facts.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: THEME_SUMMARY_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return theme.oneLineSummary;
      }

      const result = JSON.parse(content) as ThemeSummaryResult;
      return result.summary;
    } catch (error) {
      console.error('Error generating theme summary:', error);
      return theme.oneLineSummary;
    }
  }

  /**
   * Organize themes into sections by significance
   */
  private organizeSections(
    themes: Array<ThemeGroupingResult['themes'][0] & { detailedSummary: string; relatedPRs: ReportTheme['relatedPRs'] }>
  ): ReportSection[] {
    const sections: ReportSection[] = [];

    const majorThemes = themes.filter((t) => t.significance === 'major');
    const minorThemes = themes.filter((t) => t.significance === 'minor');
    const patchThemes = themes.filter((t) => t.significance === 'patch');

    if (majorThemes.length > 0) {
      sections.push({
        significance: 'major',
        themes: majorThemes.map((t) => ({
          name: t.name,
          summary: t.detailedSummary,
          relatedPRs: t.relatedPRs,
        })),
      });
    }

    if (minorThemes.length > 0) {
      sections.push({
        significance: 'minor',
        themes: minorThemes.map((t) => ({
          name: t.name,
          summary: t.detailedSummary,
          relatedPRs: t.relatedPRs,
        })),
      });
    }

    if (patchThemes.length > 0) {
      sections.push({
        significance: 'patch',
        themes: patchThemes.map((t) => ({
          name: t.name,
          summary: t.detailedSummary,
          relatedPRs: t.relatedPRs,
        })),
      });
    }

    return sections;
  }

  /**
   * Generate executive summary
   */
  private async generateExecutiveSummary(
    themes: Array<ThemeGroupingResult['themes'][0] & { detailedSummary: string }>,
    repo: { owner: string; name: string; description?: string | null },
    startDate: Date,
    endDate: Date
  ): Promise<string> {
    const themeSummaries = themes
      .map((t) => `${t.name} (${t.significance}): ${t.oneLineSummary}`)
      .join('\n');

    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const prompt = `Write an executive summary (2-3 paragraphs) for a report on ${repo.owner}/${repo.name}.
${repo.description ? `Repository: ${repo.description}` : ''}

Report period: ${formatDate(startDate)} to ${formatDate(endDate)}

Themes covered:
${themeSummaries}

Guidelines:
- Start with a high-level overview of what changed during this period
- Highlight the most impactful changes (major themes)
- Mention the breadth of improvements (number of themes, types of changes)
- End with the overall significance/impact
- Write in a professional tone suitable for stakeholders
- Do NOT use bullet points - write in paragraph form`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a technical writer creating executive summaries for software development reports.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: EXECUTIVE_SUMMARY_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return `This report covers changes to ${repo.owner}/${repo.name} from ${formatDate(startDate)} to ${formatDate(endDate)}, including ${themes.length} key themes.`;
      }

      const result = JSON.parse(content) as ExecutiveSummaryResult;
      return result.summary;
    } catch (error) {
      console.error('Error generating executive summary:', error);
      return `This report covers changes to ${repo.owner}/${repo.name} from ${formatDate(startDate)} to ${formatDate(endDate)}, including ${themes.length} key themes.`;
    }
  }
}
