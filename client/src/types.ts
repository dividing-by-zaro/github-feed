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

export interface Repo {
  id: string;
  owner: string;
  name: string;
  url: string;
  description?: string | null;
  avatarUrl?: string | null;
  // Custom settings
  displayName?: string | null;
  customColor?: string | null;
  feedSignificance?: Significance[];
  showReleases?: boolean;
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
