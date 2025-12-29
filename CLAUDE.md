# GitHub Curator - Project Guide

## Project Overview

A web app that monitors GitHub repositories and uses LLM to classify/summarize changes into a readable feed. Target audience: teams who need to track when repos they care about have significant updates.

## Tech Stack

- **Frontend**: React + Vite + TypeScript (`/client`)
- **Backend**: Node.js + Express + TypeScript (`/server`)
- **GitHub API**: Octokit
- **LLM**: OpenAI API (gpt-4o-mini)
- **Styling**: Tailwind CSS v4 (neo-brutalist design)
- **Icons**: lucide-react
- **Database**: PostgreSQL (Railway) + Prisma 7
- **Auth**: Google OAuth via Passport.js

## Development Commands

```bash
# Install all dependencies (root, client, server)
npm install

# Run both client and server in dev mode
npm run dev

# Run only client (port 5173)
npm run dev:client

# Run only server (port 3001)
npm run dev:server

# Kill dev servers (use when ports 3001/5173 are stuck)
pkill -f "tsx watch.*github-feed"; pkill -f "vite.*github-feed"
```

**Restart preference**: When asked to restart the dev servers, first kill existing processes with the pkill command above, then run `npm run dev`.

## Project Structure

```
github-feed/
├── client/                 # React frontend (Vite)
│   └── src/
│       ├── components/     # React components
│       ├── context/        # React context (AuthContext)
│       ├── hooks/          # Custom hooks (useLocalStorage)
│       ├── utils/          # Utilities (colors)
│       ├── api.ts          # API client
│       └── types.ts        # TypeScript types
├── server/                 # Node.js backend (Express)
│   ├── prisma/             # Prisma schema & migrations
│   └── src/
│       ├── auth/           # Passport.js config & middleware
│       ├── prompts/        # LLM prompts as markdown templates
│       │   ├── loader.ts   # Handlebars-based prompt loader
│       │   ├── classifier/ # PR grouping & summary prompts
│       │   └── reports/    # Report generation prompts
│       ├── routes/         # Express routes (auth, repos, user)
│       ├── services/       # GitHub & classifier services
│       ├── env.ts          # Dotenv loader (must import first)
│       ├── db.ts           # Prisma client setup
│       └── types.ts        # TypeScript types
└── package.json            # Root package.json with scripts
```

## Key Architecture Decisions

- **Semantic PR grouping**: LLM groups related PRs (e.g., feature + tests + docs) into a single "Update" with one summary
- **Batched parallel LLM calls**: PRs grouped in batches of 8, processed in parallel (temporally close PRs are more likely to be related)
- **Fetch limits**: Initial index limited to 50 PRs and 20 releases to avoid token limits and long processing times
- **Shared indexing layer**: Global tables (`GlobalRepo`, `GlobalUpdate`, `GlobalRelease`) store indexed data once; users subscribe via `UserRepo` with custom settings
- **Per-user settings**: Each user's repo subscription has custom color, display name, and significance filter (stored in `UserRepo`)
- **Timeline view with date grouping**: Feed items grouped by date with sticky DateHeader components and GapIndicator showing time gaps between updates
- **Tailwind CSS v4**: Uses `@theme inline` for custom color tokens and `@source` directive. Custom component classes (brutal-card, brutal-btn variants) defined in index.css
- **Reports generation**: 3-phase LLM pipeline: (1) semantic theme grouping with action-oriented names, (2) parallel theme summaries as scannable bullet points with bold key terms, (3) impact-first executive summary. Version bumps, dependency updates, and internal tooling classified as `internal` and excluded from reports.
- **Prompt templates**: LLM prompts stored as markdown files in `server/src/prompts/`, loaded via Handlebars for variable interpolation. Use `{{var}}` for escaped values, `{{{var}}}` for raw multi-line content, `{{#if var}}...{{/if}}` for conditionals.

## Database Schema

**Global tables** (shared across all users):
- `GlobalRepo` - Repo metadata, lastFetchedAt for staleness check
- `GlobalUpdate` - Semantic updates (grouped PRs) with AI-generated summaries
- `GlobalPR` - Individual PRs linked to their parent Update
- `GlobalRelease` - Releases with AI-generated summaries

**User tables**:
- `User` - Auth info, preferences, lastSeenAt
- `UserRepo` - User's subscription to a GlobalRepo with custom settings
- `StarredUpdate` - User's starred items
- `Report` - User-generated reports for a repo over a date range (links to User and GlobalRepo)

## Authentication

- **Google OAuth**: Users authenticate via Google using Passport.js
- **Session-based**: Express sessions store auth state (7-day cookie expiry, domain set to `localhost` in dev)
- **Persistent sessions**: Uses `connect-pg-simple` to store sessions in PostgreSQL (survives server restarts)
- **Session table**: Auto-created `session` table (outside Prisma schema) with `sid`, `sess`, `expire` columns
- **Prisma 7 adapter**: Uses `@prisma/adapter-pg` for database connection
- **Shared pg pool**: `db.ts` exports both `prisma` client and raw `pool` (used by session store)
- **ES module env loading**: `env.ts` must be imported first in `index.ts` to load dotenv before other imports (Prisma client initializes on import)

### Auth Flow

1. User clicks "Login with Google" → redirects to `/auth/google`
2. Google OAuth flow → callback to `/auth/google/callback`
3. Passport creates/finds user in database, establishes session
4. Frontend calls `/auth/me` to get current user

### Environment Variables

Place `.env` in the **server/** folder. The server loads it via `env.ts`.

```
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...
OPENAI_API_KEY=sk-...  # Required for PR classification
GITHUB_TOKEN=ghp_...   # Optional, for higher rate limits
```

## API Flow

1. User adds repo URL
2. Server checks if `GlobalRepo` exists for this owner/name
3. If exists and fresh (<1 hour): instantly create `UserRepo` link (no API calls)
4. If missing or stale: fetch PRs/releases from GitHub, classify with OpenAI, store in global tables
5. Results returned to client; future users adding same repo get cached data

## Feed Refresh

- **On-demand refresh**: When user loads feed, stale repos (>1 hour since last fetch) are automatically refreshed
- **lastFetchedAt**: `GlobalRepo.lastFetchedAt` tracks when repo was last checked for updates
- **Incremental updates**: Only new PRs/releases (not already in database) are fetched and classified
- **Load older updates**: `POST /repos/:id/fetch-recent` paginates backwards from oldest known PR, fetching 10 older PRs each time

## "New" Badge System

- **Session-based snapshots**: On first page load of a browser session, `user.lastSeenAt` is snapshotted to `sessionStorage` and server is updated to current time
- **createdAt comparison**: "New" badges compare item's `createdAt` (when indexed) against session snapshot, not the item's activity date
- **Persistence within session**: Badges persist while navigating the site during same browser session; cleared when browser closes
- **Storage key**: `lastSeenAt-{userId}` in sessionStorage

## Classification Categories

- feature, enhancement, bugfix, breaking, deprecation, performance, security, docs

## Significance Levels

- major, minor, patch, internal

## API Endpoints

Key endpoints in `server/src/routes/repos.ts`:
- `GET /api/repos/search?q=...` - Autocomplete search for indexed repos (returns `isFollowed` flag)
- `POST /api/repos` - Add repo (with robust URL parsing)
- `GET /api/repos/feed/all` - Get all feed data, refreshes stale repos
- `POST /api/repos/:id/refresh` - Delete all data for repo and re-index fresh (runs full LLM pipeline)

Reports endpoints in `server/src/routes/reports.ts`:
- `GET /api/reports` - List user's reports
- `POST /api/reports` - Create report (triggers background generation)
- `GET /api/reports/:id` - Get report with status for polling
- `DELETE /api/reports/:id` - Delete report
- `GET /api/reports/:id/markdown` - Export report as markdown

## URL Parsing

`GitHubService.parseRepoUrl()` handles:
- Full URLs, with/without protocol
- Extra path segments (`/tree/main`, `/blob/...`)
- Query params and hash fragments
- `.git` suffix
- Validates github.com domain (rejects other hosts)
