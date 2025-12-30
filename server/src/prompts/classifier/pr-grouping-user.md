You are analyzing {{prCount}} PRs from {{repoOwner}}/{{repoName}} that belong to the same theme: "{{themeName}}".
{{#if repoDescription}}Repository: {{repoDescription}}{{/if}}

Your task: Create SEMANTIC GROUPS within this theme - what specific capability or fix does each group represent?

GROUPING RULES:
- PRs implementing the same feature across multiple steps → ONE group
- A feature PR + its test PR + its docs PR → ONE group
- A bug fix + its follow-up fixes → ONE group
- PRs by the same author merged close together on related work → likely ONE group
- PRs referencing the same issue number → ONE group

AGGRESSIVE GROUPING (prefer fewer, larger groups):
- These PRs are already clustered by theme, so they're likely related
- When PRs could reasonably be grouped OR separate, GROUP them
- Single-PR groups should be the exception, not the rule
- Look for: similar file paths, same author, sequential PR numbers, related titles

EXAMPLE GROUPINGS:
- "Migrate settings to Inertia" + "Migrate profile to Inertia" + "Fix Inertia navigation" → ONE group: "Settings and profile Inertia migration"
- "Fix mobile header" + "Fix mobile sidebar" + "Mobile responsive tweaks" → ONE group: "Mobile layout fixes"
- "Add user auth" + "Add auth tests" + "Auth error handling" → ONE group: "User authentication"

PRs to analyze:
{{{prDescriptions}}}

Return a JSON object with groups. Each group should have:
- prNumbers: array of PR numbers that belong together
- reason: brief explanation of why they're grouped (e.g., "Same migration: Inertia pages", "Related mobile fixes")

IMPORTANT: Every PR must appear in exactly one group.
