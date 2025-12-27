# GitHub Feed - Project Guide

## Project Overview

A web app that monitors GitHub repositories and uses LLM to classify/summarize changes into a readable feed. Target audience: teams who need to track when repos they care about have significant updates.

## Tech Stack

- **Frontend**: React + Vite + TypeScript (`/client`)
- **Backend**: Node.js + Express + TypeScript (`/server`)
- **GitHub API**: Octokit
- **LLM**: OpenAI API (gpt-4o-mini)
- **Styling**: Plain CSS
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
```

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
│       ├── routes/         # Express routes (auth, repos, user)
│       ├── services/       # GitHub & classifier services
│       ├── env.ts          # Dotenv loader (must import first)
│       ├── db.ts           # Prisma client setup
│       └── types.ts        # TypeScript types
└── package.json            # Root package.json with scripts
```

## Key Architecture Decisions

- **One classification per PR**: LLM returns a single high-level summary per PR, not multiple granular changes
- **Daily batching**: 2+ PRs on the same day get grouped into a "daily batch"
- **Shared indexing layer**: Global tables (`GlobalRepo`, `GlobalFeedGroup`, `GlobalRelease`) store indexed data once; users subscribe via `UserRepo` with custom settings
- **Per-user settings**: Each user's repo subscription has custom color, display name, and significance filter (stored in `UserRepo`)

## Database Schema

**Global tables** (shared across all users):
- `GlobalRepo` - Repo metadata, lastFetchedAt for staleness check
- `GlobalFeedGroup` - Classified PRs with AI-generated summaries
- `GlobalRelease` - Releases with AI-generated summaries

**User tables**:
- `User` - Auth info, preferences, lastSeenAt
- `UserRepo` - User's subscription to a GlobalRepo with custom displayName, customColor, feedSignificance
- `StarredChange` - User's starred items

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
- **lastSeenAt**: Each user tracks when they last marked the feed as read (for "new" badges)
- **Incremental updates**: Only new PRs/releases (not already in database) are fetched and classified
- **Load older updates**: `POST /repos/:id/fetch-recent` fetches last 10 PRs regardless of date, classifies new ones, returns GitHub's `pushedAt` timestamp for "last activity" display

## Classification Categories

- feature, enhancement, bugfix, breaking, deprecation, performance, security, docs

## Significance Levels

- major, minor, patch, internal
