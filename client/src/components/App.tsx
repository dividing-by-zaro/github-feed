import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getAllFeedData,
  addRepo,
  deleteRepo,
  updateRepo,
  getStarredUpdates,
  starUpdate,
  unstarUpdate,
  markAsSeen,
  fetchRecentUpdates,
  refreshRepo,
  getReports,
  getReport,
  createReport,
  deleteReport as deleteReportApi,
  getReportMarkdown,
  getRepo,
} from '../api';
import type {
  Repo,
  Update,
  Release,
  Category,
  Significance,
  Report,
  CreateReportInput,
} from '../types';
import { ALL_CATEGORIES } from '../types';
import Sidebar from './Sidebar';
import Feed from './Feed';
import FilterBar from './FilterBar';
import AddRepoModal from './AddRepoModal';
import RepoSettingsModal from './RepoSettingsModal';
import ReleaseModal from './ReleaseModal';
import CreateReportModal from './CreateReportModal';
import ReportViewer from './ReportViewer';
import LoginPage from './LoginPage';
import MyReposPage from './MyReposPage';
import MyReportsPage from './MyReportsPage';
import { Plus, ChevronDown, LogOut, FolderGit2, FileText } from 'lucide-react';

export default function App() {
  const { user, isLoading: authLoading, logout } = useAuth();

  const [repos, setRepos] = useState<Repo[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [starredIds, setStarredIds] = useState<string[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'all' | 'starred' | 'inbox' | 'my-repos' | 'my-reports'>('inbox');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);
  const [repoSettingsTarget, setRepoSettingsTarget] = useState<Repo | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<{ release: Release; repoName: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Polling interval refs for background processes
  const reportPollingRef = useRef<number | null>(null);
  const repoPollingRef = useRef<number | null>(null);

  // Session-based lastSeenAt: snapshot user's lastSeenAt at session start
  // so "new" badges persist while navigating during the session
  const [sessionLastSeenAt, setSessionLastSeenAt] = useState<string | null>(null);
  const hasInitializedLastSeen = useRef(false);

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
      const [feedData, starred, reportsData] = await Promise.all([
        getAllFeedData(),
        getStarredUpdates(),
        getReports(),
      ]);
      setRepos(feedData.repos);
      setUpdates(feedData.updates);
      setReleases(feedData.releases);
      setStarredIds(starred);
      setReports(reportsData);
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

  // Initialize session-based lastSeenAt on first load
  useEffect(() => {
    if (!user || hasInitializedLastSeen.current) return;

    const storageKey = `lastSeenAt-${user.id}`;
    const storedValue = sessionStorage.getItem(storageKey);

    if (storedValue) {
      // Already have a snapshot for this session
      setSessionLastSeenAt(storedValue);
    } else {
      // First load this session: snapshot current lastSeenAt
      const snapshot = user.lastSeenAt ?? new Date(0).toISOString();
      sessionStorage.setItem(storageKey, snapshot);
      setSessionLastSeenAt(snapshot);

      // Update server's lastSeenAt to now (fire and forget)
      markAsSeen().catch((err) => console.error('Failed to mark as seen:', err));
    }

    hasInitializedLastSeen.current = true;
  }, [user]);

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

      // Add repo immediately with its current status (pending/indexing/completed)
      const newRepo: Repo = {
        id: result.id,
        globalRepoId: result.globalRepoId,
        owner: result.owner,
        name: result.name,
        url: result.url,
        description: result.description,
        avatarUrl: result.avatarUrl,
        displayName: result.displayName,
        customColor: result.customColor,
        feedSignificance: result.feedSignificance,
        showReleases: result.showReleases,
        status: result.status,
        progress: result.progress,
        error: result.error,
        lastFetchedAt: result.lastFetchedAt,
        createdAt: result.createdAt,
      };

      setRepos((prev) => [...prev, newRepo]);

      // Only add updates/releases if they exist (for cached repos)
      if (result.updates?.length > 0) {
        setUpdates((prev) => [
          ...prev,
          ...result.updates.map((u: Update) => ({
            ...u,
            repoId: `${result.owner}/${result.name}`,
          })),
        ]);
      }
      if (result.releases?.length > 0) {
        setReleases((prev) => [
          ...prev,
          ...result.releases.map((r: Release) => ({
            ...r,
            repoId: `${result.owner}/${result.name}`,
          })),
        ]);
      }
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
      setUpdates((prev) => prev.filter((u) => u.repoId !== repoId));
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

  const handleRefreshRepo = async (repoId: string) => {
    try {
      const repo = repos.find((r) => r.id === repoId);
      if (!repo) return;

      const result = await refreshRepo(repoId);
      const repoIdStr = `${result.owner}/${result.name}`;

      // Update repo in state
      setRepos((prev) =>
        prev.map((r) =>
          r.id === repoId
            ? {
                ...r,
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
                status: result.status,
                progress: result.progress,
                error: result.error,
                lastFetchedAt: result.lastFetchedAt,
              }
            : r
        )
      );

      // Remove old updates/releases for this repo and add new ones
      const oldRepoKey = `${repo.owner}/${repo.name}`;
      setUpdates((prev) => [
        ...prev.filter((u) => u.repoId !== oldRepoKey),
        ...result.updates.map((u: Update) => ({ ...u, repoId: repoIdStr })),
      ]);
      setReleases((prev) => [
        ...prev.filter((r) => r.repoId !== oldRepoKey),
        ...result.releases.map((r: Release) => ({ ...r, repoId: repoIdStr })),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh repo');
      throw err;
    }
  };

  const handleToggleStar = async (updateId: string) => {
    const isStarred = starredIds.includes(updateId);

    setStarredIds((prev) =>
      isStarred ? prev.filter((id) => id !== updateId) : [...prev, updateId]
    );

    try {
      if (isStarred) {
        await unstarUpdate(updateId);
      } else {
        await starUpdate(updateId);
      }
    } catch (err) {
      setStarredIds((prev) =>
        isStarred ? [...prev, updateId] : prev.filter((id) => id !== updateId)
      );
      console.error('Failed to toggle star:', err);
    }
  };

  const handleFetchRecent = useCallback(async () => {
    if (!selectedRepoId) return;

    try {
      // Call API - returns immediately, runs in background
      await fetchRecentUpdates(selectedRepoId);

      // Update local repo state to trigger polling
      setRepos((prev) =>
        prev.map((r) =>
          r.id === selectedRepoId
            ? { ...r, status: 'pending' as const, progress: 'Starting...' }
            : r
        )
      );
    } catch (err) {
      console.error('Failed to start fetching older updates:', err);
    }
  }, [selectedRepoId]);

  // ============ REPORT HANDLERS ============

  const handleCreateReport = async (data: CreateReportInput) => {
    setIsCreatingReport(true);
    setError(null);

    try {
      const newReport = await createReport(data);
      setReports((prev) => [newReport, ...prev]);
      setShowCreateReportModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
      throw err;
    } finally {
      setIsCreatingReport(false);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      await deleteReportApi(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (selectedReportId === reportId) {
        setSelectedReportId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report');
      throw err;
    }
  };

  const handleDownloadReport = async (reportId: string) => {
    try {
      const { markdown, filename } = await getReportMarkdown(reportId);
      const blob = new Blob([markdown], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download report');
      throw err;
    }
  };

  // Poll for generating reports
  useEffect(() => {
    const generatingReports = reports.filter(
      (r) => r.status === 'pending' || r.status === 'generating'
    );

    if (generatingReports.length === 0) {
      if (reportPollingRef.current) {
        clearInterval(reportPollingRef.current);
        reportPollingRef.current = null;
      }
      return;
    }

    if (!reportPollingRef.current) {
      reportPollingRef.current = window.setInterval(async () => {
        for (const report of generatingReports) {
          try {
            const updated = await getReport(report.id);
            setReports((prev) =>
              prev.map((r) => (r.id === updated.id ? updated : r))
            );
          } catch (err) {
            console.error('Failed to poll report status:', err);
          }
        }
      }, 2000);
    }

    return () => {
      if (reportPollingRef.current) {
        clearInterval(reportPollingRef.current);
        reportPollingRef.current = null;
      }
    };
  }, [reports]);

  // Poll for indexing repos
  useEffect(() => {
    const indexingRepos = repos.filter(
      (r) => r.status === 'pending' || r.status === 'indexing'
    );

    if (indexingRepos.length === 0) {
      if (repoPollingRef.current) {
        clearInterval(repoPollingRef.current);
        repoPollingRef.current = null;
      }
      return;
    }

    if (!repoPollingRef.current) {
      repoPollingRef.current = window.setInterval(async () => {
        for (const repo of indexingRepos) {
          try {
            const updated = await getRepo(repo.id);

            // Update repo in state
            setRepos((prev) =>
              prev.map((r) => (r.id === updated.id ? { ...r, status: updated.status, progress: updated.progress, error: updated.error } : r))
            );

            // If just completed, add the updates and releases
            if (updated.status === 'completed' && (repo.status === 'pending' || repo.status === 'indexing')) {
              const repoIdStr = `${updated.owner}/${updated.name}`;
              if (updated.updates?.length > 0) {
                setUpdates((prev) => [
                  ...prev,
                  ...updated.updates.map((u: Update) => ({ ...u, repoId: repoIdStr })),
                ]);
              }
              if (updated.releases?.length > 0) {
                setReleases((prev) => [
                  ...prev,
                  ...updated.releases.map((r: Release) => ({ ...r, repoId: repoIdStr })),
                ]);
              }
            }
          } catch (err) {
            console.error('Failed to poll repo status:', err);
          }
        }
      }, 2000);
    }

    return () => {
      if (repoPollingRef.current) {
        clearInterval(repoPollingRef.current);
        repoPollingRef.current = null;
      }
    };
  }, [repos]);

  const selectedReport = useMemo(() => {
    if (!selectedReportId) return null;
    return reports.find((r) => r.id === selectedReportId) || null;
  }, [selectedReportId, reports]);


  const filteredFeed = useMemo(() => {
    if (viewMode === 'inbox') {
      return [];  // Inbox has its own filtered list
    }

    let filtered = [...updates];

    const selectedRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;
    const selectedRepoKey = selectedRepo
      ? `${selectedRepo.owner}/${selectedRepo.name}`
      : null;

    // Filter by selected repo (case-insensitive since GitHub names are case-insensitive)
    if (selectedRepoKey) {
      const lowerKey = selectedRepoKey.toLowerCase();
      filtered = filtered.filter((u) => u.repoId.toLowerCase() === lowerKey);
    }

    // Filter by significance and category
    filtered = filtered.filter((update) => {
      return (
        filterSignificance.includes(update.significance) &&
        filterCategories.includes(update.category)
      );
    });

    // Filter starred
    if (viewMode === 'starred') {
      filtered = filtered.filter((update) =>
        starredIds.includes(`${update.repoId}-${update.id}`)
      );
    }

    return filtered.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [
    updates,
    repos,
    selectedRepoId,
    filterSignificance,
    filterCategories,
    viewMode,
    starredIds,
  ]);

  const filteredReleases = useMemo(() => {
    // Inbox has its own filtered list; starred doesn't include releases
    if (viewMode === 'starred' || viewMode === 'inbox') {
      return [];
    }

    // Global releases filter from FilterBar
    if (!showReleases) {
      return [];
    }

    const selectedRepo = selectedRepoId
      ? repos.find((r) => r.id === selectedRepoId)
      : null;
    const selectedRepoKey = selectedRepo
      ? `${selectedRepo.owner}/${selectedRepo.name}`
      : null;

    let rel = [...releases];

    if (selectedRepoKey) {
      // Single repo view - check that repo's showReleases setting
      if (selectedRepo?.showReleases === false) {
        return [];
      }
      const lowerKey = selectedRepoKey.toLowerCase();
      rel = rel.filter((r) => r.repoId.toLowerCase() === lowerKey);
    } else {
      // All repos view - filter by each repo's showReleases setting
      rel = rel.filter((r) => {
        const releaseRepoLower = r.repoId.toLowerCase();
        const repo = repos.find((repo) => `${repo.owner}/${repo.name}`.toLowerCase() === releaseRepoLower);
        return repo?.showReleases !== false;
      });
    }

    return rel.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  }, [releases, repos, selectedRepoId, viewMode, showReleases]);

  // Inbox: filter both updates and releases to only "new" items
  const filteredInbox = useMemo(() => {
    if (viewMode !== 'inbox') {
      return { updates: [] as Update[], releases: [] as Release[] };
    }

    const isNew = (item: { date?: string; publishedAt?: string }) => {
      if (!sessionLastSeenAt) return true;
      const activityDate = item.date ?? item.publishedAt;
      if (!activityDate) return false;
      return new Date(activityDate) > new Date(sessionLastSeenAt);
    };

    // Filter updates: new + significance + category filters
    const inboxUpdates = updates
      .filter((update) => {
        if (!isNew(update)) return false;

        const repo = repos.find((r) =>
          `${r.owner}/${r.name}`.toLowerCase() === update.repoId.toLowerCase()
        );
        const repoSignificance = repo?.feedSignificance ?? filterSignificance;
        const effectiveSignificance = filterSignificance.filter((s) =>
          repoSignificance.includes(s)
        );

        return (
          effectiveSignificance.includes(update.significance) &&
          filterCategories.includes(update.category)
        );
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Filter releases: new + global filter + per-repo showReleases setting
    const inboxReleases = showReleases
      ? releases
          .filter((r) => {
            if (!isNew(r)) return false;
            const repo = repos.find((repo) =>
              `${repo.owner}/${repo.name}`.toLowerCase() === r.repoId.toLowerCase()
            );
            return repo?.showReleases !== false;
          })
          .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      : [];

    return { updates: inboxUpdates, releases: inboxReleases };
  }, [viewMode, updates, releases, repos, sessionLastSeenAt, filterSignificance, filterCategories, showReleases]);

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
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="GitHub Curator" className="w-8 h-8" />
          <h1 className="text-2xl font-bold tracking-tight">GitHub Curator</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="brutal-btn brutal-btn-yellow"
          >
            <Plus size={16} />
            Repo
          </button>

          <button
            onClick={() => setShowCreateReportModal(true)}
            className="brutal-btn brutal-btn-mint"
          >
            <Plus size={16} />
            Report
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
                <div className="absolute right-0 mt-2 w-48 bg-white border-3 border-black rounded-lg shadow-brutal z-50 overflow-hidden animate-slide-down">
                  <button
                    onClick={() => {
                      setViewMode('my-repos');
                      setSelectedRepoId(null);
                      setSelectedReportId(null);
                      setShowUserMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left font-medium text-sm hover:bg-mint/20 flex items-center gap-2 transition-colors border-b border-black/10"
                  >
                    <FolderGit2 size={16} />
                    Manage Repos
                  </button>
                  <button
                    onClick={() => {
                      setViewMode('my-reports');
                      setSelectedRepoId(null);
                      setSelectedReportId(null);
                      setShowUserMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left font-medium text-sm hover:bg-lavender/20 flex items-center gap-2 transition-colors border-b border-black/10"
                  >
                    <FileText size={16} />
                    Manage Reports
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
          reports={reports}
          selectedRepoId={selectedRepoId}
          selectedReportId={selectedReportId}
          viewMode={viewMode}
          onSelectRepo={(repoId) => {
            setSelectedRepoId(repoId);
            setSelectedReportId(null);
            if (repoId) setViewMode('all');
          }}
          onOpenRepoSettings={setRepoSettingsTarget}
          onSelectReport={(reportId) => {
            setSelectedReportId(reportId);
            setSelectedRepoId(null);
          }}
          onSetViewMode={(mode) => {
            setViewMode(mode);
            setSelectedRepoId(null);
            setSelectedReportId(null);
          }}
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
          ) : viewMode === 'my-reports' ? (
            <MyReportsPage
              reports={reports}
              onSelect={(reportId) => {
                setSelectedReportId(reportId);
                setViewMode('all');
              }}
              onDelete={handleDeleteReport}
            />
          ) : (
            <>
              {/* Page Header */}
              <div className="mb-6">
                {selectedRepoId && (
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h1 className="text-3xl font-bold">
                      {repos.find((r) => r.id === selectedRepoId)?.displayName ||
                        repos.find((r) => r.id === selectedRepoId)?.name ||
                        'Repository'}
                    </h1>
                    <FilterBar
                      selectedSignificance={filterSignificance}
                      selectedCategories={filterCategories}
                      onSignificanceChange={setFilterSignificance}
                      onCategoriesChange={setFilterCategories}
                      showReleases={showReleases}
                      onShowReleasesChange={setShowReleases}
                    />
                  </div>
                )}

                {!selectedRepoId && (
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h1 className="text-3xl font-bold">
                      {viewMode === 'inbox' && 'Inbox'}
                      {viewMode === 'all' && 'All Repos'}
                      {viewMode === 'starred' && 'Starred'}
                    </h1>
                    <FilterBar
                      selectedSignificance={filterSignificance}
                      selectedCategories={filterCategories}
                      onSignificanceChange={setFilterSignificance}
                      onCategoriesChange={setFilterCategories}
                      showReleases={showReleases}
                      onShowReleasesChange={setShowReleases}
                    />
                  </div>
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
                  updates={viewMode === 'inbox' ? filteredInbox.updates : filteredFeed}
                  releases={viewMode === 'inbox' ? filteredInbox.releases : filteredReleases}
                  starredIds={starredIds}
                  onToggleStar={handleToggleStar}
                  onReleaseClick={(release, repoName) => setSelectedRelease({ release, repoName })}
                  repos={repos}
                  lastSeenAt={sessionLastSeenAt}
                  selectedRepo={selectedRepoId ? repos.find((r) => r.id === selectedRepoId) : null}
                  onFetchRecent={selectedRepoId ? handleFetchRecent : undefined}
                  isInbox={viewMode === 'inbox'}
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
          onRefresh={handleRefreshRepo}
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

      {showCreateReportModal && (
        <CreateReportModal
          repos={repos}
          onCreate={handleCreateReport}
          onClose={() => setShowCreateReportModal(false)}
          isLoading={isCreatingReport}
        />
      )}

      {selectedReport && (
        <ReportViewer
          report={selectedReport}
          onClose={() => setSelectedReportId(null)}
          onDelete={handleDeleteReport}
          onDownload={handleDownloadReport}
        />
      )}
    </div>
  );
}
