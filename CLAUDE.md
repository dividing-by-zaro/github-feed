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
- **Database persistence**: User data, repos, and feed groups stored in PostgreSQL via Prisma
- **Per-repo settings**: Each repo can have custom color, display name, and significance filter

## Authentication

- **Google OAuth**: Users authenticate via Google using Passport.js
- **Session-based**: Express sessions store auth state (7-day cookie expiry, domain set to `localhost` in dev)
- **Prisma 7 adapter**: Uses `@prisma/adapter-pg` for database connection
- **ES module env loading**: `env.ts` must be imported first in `index.ts` to load dotenv before other imports (Prisma client initializes on import)

### Auth Flow

1. User clicks "Login with Google" → redirects to `/auth/google`
2. Google OAuth flow → callback to `/auth/google/callback`
3. Passport creates/finds user in database, establishes session
4. Frontend calls `/auth/me` to get current user

### Environment Variables

Place `.env` in the **repo root** (not server folder). The server loads it via `env.ts`.

```
DATABASE_URL=postgresql://...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
SESSION_SECRET=...
GITHUB_TOKEN=...  # Optional, for higher rate limits
```

## API Flow

1. User adds repo URL
2. Server fetches merged PRs and releases from GitHub API
3. Each PR is classified by OpenAI (category, significance, title, bullet summary)
4. Results returned and stored in localStorage

## Classification Categories

- feature, enhancement, bugfix, breaking, deprecation, performance, security, docs

## Significance Levels

- major, minor, patch, internal
