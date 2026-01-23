# GitHub Curator - Project Guide

## Project Overview

A web app that monitors GitHub repositories and uses LLM to classify/summarize changes into a readable feed. Target audience: teams who need to track when repos they care about have significant updates.

## Tech Stack

- **Frontend**: React + Vite + TypeScript (`/client`)
- **Backend**: Node.js + Express + TypeScript (`/server`)

**IMPORTANT**: All TypeScript errors must be fixed before committing. The build will fail on Railway if there are any TS errors (unused imports, type mismatches, etc.).
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
- **Reports generation**: Reports display existing Updates grouped by significance (major/minor/patch) with one LLM call for executive summary. If the date range contains PRs not yet indexed, they're indexed first using the same classifier pipeline as initial repo indexing. Version bumps, dependency updates, and internal tooling classified as `internal` and excluded from reports.
- **Two-phase PR classification**: Initial indexing uses (1) theme clustering to group PRs by broad theme (3-6 themes), then (2) detailed grouping within each theme. Prompts in `classifier/theme-clustering-*.md` favor fewer, broader groups over granular topics.
- **Prompt templates**: LLM prompts stored as markdown files in `server/src/prompts/`, loaded via Handlebars for variable interpolation. Use `{{var}}` for escaped values, `{{{var}}}` for raw multi-line content, `{{#if var}}...{{/if}}` for conditionals.
- **Background indexing**: Repo indexing runs asynchronously after `POST /api/repos` returns. `UserRepo.status` tracks state (`pending`, `indexing`, `completed`, `failed`), `progress` shows current step, `error` captures failures. Frontend polls `GET /api/repos/:id` every 2 seconds during indexing, similar to report generation. "Load older updates" also uses this pattern via `POST /api/repos/:id/fetch-recent`.
- **Duplicate prevention**: Backend uses `groupHash` (SHA256 of sorted PR numbers) with upsert to prevent duplicate GlobalUpdate records. Frontend polling filters out existing update IDs before adding to state.

## Database Schema

**Global tables** (shared across all users):
- `GlobalRepo` - Repo metadata, `lastFetchedAt` for staleness check, `subscriberCount` for sweep prioritization, `starCount` for GitHub stars display, `docsUrl` for documentation link (community-editable), `homepage` from GitHub API
- `GlobalUpdate` - Semantic updates (grouped PRs) with AI-generated summaries. Has `groupHash` field (SHA256 of sorted PR numbers) with unique constraint `[globalRepoId, groupHash]` to prevent duplicates.
- `GlobalPR` - Individual PRs linked to their parent Update. Has unique constraint `[globalRepoId, prNumber]`.
- `GlobalRelease` - Releases with AI-generated summaries

**User tables**:
- `User` - Auth info, preferences, lastSeenAt
- `UserRepo` - User's subscription to a GlobalRepo with custom settings, indexing status (`status`, `progress`, `error`)
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
3. Creates `UserRepo` immediately with `status: 'pending'` (or `'completed'` for cached repos)
4. Returns response immediately; repo appears in sidebar with loading spinner
5. Background task indexes repo (fetch PRs, group with LLM, summarize), updating `progress` field
6. Frontend polls every 2s; when `status: 'completed'`, updates/releases are fetched and displayed

## Feed Refresh

- **Background stale refresh**: When user loads feed, stale repos (>1 hour since last fetch) are refreshed in background. Cached data returns immediately; sidebar shows "Refreshing..." spinner for stale repos. Uses same `indexRepoInBackground` pattern as new repo adds.
- **lastFetchedAt**: `GlobalRepo.lastFetchedAt` tracks when repo was last checked for updates
- **Incremental updates**: Only new PRs/releases (not already in database) are fetched and classified
- **Load older updates**: `POST /repos/:id/fetch-recent` paginates backwards from oldest known PR, fetching 10 older PRs each time
- **Daily sweep**: `node-cron` scheduler runs at 6am UTC, indexes top 100 repos by subscriber count. Sweep service in `server/src/services/sweep.ts` reuses existing classification pipeline. Subscriber counts backfilled on server startup.

## "New" Badge System & Inbox

- **Session-based snapshots**: On first page load of a browser session, `user.lastSeenAt` is snapshotted to `sessionStorage` and server is updated to current time
- **Activity date comparison**: "New" badges compare item's `date` (activity date for updates) or `publishedAt` (for releases) against session snapshot—NOT `createdAt` (indexing time). This prevents old PRs indexed by another user's report from appearing "new".
- **New repo subscription handling**: Updates from repos subscribed after `lastSeenAt` are always shown as "new", ensuring newly-added repos show all their content in the inbox.
- **Persistence within session**: Badges persist while navigating the site during same browser session; cleared when browser closes
- **Storage key**: `lastSeenAt-{userId}` in sessionStorage
- **New badge design**: Golden shimmer badge with sparkle icon, positioned on right side of UpdateCard next to star button
- **Inbox view**: Default landing view showing only "new" items (updates + releases). Shows "You're all caught up!" when empty, "That's it!" at the bottom when items exist.

## Sidebar Navigation

- **Collapsible sections**: Repos and Reports are expandable/collapsible. Clicking the section header navigates to the management page AND expands the list; subsequent clicks toggle expand/collapse.
- **Inbox button**: Top-level button navigates to inbox view (viewMode: 'inbox')
- **Repos section**: Contains "All Repos" as first item (infinity icon), followed by individual repo subscriptions. "All Repos" navigates to combined feed (viewMode: 'all').
- **Reports section**: Lists user's generated reports
- **View modes**: 'inbox' | 'all' | 'starred' | 'my-repos' | 'my-reports'

## Management Pages (MyReposPage, MyReportsPage)

- **Stats dashboard**: Top section shows aggregate metrics (updates in 24h/7d/30d, total PRs, major changes for repos; completed/in-progress/failed counts for reports)
- **Two-row card layout**: Row 1 has avatar, name/owner, action buttons; Row 2 has stats with icons (stars, PRs, dates)
- **Quick actions**: Repos have GitHub link + Settings buttons; Reports have Download button (exports markdown)
- **Clickable cards**: Cards navigate to repo feed or report view; delete handled in settings modal
- **Repo settings modal**: Shows "Last indexed" timestamp, "Check for updates" button (non-destructive incremental refresh)

## GitHub Stars Display

- **Feed header**: Star count shown subtly next to repo name when viewing single repo
- **My Repos page**: Star count in each repo card's stats row
- **Format**: Compact format (e.g., `1.2k`, `15k`, `1.2m`)
- **Updates**: Star count fetched on repo add, manual refresh, background stale refresh, and daily sweep
- **Polling sync**: When repo finishes indexing, `starCount` is included in polling update so feed reflects new stars immediately

## Documentation URLs

- **Community resource**: `docsUrl` stored on `GlobalRepo`, editable by any subscriber with warning
- **Auto-detection**: On indexing, checks GitHub homepage and `{owner}.github.io/{name}` for docs
- **Manual override**: Users can set custom docs URL via repo settings modal (three-step flow: view → confirm → edit)
- **URL validation**: `server/src/services/urlValidator.ts` validates HTTPS and blocks private/internal IPs (SSRF protection)
- **Preservation**: Manually set URLs are never overwritten by auto-detection
- **Feed display**: Shown subtly below repo title with full URL visible
- **API endpoint**: `PUT /api/repos/:globalRepoId/docs` for updating docs URL

## Feed Filtering

- **Global filters**: Significance levels and categories filter via FilterBar component (dropdowns in page header)
- **Consistent filtering**: Same filters apply to Inbox, All Repos, Starred, and individual repo views
- **Repo settings**: Per-repo customization limited to display name and color (feed visibility removed)

## Classification Categories

- feature, enhancement, bugfix, breaking, deprecation, performance, security, docs

## Significance Levels

- major, minor, patch, internal

## API Endpoints

Key endpoints in `server/src/routes/repos.ts`:
- `GET /api/repos/search?q=...` - Autocomplete search for indexed repos (returns `isFollowed` flag)
- `POST /api/repos` - Add repo (with robust URL parsing)
- `GET /api/repos/feed/all` - Get all feed data, refreshes stale repos
- `POST /api/repos/:id/refresh` - Check for new updates since last fetch (incremental, runs in background)
- `PUT /api/repos/:globalRepoId/docs` - Update documentation URL (validates HTTPS, blocks internal IPs)

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
