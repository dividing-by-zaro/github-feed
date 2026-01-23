export type Category =
  | 'feature'
  | 'enhancement'
  | 'bugfix'
  | 'breaking'
  | 'deprecation'
  | 'performance'
  | 'security'
  | 'docs';

export type Significance = 'major' | 'minor' | 'patch' | 'internal';

export type ReleaseType = 'stable' | 'nightly' | 'preview' | 'patch';

export interface Commit {
  sha: string;
  message: string;
  url: string;
}

// Individual PR info for drill-down
export interface PRInfo {
  id: string;
  prNumber: number;
  title: string;
  url: string;
  mergedAt: string;
  author?: string;
  commits: Commit[];
}

// Semantic update - shown in feed
export interface Update {
  id: string;
  repoId: string;
  title: string;
  summary: string | null;
  category: Category;
  significance: Significance;
  date: string;
  createdAt: string; // When indexed - used for "new" badge
  prCount: number;
  commitCount: number;
  prs: PRInfo[];
}

// Release with type classification
export interface Release {
  id: string;
  repoId: string;
  title: string;
  tagName: string;
  url: string;
  publishedAt: string;
  body: string;
  summary?: string;
  releaseType?: ReleaseType;
  baseVersion?: string;
  clusterId?: string;
  isClusterHead?: boolean | null;
}

export type RepoStatus = 'pending' | 'indexing' | 'completed' | 'failed';

export interface Repo {
  id: string;
  globalRepoId: string;
  owner: string;
  name: string;
  url: string;
  description?: string | null;
  avatarUrl?: string | null;
  starCount?: number | null;
  // Custom settings
  displayName?: string | null;
  customColor?: string | null;
  feedSignificance?: Significance[];
  showReleases?: boolean;
  // Indexing status
  status?: RepoStatus;
  progress?: string | null;
  error?: string | null;
  lastFetchedAt?: string | null;
  createdAt?: string;
}

export interface UserSettings {
  visibleSignificance: Significance[];
  visibleCategories: Category[];
}

export interface AppState {
  repos: Repo[];
  updates: Update[];
  releases: Release[];
  starredUpdateIds: string[];
  settings: UserSettings;
}

export const ALL_CATEGORIES: Category[] = [
  'feature',
  'enhancement',
  'bugfix',
  'breaking',
  'deprecation',
  'performance',
  'security',
  'docs',
];

export const ALL_SIGNIFICANCE: Significance[] = [
  'major',
  'minor',
  'patch',
  'internal',
];

export const CATEGORY_LABELS: Record<Category, string> = {
  feature: 'Feature',
  enhancement: 'Enhancement',
  bugfix: 'Bug Fix',
  breaking: 'Breaking Change',
  deprecation: 'Deprecation',
  performance: 'Performance',
  security: 'Security',
  docs: 'Docs',
};

export const SIGNIFICANCE_LABELS: Record<Significance, string> = {
  major: 'Major',
  minor: 'Minor',
  patch: 'Patch',
  internal: 'Internal',
};

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  stable: 'Stable',
  nightly: 'Nightly',
  preview: 'Preview',
  patch: 'Patch',
};

// ============ REPORT TYPES ============

export type ReportStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ReportTheme {
  name: string;
  summary: string;
  relatedPRs: {
    number: number;
    title: string;
    url: string;
  }[];
}

export interface ReportSection {
  significance: 'major' | 'minor' | 'patch';
  themes: ReportTheme[];
}

export interface ReportContent {
  executiveSummary: string;
  sections: ReportSection[];
  metadata: {
    repoName: string;
    repoOwner: string;
    startDate: string;
    endDate: string;
    prCount: number;
    updateCount: number;
    generatedAt: string;
  };
}

export interface Report {
  id: string;
  title: string;
  globalRepoId: string;
  repoOwner: string;
  repoName: string;
  startDate: string;
  endDate: string;
  content: ReportContent | null;
  markdown: string | null;
  status: ReportStatus;
  progress: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportInput {
  globalRepoId: string;
  startDate: string;
  endDate: string;
}
