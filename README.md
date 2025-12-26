# GitHub Feed

Monitor GitHub repositories and get LLM-classified summaries of changes. Track PRs, releases, and significant updates across multiple repos in one unified feed.

## Features

- **Smart Classification**: Uses OpenAI to categorize changes (feature, bugfix, breaking, etc.) and rate significance (major, minor, patch, internal)
- **Unified Feed**: View changes from all repos in one place, sorted by date
- **Per-Repo Settings**: Customize display name, color, and which significance levels appear in the feed
- **Starred Changes**: Save important changes for later reference
- **Releases Feed**: Dedicated view for tracking releases

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open http://localhost:5173 and configure your API keys in Settings:
   - **OpenAI API Key** - For classifying changes
   - **GitHub Token** - For higher API rate limits (5,000 vs 60 requests/hour)

## GitHub Token

You need a GitHub Personal Access Token to avoid rate limiting.

### Fine-grained token (recommended)
1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Name it (e.g., "GitHub Feed")
4. Under "Repository access", select the repos you want to track (or "All repositories")
5. Under "Repository permissions", set **Contents** to "Read-only"
6. Generate and copy the token

### Classic token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select the `public_repo` scope (or `repo` for private repos)
4. Generate and copy the token

> **Note:** GitHub tokens expire. Fine-grained tokens default to 30 days. Set a calendar reminder to regenerate your token before it expires.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Node.js + Express + TypeScript
- **GitHub API**: Octokit
- **LLM**: OpenAI API (gpt-4o-mini)
