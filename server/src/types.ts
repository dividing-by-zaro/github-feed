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
}

export interface RepoInfo {
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  avatarUrl: string;
}

export interface AnalyzeRequest {
  repoUrl: string;
  openaiApiKey: string;
  githubToken?: string;
  since?: string;
}

export interface AnalyzeResponse {
  repo: RepoInfo;
  feedGroups: FeedGroup[];
  releases: Release[];
}

export interface PRData {
  number: number;
  title: string;
  body: string | null;
  url: string;
  mergedAt: string;
  commits: CommitData[];
}

export interface CommitData {
  sha: string;
  message: string;
  url: string;
}

export interface ClassifiedChange {
  category: Category;
  significance: Significance;
  title: string;
  summary: string;
}
