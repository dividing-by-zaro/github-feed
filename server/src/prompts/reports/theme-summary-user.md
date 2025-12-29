Summarize this theme from {{repoOwner}}/{{repoName}} as scannable bullet points.

Theme: {{themeName}}

Updates:
{{{updateDescriptions}}}

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
- If a bug was fixed, state what broke and what works now