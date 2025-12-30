You are analyzing {{prCount}} PRs from {{repoOwner}}/{{repoName}}.
{{#if repoDescription}}Repository: {{repoDescription}}{{/if}}

Your task: Group PRs into a SMALL number of broad themes. Aim for 3-6 themes maximum.

GROUPING PHILOSOPHY:
- Think in terms of HIGH-LEVEL categories, not granular topics
- Merge related sub-themes into parent themes (e.g., "UI improvements" not separate "button styling", "form layout", "modal fixes")
- Group by AREA OF IMPACT: frontend, backend, infrastructure, documentation, testing, etc.
- Related migrations/adoptions should be ONE theme, not split by specific component

BROAD THEME EXAMPLES:
- "Frontend improvements" (not separate themes for each component)
- "API and backend changes" (combines endpoints, services, database)
- "Developer experience" (combines tooling, testing, CI/CD, docs)
- "Bug fixes and stability" (combines all bug fixes unless clearly separate initiatives)
- "Performance optimizations" (combines all perf work)

CLUSTERING RULES:
- Start with the BROADEST possible grouping, then only split if truly unrelated
- PRs touching similar parts of the codebase → same theme
- All bug fixes can often be ONE theme unless they're part of distinct initiatives
- When in doubt, MERGE themes together

CONSTRAINTS:
- Target 3-6 themes for most repositories
- Minimum 3 PRs per theme when possible - merge smaller groups
- Single-PR themes only for truly unique, standalone changes
- Every PR must belong to exactly one theme
- Theme names should be broad: "Frontend updates", "Infrastructure changes", "Bug fixes"

PRs to cluster:
{{{prBriefs}}}

Return themes with:
- name: Descriptive theme name
- prNumbers: Array of PR numbers belonging to this theme
