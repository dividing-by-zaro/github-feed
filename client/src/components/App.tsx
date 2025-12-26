import { useState, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { analyzeRepo } from '../api';
import type {
  Repo,
  FeedGroup,
  Release,
  UserSettings,
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
import './App.css';

const DEFAULT_SETTINGS: UserSettings = {
  openaiApiKey: '',
  githubToken: '',
  visibleSignificance: ['major', 'minor', 'patch'],
  visibleCategories: ALL_CATEGORIES,
};

export default function App() {
  const [repos, setRepos] = useLocalStorage<Repo[]>('github-feed-repos', []);
  const [feedGroups, setFeedGroups] = useLocalStorage<FeedGroup[]>(
    'github-feed-groups',
    []
  );
  const [releases, setReleases] = useLocalStorage<Release[]>(
    'github-feed-releases',
    []
  );
  const [starredIds, setStarredIds] = useLocalStorage<string[]>(
    'github-feed-starred',
    []
  );
  const [settings, setSettings] = useLocalStorage<UserSettings>(
    'github-feed-settings',
    DEFAULT_SETTINGS
  );

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'starred' | 'releases'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterSignificance, setFilterSignificance] = useState<Significance[]>(
    settings.visibleSignificance
  );
  const [filterCategories, setFilterCategories] = useState<Category[]>(
    settings.visibleCategories
  );

  const handleAddRepo = async (repoUrl: string) => {
    if (!settings.openaiApiKey) {
      setError('Please set your OpenAI API key in settings first');
      setShowSettingsModal(true);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await analyzeRepo(repoUrl, settings.openaiApiKey, settings.githubToken);

      const newRepo: Repo = {
        id: `${result.repo.owner}/${result.repo.name}`,
        owner: result.repo.owner,
        name: result.repo.name,
        url: repoUrl,
        description: result.repo.description,
        addedAt: new Date().toISOString(),
        avatarUrl: result.repo.avatarUrl,
      };

      // Check if repo already exists
      if (repos.some((r) => r.id === newRepo.id)) {
        setError('This repo is already being tracked');
        return;
      }

      setRepos((prev) => [...prev, newRepo]);
      setFeedGroups((prev) => [...prev, ...result.feedGroups]);
      setReleases((prev) => [...prev, ...result.releases]);
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repo');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveRepo = (repoId: string) => {
    setRepos((prev) => prev.filter((r) => r.id !== repoId));
    setFeedGroups((prev) => prev.filter((g) => g.repoId !== repoId));
    setReleases((prev) => prev.filter((r) => r.repoId !== repoId));
    if (selectedRepoId === repoId) {
      setSelectedRepoId(null);
    }
  };

  const handleUpdateRepo = (updatedRepo: Repo) => {
    setRepos((prev) =>
      prev.map((r) => (r.id === updatedRepo.id ? updatedRepo : r))
    );
    setRepoSettingsTarget(null);
  };

  const handleToggleStar = (changeId: string) => {
    setStarredIds((prev) =>
      prev.includes(changeId)
        ? prev.filter((id) => id !== changeId)
        : [...prev, changeId]
    );
  };

  const handleSaveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    setShowSettingsModal(false);
  };

  // Filter and sort feed items
  const filteredFeed = useMemo(() => {
    // Releases view shows no feed groups
    if (viewMode === 'releases') {
      return [];
    }

    let groups = [...feedGroups];

    // Filter by selected repo
    if (selectedRepoId) {
      groups = groups.filter((g) => g.repoId === selectedRepoId);
    }

    // Filter changes within groups
    groups = groups
      .map((group) => {
        const repo = repos.find((r) => r.id === group.repoId);
        // In "all" view with no repo selected, use per-repo significance settings
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

    // If showing starred, only show groups with starred changes
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

    // Sort by date, newest first
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

  // Get releases for display (not in starred view)
  const filteredReleases = useMemo(() => {
    // Starred view shows no releases
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

  return (
    <div className="app">
      <header className="header">
        <h1>GitHub Feed</h1>
        <div className="header-actions">
          <button onClick={() => setShowSettingsModal(true)}>Settings</button>
          <button onClick={() => setShowAddModal(true)}>Add Repo</button>
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

          {isLoading ? (
            <div className="loading">
              <div className="loading-spinner" />
              <div className="loading-text">Analyzing repository...</div>
              <div className="loading-subtext">Fetching PRs and classifying changes</div>
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
          settings={settings}
          onSave={handleSaveSettings}
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
