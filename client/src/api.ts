import type { FeedGroup, Release } from './types';

interface AnalyzeResponse {
  repo: {
    owner: string;
    name: string;
    description: string;
    defaultBranch: string;
    avatarUrl: string;
  };
  feedGroups: FeedGroup[];
  releases: Release[];
}

export async function analyzeRepo(
  repoUrl: string,
  openaiApiKey: string,
  githubToken?: string,
  since?: string
): Promise<AnalyzeResponse> {
  const response = await fetch('/api/repos/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repoUrl,
      openaiApiKey,
      githubToken,
      since,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to analyze repo');
  }

  return response.json();
}
