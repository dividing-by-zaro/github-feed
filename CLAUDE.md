# GitHub Feed - Project Guide

## Project Overview

A web app that monitors GitHub repositories and uses LLM to classify/summarize changes into a readable feed. Target audience: teams who need to track when repos they care about have significant updates.

## Tech Stack

- **Frontend**: React + Vite + TypeScript (`/client`)
- **Backend**: Node.js + Express + TypeScript (`/server`)
- **GitHub API**: Octokit
- **LLM**: OpenAI API (gpt-4o-mini)
- **Styling**: Plain CSS

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
│       ├── hooks/          # Custom hooks (useLocalStorage)
│       ├── utils/          # Utilities (colors)
│       ├── api.ts          # API client
│       └── types.ts        # TypeScript types
├── server/                 # Node.js backend (Express)
│   └── src/
│       ├── routes/         # Express routes
│       ├── services/       # GitHub & classifier services
│       └── types.ts        # TypeScript types
└── package.json            # Root package.json with scripts
```

## Key Architecture Decisions

- **One classification per PR**: LLM returns a single high-level summary per PR, not multiple granular changes
- **Daily batching**: 2+ PRs on the same day get grouped into a "daily batch"
- **localStorage persistence**: All state stored client-side (no auth for MVP)
- **Per-repo settings**: Each repo can have custom color, display name, and significance filter

## API Flow

1. User adds repo URL
2. Server fetches merged PRs and releases from GitHub API
3. Each PR is classified by OpenAI (category, significance, title, bullet summary)
4. Results returned and stored in localStorage

## Classification Categories

- feature, enhancement, bugfix, breaking, deprecation, performance, security, docs

## Significance Levels

- major, minor, patch, internal
