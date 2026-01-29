import OpenAI from 'openai';
import type { SelectionResult } from '../types.js';
import { loadSystemPrompt, loadUserPrompt } from '../prompts/loader.js';

// JSON Schema for context selection (Phase 1)
const SELECTION_SCHEMA = {
  name: 'context_selection',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      repoIds: {
        type: 'array',
        items: { type: 'string' },
      },
      dateRange: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
        },
        required: ['start', 'end'],
        additionalProperties: false,
      },
    },
    required: ['repoIds', 'dateRange'],
    additionalProperties: false,
  },
} as const;

interface RepoContext {
  globalRepoId: string;
  owner: string;
  name: string;
  description: string | null;
}

interface UpdateContext {
  id: string;
  globalRepoId: string;
  repoName: string;
  title: string;
  summary: string | null;
  category: string;
  significance: string;
  date: string;
  prCount: number;
  commitCount: number;
  prs: Array<{
    prNumber: number;
    title: string;
    url: string;
  }>;
}

export class AskService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Phase 1: Select relevant repos and narrow time range
   * Only runs for All Repos view (when no specific repo is provided)
   */
  async selectContext(
    question: string,
    repos: RepoContext[],
    updates: Array<{ globalRepoId: string; repoName: string; title: string; date: string; significance: string }>,
    timeRange: { start: string; end: string }
  ): Promise<SelectionResult> {
    const repoContext = repos
      .map((r) => `- ${r.owner}/${r.name} (id: ${r.globalRepoId}): ${r.description || 'No description'}`)
      .join('\n');

    const updateContext = updates
      .map((u) => `[${u.date}] ${u.repoName}: ${u.title} (${u.significance})`)
      .join('\n');

    const systemPrompt = loadSystemPrompt('ask', 'selection-system');
    const userPrompt = loadUserPrompt('ask', 'selection-user', {
      question,
      userTimeRangeStart: timeRange.start,
      userTimeRangeEnd: timeRange.end,
      repoContext,
      updateContext,
    });

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: SELECTION_SCHEMA,
        },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in selection response');
        return this.fallbackSelection(repos, timeRange);
      }

      const result = JSON.parse(content) as SelectionResult;

      // Validate: filter to only known repo IDs
      const knownIds = new Set(repos.map((r) => r.globalRepoId));
      result.repoIds = result.repoIds.filter((id) => knownIds.has(id));

      // If selection returned empty, fall back to all repos
      if (result.repoIds.length === 0) {
        result.repoIds = repos.map((r) => r.globalRepoId);
      }

      return result;
    } catch (error) {
      console.error('Error in context selection:', error);
      return this.fallbackSelection(repos, timeRange);
    }
  }

  /**
   * Phase 2: Stream an answer using the full update context
   * Returns an AsyncGenerator that yields text chunks
   */
  async *streamAnswer(
    question: string,
    repos: RepoContext[],
    updates: UpdateContext[]
  ): AsyncGenerator<string> {
    const repoContext = repos
      .map((r) => `- ${r.owner}/${r.name}`)
      .join('\n');

    const updateDetails = updates
      .map((u) => {
        const prList = u.prs
          .map((pr) => `#${pr.prNumber} (${pr.title})`)
          .join(', ');

        return `### Update: "${u.title}"
**ID:** ${u.id}
**Repo:** ${u.repoName} | **Date:** ${u.date} | **Significance:** ${u.significance} | **Category:** ${u.category}
**Summary:**
${u.summary || '- No summary available'}
**PRs:** ${prList || 'None'}
---`;
      })
      .join('\n\n');

    const systemPrompt = loadSystemPrompt('ask', 'answer-system');
    const userPrompt = loadUserPrompt('ask', 'answer-user', {
      question,
      updateCount: updates.length,
      repoContext,
      updateDetails,
    });

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Extract cited update IDs from the completed answer text
   */
  extractCitations(text: string): string[] {
    const matches = text.matchAll(/\[\[update:([^\]]+)\]\]/g);
    const ids = new Set<string>();
    for (const match of matches) {
      ids.add(match[1]);
    }
    return Array.from(ids);
  }

  private fallbackSelection(
    repos: RepoContext[],
    timeRange: { start: string; end: string }
  ): SelectionResult {
    return {
      repoIds: repos.map((r) => r.globalRepoId),
      dateRange: timeRange,
    };
  }
}
