## GitHub Feed - Product Specification

### Problem Statement

Release notes are often incomplete, delayed, or too high-level. Developers and teams who depend on open-source tools need to know when specific capabilities land—not just when they're officially announced. For teams building educational content around rapidly evolving technologies, missing a significant change can mean outdated course material.

### Target Audience

Primary: Educational teams building courses on AI/CS technologies who need to:
- Monitor repos while building courses to catch relevant changes
- Identify when big updates warrant new course content or revisions
- Stay informed about feature additions, breaking changes, and deprecations

Secondary: Developers tracking dependencies, open-source enthusiasts following projects.

### Core Concept

A web app that monitors GitHub repositories and uses an LLM to classify and summarize changes into a readable feed. Goes beyond release notes to surface meaningful changes at the PR/commit level.

---

## MVP Features

### 1. Repo Management
- Add repos via GitHub URL (e.g., `https://github.com/crewAIInc/crewAI`)
- Remove repos from tracking
- View list of tracked repos
- Data persisted in localStorage (no auth for MVP)

### 2. Feed Display

#### Unified Feed
- Chronological feed of all changes across tracked repos
- Most recent first
- Grouped by PR (default) or daily batches if multiple PRs per day
- Releases shown as separate milestone markers

#### Individual Repo Feed
- Same structure as unified feed, filtered to single repo

#### Feed Item Structure
```
📦 [Repo Name] PR #423 - "Add guardrails support" (Jan 15, 2025)
│
├── 🚀 Feature [Major]: New guardrails API for agents
│   Summary: Introduces a middleware system for adding guardrails...
│   └── "feat: implement guardrails middleware" → [View PR]
│
├── 🚀 Feature [Minor]: Decorator syntax for defining guardrails
│   Summary: New @guardrail decorator simplifies guardrail definition...
│   └── "feat: add @guardrail decorator" → [View PR]
│
└── 📝 Docs [Patch]: Updated agent configuration guide
    Summary: Added examples for guardrails usage...
    └── "docs: guardrails usage examples" → [View PR]
```

Each change within a PR/batch shows:
- Category icon + label
- Significance badge (Major/Minor/Patch)
- LLM-generated title (plain English summary)
- Brief description of what changed and why it matters
- Original commit message
- Link to PR/commit on GitHub

### 3. Filtering

#### By Significance Level
- **Major**: New capabilities, breaking changes, architectural shifts
- **Minor**: Enhancements, new options, quality-of-life improvements
- **Patch**: Bug fixes, small tweaks
- **Internal**: Refactors, tests, docs (hidden by default, can be shown)

#### By Category
- New Feature
- Enhancement
- Bug Fix
- Breaking Change
- Deprecation
- Performance
- Security
- Docs

Users can toggle which significance levels and categories appear in their feed.

### 4. Starring
- Star/save specific updates for later reference
- View starred items in a separate view

### 5. History Loading
- Initial load: 1 month of backfill when repo is added
- "Load more" button to fetch older changes
- Changes stored in localStorage for offline access

---

## Technical Architecture

### Stack
- **Frontend**: React
- **Backend**: Node.js
- **LLM**: OpenAI API (user provides API key, dev key in .env)
- **Storage**: localStorage (MVP), database later
- **Hosting**: Railway (planned)

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
├─────────────────────────────────────────────────────────────┤
│  React App                                                   │
│  ├── Repo Manager (add/remove repos)                        │
│  ├── Feed View (unified/individual)                         │
│  ├── Filter Controls                                        │
│  └── localStorage (repos, changes, stars, settings)         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Node.js Backend                         │
├─────────────────────────────────────────────────────────────┤
│  ├── GitHub API Integration                                 │
│  │   ├── Fetch merged PRs to main/master                    │
│  │   ├── Fetch commits within PRs                           │
│  │   └── Fetch releases                                     │
│  │                                                          │
│  ├── LLM Classification Service                             │
│  │   ├── Analyze PR/commit content                          │
│  │   ├── Classify by category                               │
│  │   ├── Assign significance level                          │
│  │   ├── Generate plain English summary                     │
│  │   └── Group related changes                              │
│  │                                                          │
│  └── Polling Service                                        │
│      ├── Check repos on schedule (configurable)             │
│      └── Default: every 12 hours                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     External Services                        │
├─────────────────────────────────────────────────────────────┤
│  ├── GitHub API (public repos)                              │
│  └── OpenAI API (classification & summarization)            │
└─────────────────────────────────────────────────────────────┘
```

### GitHub API Usage

**Data to fetch per repo:**
1. Merged PRs to default branch (main/master)
2. Commits within each PR
3. PR metadata (title, description, author, date)
4. Releases (as milestone markers)

**Polling strategy:**
- Default: Every 12 hours
- Configurable per-repo (future: auto-detect based on activity)
- Rate limit aware (5,000 requests/hour for authenticated)

### LLM Classification Prompt Strategy

For each PR, send to OpenAI:
- PR title and description
- Commit messages
- File paths changed (for context, not displayed)
- Repo description/README excerpt (for context)

LLM returns:
```json
{
  "changes": [
    {
      "category": "feature",
      "significance": "major",
      "title": "New guardrails API for agents",
      "summary": "Introduces a middleware system that allows developers to add validation and safety checks to agent responses before they're returned to users.",
      "relatedCommits": ["abc123", "def456"]
    }
  ],
  "isUserFacing": true
}
```

Changes marked `isUserFacing: false` are classified as "Internal" and hidden by default.

---

## User Flows

### Adding a Repo
1. User clicks "Add Repo" button
2. Pastes GitHub URL (e.g., `https://github.com/crewAIInc/crewAI`)
3. System validates URL and fetches repo metadata
4. System begins backfill (1 month of PRs)
5. LLM processes and classifies changes
6. Repo appears in sidebar, changes appear in feed

### Viewing the Feed
1. User opens app → sees unified feed (default)
2. Can click repo in sidebar to see individual feed
3. Can adjust filters (significance, category)
4. Scrolls to see older changes
5. Clicks "Load more" to fetch beyond 1 month

### Starring an Update
1. User sees interesting change in feed
2. Clicks star icon on that change
3. Change saved to "Starred" collection
4. Can view all starred items via Starred view

### Setting Up API Key
1. First visit: prompted to enter OpenAI API key
2. Key stored in localStorage
3. Can update key in settings

---

## Data Models

### Repo
```typescript
interface Repo {
  id: string;
  url: string;
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  addedAt: Date;
  lastPolledAt: Date;
  pollingInterval: number; // hours
}
```

### FeedGroup (PR or Daily Batch)
```typescript
interface FeedGroup {
  id: string;
  repoId: string;
  type: 'pr' | 'daily' | 'release';
  title: string;           // PR title or "Changes on Jan 15"
  prNumber?: number;
  prUrl?: string;
  date: Date;
  changes: Change[];
}
```

### Change
```typescript
interface Change {
  id: string;
  feedGroupId: string;
  category: Category;
  significance: Significance;
  title: string;           // LLM-generated
  summary: string;         // LLM-generated
  commitMessage: string;   // Original
  commitUrl: string;
  isStarred: boolean;
}

type Category =
  | 'feature'
  | 'enhancement'
  | 'bugfix'
  | 'breaking'
  | 'deprecation'
  | 'performance'
  | 'security'
  | 'docs';

type Significance = 'major' | 'minor' | 'patch' | 'internal';
```

### UserSettings
```typescript
interface UserSettings {
  openaiApiKey: string;
  defaultPollingInterval: number;
  visibleSignificance: Significance[];
  visibleCategories: Category[];
}
```

---

## UI Components

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  GitHub Feed                            [Settings] [Add Repo]│
├────────────┬────────────────────────────────────────────────┤
│            │                                                 │
│  Repos     │  Feed                                          │
│  ────────  │  ─────────────────────────────────────────     │
│  All Repos │  [Filter: Major ▼] [Category: All ▼]          │
│  ⭐ Starred │                                                │
│  ────────  │  ┌─────────────────────────────────────────┐  │
│  crewAI    │  │ 📦 crewAI PR #423 - "Guardrails"       │  │
│  claude-co │  │ ├── 🚀 Feature [Major]: New API...     │  │
│  langchain │  │ └── 📝 Docs [Patch]: Updated...        │  │
│            │  └─────────────────────────────────────────┘  │
│            │                                                 │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │ 🏷️ crewAI Release v0.5.0               │  │
│            │  └─────────────────────────────────────────┘  │
│            │                                                 │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │ 📦 langchain PR #1205 - "Memory"       │  │
│            │  │ └── ✨ Enhancement [Minor]: ...        │  │
│            │  └─────────────────────────────────────────┘  │
│            │                                                 │
│            │           [Load More History]                  │
│            │                                                 │
└────────────┴────────────────────────────────────────────────┘
```

### Component Hierarchy
- App
  - Header (logo, settings button, add repo button)
  - Sidebar
    - RepoList
    - RepoItem (with unread indicator)
  - MainContent
    - FilterBar (significance dropdown, category dropdown)
    - Feed
      - FeedGroup (PR/daily/release)
        - ChangeItem (category, significance, title, summary, link, star)
    - LoadMoreButton
  - Modals
    - AddRepoModal
    - SettingsModal (API key, polling interval)

---

## Future Features (Post-MVP)

### UX Improvements
- **Analysis progress indicator**: Show real-time status during repo analysis (e.g., "Fetching PRs...", "Analyzing PR 3/15...", "Classifying changes...")
- Better loading states with estimated time remaining
- **Confirmation dialog when removing a repo**: Prevent accidental deletions
- **Search/filter for repos in sidebar**: Find repos quickly when tracking many
- **Date separators in feed**: Horizontal lines with date labels (e.g., "December 25, 2025") between different days to help orient users in the timeline
- **Toast notifications**: Show feedback for actions (e.g., "Analyzed repo in 17 seconds", "Repo removed", "Settings saved")
- **Fix password manager triggers**: Prevent password managers from activating on filter buttons and "All Repos" click (add autocomplete="off" or proper input types)

### Caching & Performance
- **Cross-user repo caching**: Cache analyzed PRs server-side so multiple users tracking the same repo don't trigger duplicate LLM calls
- Cache invalidation strategy based on new commits
- Reduce redundant GitHub API calls for popular repos

### Authentication & Accounts
- User accounts with email/OAuth
- Sync repos and stars across devices
- Team workspaces with shared repo lists

### Notifications
- Email digest (daily/weekly)
- Push notifications for major changes
- Slack/Discord integration

### Enhanced Filtering
- Custom keyword alerts ("notify me about anything related to authentication")
- Saved filter presets
- Search within feed

### Private Repos
- GitHub OAuth for private repo access
- Org-level access management

### Analytics
- Repo activity trends
- Change frequency graphs
- "Hot" repos indicator

### Improved Polling
- Webhook support for real-time updates
- Smart polling (adjust frequency based on repo activity)
- GitHub App integration

### Export
- Export feed to markdown
- RSS feed generation

---

## Open Questions

1. **Rate limiting**: How to handle OpenAI costs for high-volume repos? Consider caching, batching, or using cheaper models for initial triage.

2. **Accuracy**: How to improve LLM classification accuracy? May need repo-specific context or user feedback loop.

3. **Grouping logic**: When exactly to group PRs into daily batches? Threshold of N PRs per day?

---

## Success Metrics

- User can add a repo and see classified changes within 2 minutes
- LLM correctly classifies significance level 80%+ of the time
- Feed loads in under 1 second
- Users check the feed at least weekly
