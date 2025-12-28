import { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAllFeedData,
  addRepo,
  deleteRepo,
  updateRepo,
  getStarredChanges,
  starChange,
  unstarChange,
  markAsSeen,
  fetchRecentUpdates,
} from '../api';
import type {
  Repo,
  FeedGroup,
  Release,
  Category,
  Significance,
} from '../types';
import { ALL_CATEGORIES } from '../types';
import Sidebar from './Sidebar';
import Feed from './Feed';
import FilterBar from './FilterBar';
import AddRepoModal from './AddRepoModal';
import RepoSettingsModal from './RepoSettingsModal';
import ReleaseModal from './ReleaseModal';
import LoginPage from './LoginPage';
import './App.css';

export default function App() {
  const { user, isLoading: authLoading, logout, refetchUser } = useAuth();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [feedGroups, setFeedGroups] = useState<FeedGroup[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'starred' | 'releases'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repo | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<{ release: Release; repoName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [filterSignificance, setFilterSignificance] = useState<Significance[]>(
    user?.visibleSignificance as Significance[] || ['major', 'minor']
  );
  const [filterCategories, setFilterCategories] = useState<Category[]>(
    user?.visibleCategories as Category[] || ALL_CATEGORIES
  );
  const [showReleases, setShowReleases] = useState(true);

  // Load initial data when user is authenticated
  const loadData = useCallback(async () => {
    if (!user) return;

    setDataLoading(true);
    try {
      const [feedData, starred] = await Promise.all([
        getAllFeedData(),
        getStarredChanges(),
      ]);
      setRepos(feedData.repos);
      setFeedGroups(feedData.feedGroups);
      setReleases(feedData.releases);
      setStarredIds(starred);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError('Failed to load data');
    } finally {
      setDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update filters when user settings change
  useEffect(() => {
    if (user?.visibleSignificance) {
      setFilterSignificance(user.visibleSignificance as Significance[]);
    }
    if (user?.visibleCategories) {
      setFilterCategories(user.visibleCategories as Category[]);
    }
  }, [user?.visibleSignificance, user?.visibleCategories]);

  const handleAddRepo = async (repoUrl: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await addRepo(repoUrl);

      // Add new data to state
      const newRepo: Repo = {
        id: result.id,
        owner: result.owner,
        name: result.name,
        url: result.url,
        description: result.description,
        avatarUrl: result.avatarUrl,
        displayName: result.displayName,
        customColor: result.customColor,
        feedSignificance: result.feedSignificance,
        showReleases: result.showReleases,
        lastFetchedAt: result.lastFetchedAt,
      };

      setRepos((prev) => [...prev, newRepo]);
      setFeedGroups((prev) => [
        ...prev,
        ...result.feedGroups.map((fg: FeedGroup) => ({
          ...fg,
          repoId: `${result.owner}/${result.name}`,
        })),
      ]);
      setReleases((prev) => [
        ...prev,
        ...result.releases.map((r: Release) => ({
          ...r,
          repoId: `${result.owner}/${result.name}`,
        })),
      ]);
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveRepo = async (repoId: string) => {
    try {
      // Find the repo to get its database ID
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) return;

      await deleteRepo(repo.id);

      setRepos((prev) => prev.filter((r) => r.id !== repoId));
      setFeedGroups((prev) => prev.filter((g) => g.repoId !== repoId));
      setReleases((prev) => prev.filter((r) => r.repoId !== repoId));
      if (selectedRepoId === repoId) {
        setSelectedRepoId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete repo');
    }
  };

  const handleUpdateRepo = async (updatedRepo: Repo) => {
    try {
      await updateRepo(updatedRepo.id, {
        displayName: updatedRepo.displayName,
        customColor: updatedRepo.customColor,
        feedSignificance: updatedRepo.feedSignificance,
        showReleases: updatedRepo.showReleases,
      });

      setRepos((prev) =>
        prev.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
      );
      setRepoSettingsTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update repo');
    }
  };

  const handleToggleStar = async (changeId: string) => {
    const isStarred = starredIds.includes(changeId);

    // Optimistic update
    setStarredIds((prev) =>
      isStarred ? prev.filter((id) => id !== changeId) : [...prev, changeId]
    );

    try {
      if (isStarred) {
        await unstarChange(changeId);
      } else {
        await starChange(changeId);
      }
    } catch (err) {
      // Revert on error
      setStarredIds((prev) =>
        isStarred ? [...prev, changeId] : prev.filter((id) => id !== changeId)
      );
      console.error('Failed to toggle star:', err);
    }
  };

  const handleMarkAsSeen = async () => {
    try {
      await markAsSeen();
      await refetchUser(); // Refresh user to get updated lastSeenAt
    } catch (err) {
      console.error('Failed to mark as seen:', err);
    }
  };

  const handleFetchRecent = useCallback(async () => {
    if (!selectedRepoId) return { newCount: 0, totalFetched: 0, lastActivityAt: null };

    const result = await fetchRecentUpdates(selectedRepoId);

    // Add new feed groups to state
    if (result.newFeedGroups.length > 0) {
      setFeedGroups((prev) => [...prev, ...result.newFeedGroups]);
    }

    return {
      newCount: result.newPRsClassified,
      totalFetched: result.totalPRsFetched,
      lastActivityAt: result.lastActivityAt,
    };
  }, [selectedRepoId]);

  // Check if there are any new items
  const hasNewItems = useMemo(() => {
    if (!user?.lastSeenAt) return feedGroups.length > 0 || releases.length > 0;
    const lastSeen = new Date(user.lastSeenAt);
    return (
      feedGroups.some((g) => new Date(g.date) > lastSeen) ||
      releases.some((r) => new Date(r.date) > lastSeen)
    );
  }, [feedGroups, releases, user?.lastSeenAt]);

  // Filter and sort feed items
  const filteredFeed = useMemo(() => {
    if (viewMode === 'releases') {
      return [];
    }

    let groups = [...feedGroups];

    // Find the selected repo to get its "owner/name" format
    const selectedRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;
    const selectedRepoKey = selectedRepo
      ? `${selectedRepo.owner}/${selectedRepo.name}`
      : null;

    if (selectedRepoKey) {
      groups = groups.filter((g) => g.repoId === selectedRepoKey);
    }

    groups = groups
      .map((group) => {
        const repo = repos.find((r) => `${r.owner}/${r.name}` === group.repoId);

        // When viewing a specific repo, only apply that repo's feedSignificance (no UI filters)
        // When viewing "All Repos", apply intersection of repo's feedSignificance AND UI filter
        if (selectedRepoKey) {
          const repoSignificance = repo?.feedSignificance ?? ['major', 'minor', 'patch', 'internal'];
          return {
            ...group,
            changes: group.changes.filter((change) =>
              repoSignificance.includes(change.significance)
            ),
          };
        }

        // "All Repos" view: apply both repo's feedSignificance AND UI filters
        const repoSignificance = repo?.feedSignificance ?? filterSignificance;
        const effectiveSignificance = filterSignificance.filter((s) =>
          repoSignificance.includes(s)
        );

        return {
          ...group,
          changes: group.changes.filter(
            (change) =>
              effectiveSignificance.includes(change.significance) &&
              filterCategories.includes(change.category)
          ),
        };
      })
      .filter((group) => group.changes.length > 0);

    if (viewMode === 'starred') {
      groups = groups
        .map((group) => ({
          ...group,
          changes: group.changes.filter((change) =>
            starredIds.includes(`${group.repoId}-${change.id}`)
          ),
        }))
        .filter((group) => group.changes.length > 0);
    }

    return groups.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [
    feedGroups,
    repos,
    selectedRepoId,
    filterSignificance,
    filterCategories,
    viewMode,
    starredIds,
  ]);

  const filteredReleases = useMemo(() => {
    if (viewMode === 'starred') {
      return [];
    }

    const selectedRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;
    const selectedRepoKey = selectedRepo
      ? `${selectedRepo.owner}/${selectedRepo.name}`
      : null;

    // When viewing "All Repos", respect the global showReleases toggle
    if (!selectedRepoKey && !showReleases) {
      return [];
    }

    let rel = [...releases];
    if (selectedRepoKey) {
      // Viewing a specific repo: show releases only if repo's showReleases is true
      if (selectedRepo?.showReleases === false) {
        return [];
      }
      rel = rel.filter((r) => r.repoId === selectedRepoKey);
    } else {
      // "All Repos" view: filter out releases from repos with showReleases: false
      rel = rel.filter((r) => {
        const repo = repos.find((repo) => `${repo.owner}/${repo.name}` === r.repoId);
        return repo?.showReleases !== false;
      });
    }
    return rel.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [releases, repos, selectedRepoId, viewMode, showReleases]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="loading-spinner" />
          <div className="loading-text">Loading...</div>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app">
      <header className="header">
        <h1>GitHub Curator</h1>
        <div className="header-actions">
          {hasNewItems && (
            <button onClick={handleMarkAsSeen} className="mark-read-btn">
              Mark all as read
            </button>
          )}
          <button onClick={() => setShowAddModal(true)}>Add Repo</button>
          <div className="user-menu-container">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="user-menu-btn"
            >
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="user-avatar" />
              )}
              <span className="user-name">{user.name?.split(' ')[0] || 'User'}</span>
            </button>
            {showUserMenu && (
              <>
                <div className="user-menu-backdrop" onClick={() => setShowUserMenu(false)} />
                <div className="user-menu-dropdown">
                  <button onClick={() => { logout(); setShowUserMenu(false); }}>
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="main-layout">
        <Sidebar
          repos={repos}
          selectedRepoId={selectedRepoId}
          viewMode={viewMode}
          onSelectRepo={(repoId) => {
            setSelectedRepoId(repoId);
            if (repoId) setViewMode('all');
          }}
          onSelectView={(mode) => {
            setViewMode(mode);
            setSelectedRepoId(null);
          }}
          onOpenRepoSettings={setRepoSettingsTarget}
        />

        <main className="content">
          {error && (
            <div className="error-banner">
              {error}
              <button onClick={() => setError(null)}>×</button>
            </div>
          )}

          <div className="page-header">
            <h1 className="page-title">
              {selectedRepoId
                ? repos.find((r) => r.id === selectedRepoId)?.displayName ||
                  repos.find((r) => r.id === selectedRepoId)?.name ||
                  'Repository'
                : viewMode === 'starred'
                  ? 'Starred'
                  : viewMode === 'releases'
                    ? 'Releases'
                    : 'All Repos'}
            </h1>

            {!selectedRepoId && viewMode !== 'releases' && (
              <FilterBar
                selectedSignificance={filterSignificance}
                selectedCategories={filterCategories}
                showReleases={showReleases}
                onSignificanceChange={setFilterSignificance}
                onCategoriesChange={setFilterCategories}
                onShowReleasesChange={setShowReleases}
              />
            )}
          </div>

          {isLoading || dataLoading ? (
            <div className="loading">
              <div className="loading-spinner" />
              <div className="loading-text">
                {isLoading ? 'Analyzing repository...' : 'Loading feed...'}
              </div>
              {isLoading && (
                <div className="loading-subtext">Fetching PRs and classifying changes</div>
              )}
            </div>
          ) : (
            <Feed
              feedGroups={filteredFeed}
              releases={filteredReleases}
              starredIds={starredIds}
              onToggleStar={handleToggleStar}
              onReleaseClick={(release, repoName) => setSelectedRelease({ release, repoName })}
              repos={repos}
              lastSeenAt={user.lastSeenAt}
              selectedRepo={selectedRepoId ? repos.find((r) => r.id === selectedRepoId) : null}
              onFetchRecent={selectedRepoId ? handleFetchRecent : undefined}
            />
          )}
        </main>
      </div>

      {showAddModal && (
        <AddRepoModal
          onAdd={handleAddRepo}
          onClose={() => setShowAddModal(false)}
          isLoading={isLoading}
        />
      )}

      {repoSettingsTarget && (
        <RepoSettingsModal
          repo={repoSettingsTarget}
          onSave={handleUpdateRepo}
          onDelete={handleRemoveRepo}
          onClose={() => setRepoSettingsTarget(null)}
        />
      )}

      {selectedRelease && (
        <ReleaseModal
          release={selectedRelease.release}
          repoName={selectedRelease.repoName}
          onClose={() => setSelectedRelease(null)}
        />
      )}
    </div>
  );
}
