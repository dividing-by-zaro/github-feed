import type { Repo, Update, Release, Category, Significance, Report, CreateReportInput } from './types';

// API base URL - uses environment variable in dev, empty string in production (same origin)
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Helper for fetch with credentials
async function apiFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// Auth endpoints
export async function getCurrentUser() {
  return apiFetch('/auth/me');
}

export async function logout() {
  return apiFetch('/auth/logout', { method: 'POST' });
}

// User settings endpoints
export interface UserSettings {
  visibleSignificance: Significance[];
  visibleCategories: Category[];
}

export async function getUserSettings(): Promise<UserSettings> {
  return apiFetch('/api/user/settings');
}

export async function updateUserSettings(settings: {
  visibleSignificance?: Significance[];
  visibleCategories?: Category[];
}): Promise<UserSettings> {
  return apiFetch('/api/user/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

// Starred updates endpoints
export async function getStarredUpdates(): Promise<string[]> {
  return apiFetch('/api/user/starred');
}

export async function starUpdate(updateId: string): Promise<void> {
  return apiFetch(`/api/user/starred/${encodeURIComponent(updateId)}`, {
    method: 'POST',
  });
}

export async function unstarUpdate(updateId: string): Promise<void> {
  return apiFetch(`/api/user/starred/${encodeURIComponent(updateId)}`, {
    method: 'DELETE',
  });
}

// Mark all feed items as seen
export async function markAsSeen(): Promise<{ lastSeenAt: string }> {
  return apiFetch('/api/user/mark-seen', {
    method: 'POST',
  });
}

// Repo endpoints
export interface RepoWithData extends Repo {
  updates: Update[];
  releases: Release[];
}

export interface FeedData {
  repos: Repo[];
  updates: Update[];
  releases: Release[];
}

export async function getRepos(): Promise<Repo[]> {
  return apiFetch('/api/repos');
}

export async function getRepo(id: string): Promise<RepoWithData> {
  return apiFetch(`/api/repos/${id}`);
}

export async function addRepo(repoUrl: string, since?: string): Promise<RepoWithData> {
  return apiFetch('/api/repos', {
    method: 'POST',
    body: JSON.stringify({ repoUrl, since }),
  });
}

export async function updateRepo(
  id: string,
  data: { displayName?: string | null; customColor?: string | null; feedSignificance?: Significance[]; showReleases?: boolean }
): Promise<Repo> {
  return apiFetch(`/api/repos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRepo(id: string): Promise<void> {
  return apiFetch(`/api/repos/${id}`, {
    method: 'DELETE',
  });
}

export async function getAllFeedData(): Promise<FeedData> {
  return apiFetch('/api/repos/feed/all');
}

export interface FetchRecentResponse {
  newUpdates: Update[];
  totalPRsFetched: number;
  newPRsClassified: number;
  lastActivityAt: string | null;
}

export async function fetchRecentUpdates(repoId: string): Promise<FetchRecentResponse> {
  return apiFetch(`/api/repos/${repoId}/fetch-recent`, {
    method: 'POST',
  });
}

export interface RefreshResponse {
  status: string;
  message: string;
}

export async function refreshRepo(repoId: string): Promise<RefreshResponse> {
  return apiFetch(`/api/repos/${repoId}/refresh`, {
    method: 'POST',
  });
}

// Search indexed repos for autocomplete
export interface IndexedRepo {
  id: string;
  owner: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  url: string;
  isFollowed: boolean;
}

export async function searchIndexedRepos(query: string): Promise<IndexedRepo[]> {
  if (query.length < 2) return [];
  return apiFetch(`/api/repos/search?q=${encodeURIComponent(query)}`);
}

// Update docs URL for a GlobalRepo (community resource)
export async function updateRepoDocsUrl(
  globalRepoId: string,
  docsUrl: string | null
): Promise<{ id: string; docsUrl: string | null; docsValidatedAt: string | null }> {
  return apiFetch(`/api/repos/${encodeURIComponent(globalRepoId)}/docs`, {
    method: 'PUT',
    body: JSON.stringify({ docsUrl }),
  });
}

// ============ REPORT ENDPOINTS ============

export async function getReports(): Promise<Report[]> {
  return apiFetch('/api/reports');
}

export async function getReport(id: string): Promise<Report> {
  return apiFetch(`/api/reports/${encodeURIComponent(id)}`);
}

export async function createReport(data: CreateReportInput): Promise<Report> {
  return apiFetch('/api/reports', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteReport(id: string): Promise<void> {
  return apiFetch(`/api/reports/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function getReportMarkdown(id: string): Promise<{ markdown: string; filename: string }> {
  return apiFetch(`/api/reports/${encodeURIComponent(id)}/markdown`);
}
