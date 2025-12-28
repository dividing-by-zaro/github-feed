# GitHub Curator

**Stop missing important updates in the repos you care about.**

GitHub Curator monitors repositories and uses AI to surface what matters: new features, breaking changes, security fixes, and more—all in one unified feed.

https://github.com/user-attachments/assets/ed17e7f1-349d-41c7-ba63-ddd42e921fac

## Why?

Watching GitHub repos gives you a firehose of commits. Release notes are often incomplete or delayed. GitHub Curator solves this by:

- **Analyzing merged PRs** with AI to extract meaningful changes
- **Classifying by impact** (major, minor, patch, internal) so you see what matters
- **Categorizing changes** (feature, bugfix, breaking, security, etc.)
- **Summarizing in plain English** with bullet points, not commit messages

Perfect for teams tracking dependencies, educators monitoring teaching materials, or anyone who needs to stay current with multiple repos.

## Features

| Feature | Description |
|---------|-------------|
| **Semantic Grouping** | AI groups related PRs (feature + tests + docs) into single updates |
| **Release Summaries** | AI-generated bullet points for release notes |
| **Unified Feed** | All repos in one chronological view |
| **Dropdown Filters** | Filter by levels and categories via dropdown menus with select/deselect all |
| **Per-Repo Settings** | Custom colors, names, significance filters, and release visibility per repo |
| **Starred Changes** | Save important updates for later |
| **Release Modal** | Click releases to view full rendered markdown notes |
| **New Badges** | Highlights unseen changes since your last visit |
| **Timeline View** | Date-grouped feed with sticky headers and gap indicators showing time between updates |
| **Page Title** | Dynamic title showing current view with inline filters |
| **User Menu** | Profile picture and name with dropdown for Manage Repos and logout |
| **Manage Repos** | View all subscribed repos, sort by date or name, delete with confirmation |
| **Shared Indexing** | Repos indexed once, shared across all users for instant adds |
| **Auto-Refresh** | Fetches new PRs/releases on page load (hourly) |
| **Load Older Updates** | Paginate backwards through PR history |
| **Smart Autocomplete** | Search indexed repos when adding, with instant add for pre-indexed repos |
| **Flexible URL Input** | Paste any GitHub URL format—extra paths, query params, etc. are handled |
| **Neo-Brutalist Design** | Bold colors, thick borders, offset shadows via Tailwind CSS v4 |

## Quick Start

1. **Set up environment variables** in `server/.env`:
   ```
   DATABASE_URL=postgresql://...
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   SESSION_SECRET=your-session-secret
   OPENAI_API_KEY=sk-...
   GITHUB_TOKEN=ghp_...
   ```

2. **Install & run:**
   ```bash
   npm install
   npm run dev
   ```

3. **If ports are stuck**, kill dev servers first:
   ```bash
   pkill -f "tsx watch.*github-feed"; pkill -f "vite.*github-feed"
   npm run dev
   ```

4. **Login with Google** and start adding repos

## Server Configuration

Add these API keys to your server `.env` file:

| Key | Purpose | Get it at |
|-----|---------|-----------|
| **OPENAI_API_KEY** | Classifies PR changes | [platform.openai.com](https://platform.openai.com/api-keys) |
| **GITHUB_TOKEN** | Higher rate limits (5k/hr vs 60/hr) | [github.com/settings/tokens](https://github.com/settings/tokens) |

> **Note:** GitHub tokens expire. Fine-grained tokens default to 30 days.

## Tech Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS v4
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (Railway) + Prisma 7
- **Auth:** Google OAuth via Passport.js
- **APIs:** GitHub (Octokit), OpenAI (gpt-4o-mini)

## Planned features

- [x] Fix repo owner images not displaying
- [x] Persistent sessions (stay logged in across page reloads)
- [x] Shared indexing layer (repos indexed once, shared across users)
- [x] AI-generated release summaries
- [x] Clickable release cards with markdown modal
- [x] Repo avatars in sidebar
- [ ] Auto-mark items as seen on scroll + unread count badge ([spec](docs/auto-mark-seen-on-scroll.md))
- [ ] User profile page
- [ ] Show API usage to users ([spec](docs/llm-usage-tracking.md))
- [x] Suggest already indexed repos when adding
- [ ] Background cron job for repo updates (currently on-demand)
- [ ] User repo semantic queries with questions like "When was support for guardrails added"?
- [ ] Stripe integration for paid plans
- [x] Semantic PR grouping (related PRs merged into single updates)
- [x] Batched parallel LLM calls for faster indexing
- [ ] Per-repo "refresh" button to regenerate summaries if users suspect an issue (with a gentle reminder that this costs us money)

## License

MIT
