import { Octokit } from '@octokit/rest';
import type { PRData, CommitData, RepoInfo, Release } from '../types.js';

export class GitHubService {
  private octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token,
    });
  }

  parseRepoUrl(url: string): { owner: string; name: string } {
    // Normalize: trim whitespace and remove trailing slashes
    const normalized = url.trim().replace(/\/+$/, '');

    // Match github.com URLs, ensuring it's the actual domain (not a subdomain or path containing "github.com")
    // Supports: https://github.com/owner/repo, github.com/owner/repo, www.github.com/owner/repo
    const match = normalized.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/]+)\/([^\/]+)/i);
    if (!match) {
      throw new Error('Invalid GitHub URL. Please use a URL like: https://github.com/owner/repo');
    }

    // Clean up repo name: remove .git suffix, query params, and hash fragments
    const owner = match[1];
    const name = match[2]
      .replace(/\.git$/, '')
      .replace(/[?#].*$/, '');

    // Basic validation: owner and name shouldn't be empty
    if (!owner || !name) {
      throw new Error('Invalid GitHub URL. Could not extract owner and repository name.');
    }

    return { owner, name };
  }

  async getRepoInfo(owner: string, name: string): Promise<RepoInfo> {
    const { data } = await this.octokit.repos.get({ owner, repo: name });
    return {
      owner: data.owner.login,
      name: data.name,
      description: data.description || '',
      defaultBranch: data.default_branch,
      avatarUrl: data.owner.avatar_url,
      pushedAt: data.pushed_at ?? null,
    };
  }

  async getMergedPRs(
    owner: string,
    name: string,
    since: Date
  ): Promise<PRData[]> {
    const prs: PRData[] = [];

    // Fetch closed PRs (we'll filter to merged ones)
    const iterator = this.octokit.paginate.iterator(
      this.octokit.pulls.list,
      {
        owner,
        repo: name,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      }
    );

    for await (const { data: pagePRs } of iterator) {
      for (const pr of pagePRs) {
        // Skip if not merged or merged before our cutoff
        if (!pr.merged_at) continue;

        const mergedAt = new Date(pr.merged_at);
        if (mergedAt < since) {
          // PRs are sorted by updated, so we can't break early
          // but we can skip old ones
          continue;
        }

        // Fetch commits for this PR
        const commits = await this.getPRCommits(owner, name, pr.number);

        prs.push({
          number: pr.number,
          title: pr.title,
          body: pr.body,
          url: pr.html_url,
          mergedAt: pr.merged_at,
          commits,
        });
      }

      // Check if the oldest PR in this page is before our cutoff
      const oldestInPage = pagePRs[pagePRs.length - 1];
      if (oldestInPage?.updated_at) {
        const oldestDate = new Date(oldestInPage.updated_at);
        if (oldestDate < since) {
          break;
        }
      }
    }

    // Sort by merge date, newest first
    return prs.sort(
      (a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime()
    );
  }

  async getRecentMergedPRs(
    owner: string,
    name: string,
    limit: number = 10
  ): Promise<PRData[]> {
    const prs: PRData[] = [];

    const iterator = this.octokit.paginate.iterator(
      this.octokit.pulls.list,
      {
        owner,
        repo: name,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
      }
    );

    for await (const { data: pagePRs } of iterator) {
      for (const pr of pagePRs) {
        if (!pr.merged_at) continue;

        const commits = await this.getPRCommits(owner, name, pr.number);

        prs.push({
          number: pr.number,
          title: pr.title,
          body: pr.body,
          url: pr.html_url,
          mergedAt: pr.merged_at,
          commits,
        });

        if (prs.length >= limit) break;
      }

      if (prs.length >= limit) break;
    }

    return prs.sort(
      (a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime()
    );
  }

  async getPRCommits(
    owner: string,
    name: string,
    prNumber: number
  ): Promise<CommitData[]> {
    try {
      const { data } = await this.octokit.pulls.listCommits({
        owner,
        repo: name,
        pull_number: prNumber,
        per_page: 100,
      });

      return data.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        url: commit.html_url,
      }));
    } catch (error) {
      console.error(`Error fetching commits for PR #${prNumber}:`, error);
      return [];
    }
  }

  async getReleases(
    owner: string,
    name: string,
    since: Date
  ): Promise<Release[]> {
    const releases: Release[] = [];

    try {
      const { data } = await this.octokit.repos.listReleases({
        owner,
        repo: name,
        per_page: 50,
      });

      for (const release of data) {
        const publishedAt = release.published_at
          ? new Date(release.published_at)
          : null;

        if (!publishedAt || publishedAt < since) continue;

        releases.push({
          id: `release-${release.id}`,
          repoId: `${owner}/${name}`,
          type: 'release',
          title: release.name || release.tag_name,
          tagName: release.tag_name,
          url: release.html_url,
          date: release.published_at!,
          body: release.body || '',
        });
      }
    } catch (error) {
      console.error('Error fetching releases:', error);
    }

    return releases;
  }
}
