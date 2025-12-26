import OpenAI from 'openai';
import type { PRData, ClassifiedChange, RepoInfo } from '../types.js';

const CLASSIFICATION_PROMPT = `You are analyzing a GitHub Pull Request to provide a HIGH-LEVEL summary of what it adds for users.

Repository: {repoName}
Repository Description: {repoDescription}

PR Title: {prTitle}
PR Description: {prDescription}

Commits in this PR:
{commits}

Provide ONE high-level classification for this entire PR. Focus on the main user-facing capability or change - what can users do now that they couldn't before? Don't break it into implementation details (like "new event classes" or "history management") - summarize the overall feature/fix.

Return a JSON object with:
- category: one of "feature", "enhancement", "bugfix", "breaking", "deprecation", "performance", "security", "docs"
- significance: one of "major" (new capabilities, breaking changes), "minor" (enhancements, quality-of-life), "patch" (bug fixes, small tweaks), "internal" (refactors, tests, docs only)
- title: a clear, plain English title (5-10 words) describing the main change
- summary: 2-4 SHORT bullet points (each starting with "- ") describing key aspects. Keep each bullet under 15 words. Focus on what users can do, not implementation details.

If the PR has no user-facing changes (pure refactor, tests only), return:
{"category": "docs", "significance": "internal", "title": "Internal changes", "summary": "- Internal refactoring or test updates\\n- No user-facing impact"}

Example response for a feature PR:
{
  "category": "feature",
  "significance": "major",
  "title": "Human-in-the-loop support for flows",
  "summary": "- New @human_feedback decorator for flow methods\\n- Collect user input during workflow execution\\n- Route flows based on user responses"
}

Respond with ONLY the JSON object, no other text.`;

export class ClassifierService {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async classifyPR(pr: PRData, repoInfo: RepoInfo): Promise<ClassifiedChange | null> {
    const commitsText = pr.commits
      .map((c) => `- ${c.sha.substring(0, 7)}: ${c.message.split('\n')[0]}`)
      .join('\n');

    const prompt = CLASSIFICATION_PROMPT
      .replace('{repoName}', `${repoInfo.owner}/${repoInfo.name}`)
      .replace('{repoDescription}', repoInfo.description || 'No description')
      .replace('{prTitle}', pr.title)
      .replace('{prDescription}', pr.body || 'No description')
      .replace('{commits}', commitsText || 'No commits');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a technical analyst that classifies GitHub changes. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.error('No content in OpenAI response');
        return null;
      }

      // Parse JSON object from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('No JSON object found in response:', content);
        return null;
      }

      const classification = JSON.parse(jsonMatch[0]) as ClassifiedChange;
      return classification;
    } catch (error) {
      console.error('Error classifying PR:', error);
      return null;
    }
  }

  async classifyMultiplePRs(
    prs: PRData[],
    repoInfo: RepoInfo
  ): Promise<Map<number, ClassifiedChange | null>> {
    const results = new Map<number, ClassifiedChange | null>();

    // Process PRs in parallel with a concurrency limit
    const concurrency = 5;
    for (let i = 0; i < prs.length; i += concurrency) {
      const batch = prs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (pr) => {
          const classification = await this.classifyPR(pr, repoInfo);
          return { prNumber: pr.number, classification };
        })
      );

      for (const { prNumber, classification } of batchResults) {
        results.set(prNumber, classification);
      }
    }

    return results;
  }
}
