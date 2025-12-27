# GitHub Feed

**Stop missing important updates in the repos you care about.**

GitHub Feed monitors repositories and uses AI to surface what matters: new features, breaking changes, security fixes, and more—all in one unified feed.

![GitHub Feed Interface](docs/screenshots/feed-view.png)

## Why?

Watching GitHub repos gives you a firehose of commits. Release notes are often incomplete or delayed. GitHub Feed solves this by:

- **Analyzing merged PRs** with AI to extract meaningful changes
- **Classifying by impact** (major, minor, patch, internal) so you see what matters
- **Categorizing changes** (feature, bugfix, breaking, security, etc.)
- **Summarizing in plain English** with bullet points, not commit messages

Perfect for teams tracking dependencies, educators monitoring teaching materials, or anyone who needs to stay current with multiple repos.

## Features

| Feature | Description |
|---------|-------------|
| **Smart Classification** | AI categorizes each PR by type and significance |
| **Unified Feed** | All repos in one chronological view |
| **Filtering** | Show only major changes, or filter by category |
| **Per-Repo Settings** | Custom colors, names, and feed preferences |
| **Starred Changes** | Save important updates for later |
| **Releases Feed** | Dedicated view for version releases |

## Quick Start

1. **Set up environment variables** in `.env` (repo root):
   ```
   DATABASE_URL=postgresql://...
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   SESSION_SECRET=your-session-secret
   ```

2. **Install & run:**
   ```bash
   npm install
   npm run dev
   ```

3. **Login with Google** and configure API keys in Settings

4. **Add a repo to track**

## API Keys Required

| Key | Purpose | Get it at |
|-----|---------|-----------|
| **OpenAI API Key** | Classifies PR changes | [platform.openai.com](https://platform.openai.com/api-keys) |
| **GitHub Token** | Higher rate limits (5k/hr vs 60/hr) | [github.com/settings/tokens](https://github.com/settings/tokens) |

> **Note:** GitHub tokens expire. Fine-grained tokens default to 30 days.

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (Railway) + Prisma 7
- **Auth:** Google OAuth via Passport.js
- **APIs:** GitHub (Octokit), OpenAI (gpt-4o-mini)

## License

MIT
