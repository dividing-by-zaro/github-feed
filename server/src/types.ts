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

// PR data with drill-down info
export interface PRInfo {
  id: string;
  prNumber: number;
  title: string;
  url: string;
  mergedAt: string;
  author?: string;
  commits: Commit[];
}

// Semantic update (LLM-computed) - shown in feed
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
  prs: PRInfo[];  // For drill-down
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
  isClusterHead?: boolean;
}

export interface ReleaseData {
  title: string;
  tagName: string;
  url: string;
  publishedAt: string;
  body: string;
}

export interface RepoInfo {
  owner: string;
  name: string;
  description: string;
  defaultBranch: string;
  avatarUrl: string;
  pushedAt: string | null;
}

export interface AnalyzeRequest {
  repoUrl: string;
  openaiApiKey: string;
  githubToken?: string;
  since?: string;
}

export interface AnalyzeResponse {
  repo: RepoInfo;
  updates: Update[];
  releases: Release[];
}

export interface PRData {
  number: number;
  title: string;
  body: string | null;
  url: string;
  mergedAt: string;
  author?: string;
  labels?: string[];
  commits: CommitData[];
}

export interface CommitData {
  sha: string;
  message: string;
  url: string;
}

// LLM grouping response (Step 1)
export interface PRGroupingResult {
  groups: {
    prNumbers: number[];
    reason: string;  // Why these PRs are grouped
  }[];
}

// LLM summarization response (Step 2)
export interface GroupSummaryResult {
  title: string;
  summary: string;
  category: Category;
  significance: Significance;
}

// Release cluster for same-day/same-version releases
export interface ReleaseCluster {
  clusterId: string;
  baseVersion: string;
  releaseType: ReleaseType;
  releases: ReleaseData[];
}

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

// Theme grouping result from LLM
export interface ThemeGroupingResult {
  themes: {
    name: string;
    significance: Significance;
    updateIds: string[];
    oneLineSummary: string;
  }[];
}

// Theme summary result from LLM
export interface ThemeSummaryResult {
  summary: string;
}

// Executive summary result from LLM
export interface ExecutiveSummaryResult {
  summary: string;
}
