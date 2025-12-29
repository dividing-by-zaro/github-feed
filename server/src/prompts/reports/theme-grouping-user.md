You are analyzing {{updateCount}} updates from {{repoOwner}}/{{repoName}}.
{{#if repoDescription}}Repository: {{repoDescription}}{{/if}}

Group these updates into SPECIFIC themes based on what was actually built or fixed.

NAMING RULES:
- Theme names MUST start with an action verb: "Add", "Fix", "Improve", "Remove", "Update", "Support"
- Theme names MUST mention the specific feature, API, or system affected
- Theme names should be narrow enough that only truly related changes belong together

BAD NAMES (too vague):
- "Authentication Improvements"
- "UI Enhancements"
- "Security Fixes"
- "Performance Optimizations"
- "Bug Fixes"

GOOD NAMES:
- "Add SSO support for Google and Okta"
- "Add toast notifications for async operations"
- "Add streaming response support for chat completions"
- "Fix rate limiting for concurrent requests"
- "Add dark mode toggle and theme persistence"
- "Support custom validators in form inputs"

GROUPING RULES:
- Only group updates that are directly related to the SAME feature or fix
- Don't group unrelated changes just because they're both "performance" or both "UI"
- Prefer more themes (5-10) over fewer vague themes
- If an update doesn't fit with others, give it its own theme

Updates to analyze:
{{{updateDescriptions}}}

Return themes with:
- name: Action-oriented, specific theme name (verb + what changed)
- significance: The highest significance level among the theme's updates (major > minor > patch)
- updateIds: Array of update IDs that belong to this theme
- oneLineSummary: A single sentence with concrete details about what changed