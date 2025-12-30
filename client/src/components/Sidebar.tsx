import { useState, useEffect } from 'react';
import { Settings, FileText, Loader2, AlertCircle, FolderGit2, Inbox, ChevronDown, ChevronRight, Infinity } from 'lucide-react';
import type { Repo, Report } from '../types';

interface SidebarProps {
  repos: Repo[];
  reports: Report[];
  selectedRepoId: string | null;
  selectedReportId: string | null;
  viewMode: 'all' | 'starred' | 'inbox' | 'my-repos' | 'my-reports';
  onSelectRepo: (repoId: string | null) => void;
  onOpenRepoSettings: (repo: Repo) => void;
  onSelectReport: (reportId: string) => void;
  onSetViewMode: (mode: 'all' | 'starred' | 'inbox' | 'my-repos' | 'my-reports') => void;
}

export default function Sidebar({
  repos,
  reports,
  selectedRepoId,
  selectedReportId,
  viewMode,
  onSelectRepo,
  onOpenRepoSettings,
  onSelectReport,
  onSetViewMode,
}: SidebarProps) {
  const [reposExpanded, setReposExpanded] = useState(false);
  const [reportsExpanded, setReportsExpanded] = useState(false);

  // Sync expand state with viewMode
  useEffect(() => {
    if (viewMode === 'my-repos') {
      setReposExpanded(true);
    }
    if (viewMode === 'my-reports') {
      setReportsExpanded(true);
    }
  }, [viewMode]);

  const isInboxActive = viewMode === 'inbox' && !selectedRepoId && !selectedReportId;
  const isReposActive = viewMode === 'my-repos';
  const isReportsActive = viewMode === 'my-reports';

  const handleReposClick = () => {
    if (isReposActive) {
      // Already on repos page, just toggle expand
      setReposExpanded(!reposExpanded);
    } else {
      // Navigate to repos page and expand
      onSetViewMode('my-repos');
      setReposExpanded(true);
    }
  };

  const handleReportsClick = () => {
    if (isReportsActive) {
      // Already on reports page, just toggle expand
      setReportsExpanded(!reportsExpanded);
    } else {
      // Navigate to reports page and expand
      onSetViewMode('my-reports');
      setReportsExpanded(true);
    }
  };

  const toggleReposExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReposExpanded(!reposExpanded);
  };

  const toggleReportsExpanded = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReportsExpanded(!reportsExpanded);
  };

  return (
    <aside className="w-64 bg-white border-r-3 border-black flex flex-col shrink-0 h-screen sticky top-0">
      {/* Navigation */}
      <div className="p-4 shrink-0 flex-1 overflow-y-auto">
        <div className="space-y-1">
          {/* Inbox */}
          <button
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
              isInboxActive
                ? 'bg-pink border-2 border-black shadow-brutal-sm'
                : 'hover:bg-cream border-2 border-transparent'
            }`}
            onClick={() => {
              onSelectRepo(null);
              onSetViewMode('inbox');
            }}
          >
            <Inbox size={18} />
            Inbox
          </button>

          {/* Repos */}
          <div>
            <button
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
                isReposActive
                  ? 'bg-yellow border-2 border-black shadow-brutal-sm'
                  : 'hover:bg-cream border-2 border-transparent'
              }`}
              onClick={handleReposClick}
            >
              <FolderGit2 size={18} />
              <span className="flex-1 text-left">Repos</span>
              {repos.length > 0 && (
                <span className="text-xs text-gray-500 font-normal">{repos.length}</span>
              )}
              <span
                onClick={toggleReposExpanded}
                className="p-0.5 hover:bg-black/10 rounded transition-colors"
              >
                {reposExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>

            {/* Repos List */}
            {reposExpanded && (
              <div className="mt-1 ml-2 border-l-2 border-black/10">
                <ul className="space-y-0.5 py-1">
                  {/* All Repos option */}
                  <li
                    className={`group relative rounded-lg transition-all mx-1 ${
                      viewMode === 'all' && !selectedRepoId
                        ? 'bg-lavender border-2 border-black shadow-brutal-sm'
                        : 'hover:bg-cream border-2 border-transparent'
                    }`}
                  >
                    <button
                      className="w-full flex items-center gap-2 px-2 py-2 text-left"
                      onClick={() => {
                        onSelectRepo(null);
                        onSetViewMode('all');
                      }}
                    >
                      <div className="w-6 h-6 rounded-md border-2 border-black shrink-0 flex items-center justify-center bg-cream">
                        <Infinity size={14} />
                      </div>
                      <span className="font-display font-medium text-sm">All Repos</span>
                    </button>
                  </li>
                  {repos.length === 0 ? (
                    <li className="px-4 py-2 text-sm text-gray-300">
                      No repos yet
                    </li>
                  ) : (
                    <>
                    {repos.map((repo) => {
                      const isIndexing = repo.status === 'pending' || repo.status === 'indexing';
                      const isFailed = repo.status === 'failed';

                      return (
                        <li
                          key={repo.id}
                          className={`group relative rounded-lg transition-all mx-1 ${
                            selectedRepoId === repo.id
                              ? 'bg-lavender border-2 border-black shadow-brutal-sm'
                              : 'hover:bg-cream border-2 border-transparent'
                          }`}
                        >
                          <button
                            className="w-full flex items-center gap-2 px-2 py-2 text-left"
                            onClick={() => onSelectRepo(repo.id)}
                          >
                            {isIndexing ? (
                              <div className="w-6 h-6 rounded-md border-2 border-black shrink-0 flex items-center justify-center bg-yellow/30">
                                <Loader2 size={12} className="animate-spin" />
                              </div>
                            ) : isFailed ? (
                              <div className="w-6 h-6 rounded-md border-2 border-black shrink-0 flex items-center justify-center bg-coral/30">
                                <AlertCircle size={12} />
                              </div>
                            ) : repo.avatarUrl ? (
                              <img
                                src={repo.avatarUrl}
                                alt={`${repo.owner} avatar`}
                                className="w-6 h-6 rounded-md border-2 border-black shrink-0"
                              />
                            ) : (
                              <div
                                className="w-6 h-6 rounded-md border-2 border-black shrink-0"
                                style={{ backgroundColor: repo.customColor || '#E8D5FF' }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="block font-display font-medium text-sm truncate">
                                {repo.displayName || repo.name}
                              </span>
                              {(isIndexing || isFailed) && (
                                <span className="block text-xs truncate">
                                  {isIndexing ? (
                                    <span className="text-yellow-600">{repo.progress || 'Indexing...'}</span>
                                  ) : (
                                    <span className="text-red-600">Failed</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </button>

                          {!isIndexing && (
                            <button
                              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenRepoSettings(repo);
                              }}
                              title="Repo settings"
                            >
                              <Settings size={12} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Reports */}
          <div>
            <button
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
                isReportsActive
                  ? 'bg-mint border-2 border-black shadow-brutal-sm'
                  : 'hover:bg-cream border-2 border-transparent'
              }`}
              onClick={handleReportsClick}
            >
              <FileText size={18} />
              <span className="flex-1 text-left">Reports</span>
              {reports.length > 0 && (
                <span className="text-xs text-gray-500 font-normal">{reports.length}</span>
              )}
              <span
                onClick={toggleReportsExpanded}
                className="p-0.5 hover:bg-black/10 rounded transition-colors"
              >
                {reportsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
            </button>

            {/* Reports List */}
            {reportsExpanded && (
              <div className="mt-1 ml-2 border-l-2 border-black/10">
                {reports.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-gray-300">
                    No reports yet
                  </p>
                ) : (
                  <ul className="space-y-0.5 py-1">
                    {reports.map((report) => {
                      const isGenerating = report.status === 'generating' || report.status === 'pending';
                      const isFailed = report.status === 'failed';
                      const isSelected = selectedReportId === report.id;

                      return (
                        <li
                          key={report.id}
                          className={`rounded-lg transition-all mx-1 ${
                            isSelected
                              ? 'bg-lavender border-2 border-black shadow-brutal-sm'
                              : 'hover:bg-cream border-2 border-transparent'
                          }`}
                        >
                          <button
                            className="w-full flex items-center gap-2 px-2 py-2 text-left"
                            onClick={() => onSelectReport(report.id)}
                            disabled={isGenerating}
                          >
                            <div className={`w-6 h-6 rounded-md border-2 border-black shrink-0 flex items-center justify-center ${
                              isFailed ? 'bg-coral/30' : isGenerating ? 'bg-yellow/30' : 'bg-lavender/50'
                            }`}>
                              {isGenerating ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : isFailed ? (
                                <AlertCircle size={12} />
                              ) : (
                                <FileText size={12} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="block font-display font-medium text-sm truncate">
                                {report.repoName}
                              </span>
                              <span className="block text-xs text-gray-500 truncate">
                                {isGenerating ? (
                                  <span className="text-yellow-600">{report.progress || 'Generating...'}</span>
                                ) : isFailed ? (
                                  <span className="text-red-600">Failed</span>
                                ) : (
                                  `${new Date(report.startDate).toLocaleDateString()} - ${new Date(report.endDate).toLocaleDateString()}`
                                )}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
