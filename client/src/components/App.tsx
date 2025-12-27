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
import SettingsModal from './SettingsModal';
import RepoSettingsModal from './RepoSettingsModal';
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterSignificance, setFilterSignificance] = useState<Significance[]>(
    user?.visibleSignificance as Significance[] || ['major', 'minor', 'patch']
  );
  const [filterCategories, setFilterCategories] = useState<Category[]>(
    user?.visibleCategories as Category[] || ALL_CATEGORIES
  );

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
    if (!user?.hasOpenaiKey) {
      setError('Please set your OpenAI API key in settings first');
      setShowSettingsModal(true);
      return;
    }

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

  const handleSettingsSaved = () => {
    setShowSettingsModal(false);
    refetchUser();
  };

  // Filter and sort feed items
  const filteredFeed = useMemo(() => {
    if (viewMode === 'releases') {
      return [];
    }

    let groups = [...feedGroups];

    if (selectedRepoId) {
      groups = groups.filter((g) => g.repoId === selectedRepoId);
    }

    groups = groups
      .map((group) => {
        const repo = repos.find((r) => `${r.owner}/${r.name}` === group.repoId);
        const significanceFilter =
          !selectedRepoId && viewMode === 'all' && repo?.feedSignificance
            ? repo.feedSignificance
            : filterSignificance;

        return {
          ...group,
          changes: group.changes.filter(
            (change) =>
              significanceFilter.includes(change.significance) &&
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

    let rel = [...releases];
    if (selectedRepoId) {
      rel = rel.filter((r) => r.repoId === selectedRepoId);
    }
    return rel.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [releases, selectedRepoId, viewMode]);

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
        <h1>GitHub Feed</h1>
        <div className="header-actions">
          <button onClick={() => setShowSettingsModal(true)}>Settings</button>
          <button onClick={() => setShowAddModal(true)}>Add Repo</button>
          <button onClick={logout} className="logout-btn">
            {user.avatarUrl && (
              <img src={user.avatarUrl} alt="" className="user-avatar" />
            )}
            Logout
          </button>
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

          <FilterBar
            selectedSignificance={filterSignificance}
            selectedCategories={filterCategories}
            onSignificanceChange={setFilterSignificance}
            onCategoriesChange={setFilterCategories}
          />

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
              repos={repos}
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

      {showSettingsModal && (
        <SettingsModal
          hasOpenaiKey={user.hasOpenaiKey}
          hasGithubToken={user.hasGithubToken}
          onSave={handleSettingsSaved}
          onClose={() => setShowSettingsModal(false)}
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
    </div>
  );
}
