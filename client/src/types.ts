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

export interface Commit {
  sha: string;
  message: string;
  url: string;
}

export interface Change {
  id: string;
  category: Category;
  significance: Significance;
  title: string;
  summary: string;
  commits: Commit[];
  isStarred?: boolean;
}

export interface FeedGroup {
  id: string;
  repoId: string;
  type: 'pr' | 'daily' | 'release';
  title: string;
  prNumber?: number;
  prUrl?: string;
  date: string;
  changes: Change[];
}

export interface Release {
  id: string;
  repoId: string;
  type: 'release';
  title: string;
  tagName: string;
  url: string;
  date: string;
  body: string;
  summary?: string;
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
  feedSignificance?: Significance[]; // Which significance levels to show in feeds
  showReleases?: boolean; // Whether to show releases in feeds
  lastFetchedAt?: string | null; // When the repo was last checked for updates
}

export interface UserSettings {
  visibleSignificance: Significance[];
  visibleCategories: Category[];
}

export interface AppState {
  repos: Repo[];
  feedGroups: FeedGroup[];
  releases: Release[];
  starredChangeIds: string[];
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

export const CATEGORY_ICONS: Record<Category, string> = {
  feature: '🚀',
  enhancement: '✨',
  bugfix: '🐛',
  breaking: '💥',
  deprecation: '⚠️',
  performance: '⚡',
  security: '🔒',
  docs: '📝',
};

export const SIGNIFICANCE_LABELS: Record<Significance, string> = {
  major: 'Major',
  minor: 'Minor',
  patch: 'Patch',
  internal: 'Internal',
};
