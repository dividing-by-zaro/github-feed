Summarize {{#if isMultiplePRs}}these related PRs{{else}}this PR{{/if}} from {{repoOwner}}/{{repoName}}.
{{#if repoDescription}}Repository: {{repoDescription}}{{/if}}
{{#if isMultiplePRs}}
These {{prCount}} PRs are RELATED and should be summarized as ONE cohesive change.{{/if}}

{{{prDescriptions}}}

Provide:
- title: A clear, plain English title (5-10 words) describing the main change
- summary: 2-4 SHORT bullet points (each starting with "- "). Keep each bullet under 15 words. Focus on what users can do, not implementation details.
- category: one of "feature", "enhancement", "bugfix", "breaking", "deprecation", "performance", "security", "docs"
- significance: one of "major" (new capabilities, breaking changes), "minor" (enhancements), "patch" (bug fixes), "internal" (zero user-facing impact)

SIGNIFICANCE RULES:
- Use "internal" for: version bumps, dependency updates, release prep, CI/CD changes, test-only changes, refactors with no user-facing impact, changelog updates, lock file updates
- If a PR title contains "bump", "version", "release", "deps", "dependency", "chore", or similar → likely "internal"
- Classify by the MOST significant change. If a feature PR includes docs, it's a "feature", not "docs"
- Only use "docs"/"internal" when changes are PURELY documentation or internal tooling

Example: "Bump version to 1.2.0" → internal
Example: "Update dependencies" → internal
Example: "Add human feedback to flows" + "Add docs for human feedback" → feature/major