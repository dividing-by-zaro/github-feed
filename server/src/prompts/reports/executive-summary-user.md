Write an executive summary for {{repoOwner}}/{{repoName}} covering {{startDate}} to {{endDate}}.
{{#if repoDescription}}Repository: {{repoDescription}}{{/if}}

Themes:
{{{themeSummaries}}}

STRUCTURE:
1. **Impact verdict** (1 sentence): Was this period high-impact, moderate, low-impact, or quiet for end users? When determining the impact, consider the true value of changes, NOT the volume of changes. Many PRs but only minor & patch levels means lower impact, while few PRs but mostly major levels has higher impact.
2. **Key changes** (2-4 sentences): What are the 1-3 most important things a user of this project should know? Bold the specific features, fixes, or APIs.
3. **Activity context** (1-2 sentences): Was this a busy period (many PRs) or quiet? Was the work substantive (new features, critical fixes) or maintenance (deps, docs, minor tweaks)?

CONTENT RULES:
- Lead with what matters to someone USING this project, not maintaining it
- If major bugs were fixed, call them out explicitly: "**Fixed:** long-standing issue where X would fail under Y"
- Be specific: name features, APIs, error messages, not vague categories
- Skip: internal refactors, test improvements, doc updates unless they indicate something user-facing

TONE:
- Direct, no filler ("This period saw...", "The team has been busy...", "We're excited to...")
- Bold **key terms** a developer would ctrl+F for
- Write for a technical audience who wants facts, not stakeholder marketing

BAD: "This reporting period includes several important updates across multiple areas of the codebase, demonstrating continued investment in the platform."
GOOD: "**High-impact period.** Added **streaming responses** for chat completions and fixed a **memory leak** affecting long-running connections. Busy month with 47 PRs, mostly substantive feature work."