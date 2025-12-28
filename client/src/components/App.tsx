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
import MyReposPage from './MyReposPage';
import { Plus, ChevronDown, LogOut, CheckCheck, FolderGit2 } from 'lucide-react';

export default function App() {
  const { user, isLoading: authLoading, logout, refetchUser } = useAuth();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [feedGroups, setFeedGroups] = useState<FeedGroup[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'starred' | 'releases' | 'my-repos'>('all');
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
      setStarredIds((prev) =>
        isStarred ? [...prev, changeId] : prev.filter((id) => id !== changeId)
      );
      console.error('Failed to toggle star:', err);
    }
  };

  const handleMarkAsSeen = async () => {
    try {
      await markAsSeen();
      await refetchUser();
    } catch (err) {
      console.error('Failed to mark as seen:', err);
    }
  };

  const handleFetchRecent = useCallback(async () => {
    if (!selectedRepoId) return { newCount: 0, totalFetched: 0, lastActivityAt: null };

    const result = await fetchRecentUpdates(selectedRepoId);

    if (result.newFeedGroups.length > 0) {
      setFeedGroups((prev) => [...prev, ...result.newFeedGroups]);
    }

    return {
      newCount: result.newPRsClassified,
      totalFetched: result.totalPRsFetched,
      lastActivityAt: result.lastActivityAt,
    };
  }, [selectedRepoId]);

  const hasNewItems = useMemo(() => {
    if (!user?.lastSeenAt) return feedGroups.length > 0 || releases.length > 0;
    const lastSeen = new Date(user.lastSeenAt);
    return (
      feedGroups.some((g) => new Date(g.date) > lastSeen) ||
      releases.some((r) => new Date(r.date) > lastSeen)
    );
  }, [feedGroups, releases, user?.lastSeenAt]);

  const filteredFeed = useMemo(() => {
    if (viewMode === 'releases') {
      return [];
    }

    let groups = [...feedGroups];

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

        if (selectedRepoKey) {
          const repoSignificance = repo?.feedSignificance ?? ['major', 'minor', 'patch', 'internal'];
          return {
            ...group,
            changes: group.changes.filter((change) =>
              repoSignificance.includes(change.significance)
            ),
          };
        }

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

    if (!selectedRepoKey && !showReleases) {
      return [];
    }

    let rel = [...releases];
    if (selectedRepoKey) {
      if (selectedRepo?.showReleases === false) {
        return [];
      }
      rel = rel.filter((r) => r.repoId === selectedRepoKey);
    } else {
      rel = rel.filter((r) => {
        const repo = repos.find((repo) => `${repo.owner}/${repo.name}` === r.repoId);
        return repo?.showReleases !== false;
      });
    }
    return rel.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [releases, repos, selectedRepoId, viewMode, showReleases]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gray-100 border-t-mint rounded-full animate-spin" />
          <p className="font-medium text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <header className="bg-white border-b-3 border-black px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">GitHub Curator</h1>

        <div className="flex items-center gap-3">
          {hasNewItems && (
            <button
              onClick={handleMarkAsSeen}
              className="brutal-btn brutal-btn-mint"
            >
              <CheckCheck size={16} />
              Mark all read
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="brutal-btn brutal-btn-yellow"
          >
            <Plus size={16} />
            Add Repo
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-full border-2 border-black bg-white hover:bg-cream-dark transition-colors"
            >
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-7 h-7 rounded-full border-2 border-black"
                />
              )}
              <span className="font-semibold text-sm">
                {user.name?.split(' ')[0] || 'User'}
              </span>
              <ChevronDown size={14} />
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-40 bg-white border-3 border-black rounded-lg shadow-brutal z-50 overflow-hidden animate-slide-down">
                  <button
                    onClick={() => {
                      setViewMode('my-repos');
                      setSelectedRepoId(null);
                      setShowUserMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left font-medium text-sm hover:bg-mint/20 flex items-center gap-2 transition-colors border-b border-black/10"
                  >
                    <FolderGit2 size={16} />
                    Manage Repos
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left font-medium text-sm hover:bg-coral/20 flex items-center gap-2 transition-colors"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1">
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

        <main className="flex-1 p-6 max-w-4xl">
          {error && (
            <div className="mb-4 p-4 bg-coral/20 border-3 border-black rounded-lg flex items-center justify-between animate-bounce-in">
              <span className="font-medium text-black">{error}</span>
              <button
                onClick={() => setError(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/10 transition-colors text-xl font-bold"
              >
                &times;
              </button>
            </div>
          )}

          {viewMode === 'my-repos' ? (
            <MyReposPage
              repos={repos}
              onOpenSettings={setRepoSettingsTarget}
              onDelete={handleRemoveRepo}
            />
          ) : (
            <>
              {/* Page Header */}
              <div className="flex items-center justify-between mb-6 gap-4">
                <h1 className="text-3xl font-bold">
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
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-12 h-12 border-4 border-gray-100 border-t-yellow rounded-full animate-spin" />
                  <p className="font-medium text-gray-500">
                    {isLoading ? 'Analyzing repository...' : 'Loading feed...'}
                  </p>
                  {isLoading && (
                    <p className="text-sm text-gray-300">Fetching PRs and classifying changes</p>
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
            </>
          )}
        </main>
      </div>

      {/* Modals */}
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
