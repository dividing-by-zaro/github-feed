You are analyzing {{prCount}} recent PRs from {{repoOwner}}/{{repoName}}.
{{#if repoDescription}}Repository: {{repoDescription}}{{/if}}

Your task: Group these PRs by SEMANTIC CHANGE - what capability or fix they represent together.

Guidelines:
- PRs implementing the same feature across multiple steps → ONE group
- A feature PR + its test PR + its docs PR → ONE group
- A bug fix + its follow-up fixes → ONE group
- Unrelated PRs → SEPARATE groups (each in their own group)
- Dependency bumps from same tool (dependabot) → can be grouped as "Dependency updates"
- Internal refactors with no user impact → can be grouped as "Internal improvements"

PRs to analyze:
{{{prDescriptions}}}

Return a JSON object with groups. Each group should have:
- prNumbers: array of PR numbers that belong together
- reason: brief explanation of why they're grouped (e.g., "Same feature: authentication", "Related bug fixes")

IMPORTANT: Every PR must appear in exactly one group. If a PR is unrelated to others, put it in its own group.