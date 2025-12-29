import { Settings, FileText, Plus, Loader2, AlertCircle, LayoutList } from 'lucide-react';
import type { Repo, Report } from '../types';

interface SidebarProps {
  repos: Repo[];
  reports: Report[];
  selectedRepoId: string | null;
  selectedReportId: string | null;
  onSelectRepo: (repoId: string | null) => void;
  onOpenRepoSettings: (repo: Repo) => void;
  onSelectReport: (reportId: string) => void;
  onCreateReport: () => void;
}

export default function Sidebar({
  repos,
  reports,
  selectedRepoId,
  selectedReportId,
  onSelectRepo,
  onOpenRepoSettings,
  onSelectReport,
  onCreateReport,
}: SidebarProps) {
  const isFeedActive = !selectedRepoId && !selectedReportId;

  return (
    <aside className="w-64 bg-white border-r-3 border-black flex flex-col shrink-0 h-screen sticky top-0">
      {/* Feed Button */}
      <div className="p-4 shrink-0">
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
            isFeedActive
              ? 'bg-yellow border-2 border-black shadow-brutal-sm'
              : 'hover:bg-cream border-2 border-transparent'
          }`}
          onClick={() => onSelectRepo(null)}
        >
          <LayoutList size={18} />
          Feed
        </button>
      </div>

      {/* Repos Section - takes 60% of remaining space */}
      <div className="flex-[3] border-t-2 border-black/10 overflow-hidden flex flex-col min-h-0">
        <h3 className="px-4 py-3 font-display font-semibold text-xs uppercase tracking-wider text-gray-500 shrink-0">
          Repos
        </h3>

        {repos.length === 0 ? (
          <p className="px-4 py-2 text-sm text-gray-300">
            No repos yet. Add one to get started.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
            {repos.map((repo) => {
              const isIndexing = repo.status === 'pending' || repo.status === 'indexing';
              const isFailed = repo.status === 'failed';

              return (
                <li
                  key={repo.id}
                  className={`group relative rounded-lg transition-all ${
                    selectedRepoId === repo.id
                      ? 'bg-lavender border-2 border-black shadow-brutal-sm'
                      : 'hover:bg-cream border-2 border-transparent'
                  }`}
                >
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    onClick={() => onSelectRepo(repo.id)}
                  >
                    {isIndexing ? (
                      <div className="w-8 h-8 rounded-md border-2 border-black shrink-0 flex items-center justify-center bg-yellow/30">
                        <Loader2 size={14} className="animate-spin" />
                      </div>
                    ) : isFailed ? (
                      <div className="w-8 h-8 rounded-md border-2 border-black shrink-0 flex items-center justify-center bg-coral/30">
                        <AlertCircle size={14} />
                      </div>
                    ) : repo.avatarUrl ? (
                      <img
                        src={repo.avatarUrl}
                        alt={`${repo.owner} avatar`}
                        className="w-8 h-8 rounded-md border-2 border-black shrink-0"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-md border-2 border-black shrink-0"
                        style={{ backgroundColor: repo.customColor || '#E8D5FF' }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="block font-display font-semibold text-sm truncate">
                        {repo.displayName || repo.name}
                      </span>
                      <span className="block text-xs text-gray-500 truncate">
                        {isIndexing ? (
                          <span className="text-yellow-600">{repo.progress || 'Indexing...'}</span>
                        ) : isFailed ? (
                          <span className="text-red-600">Failed</span>
                        ) : (
                          repo.owner
                        )}
                      </span>
                    </div>
                  </button>

                  {!isIndexing && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenRepoSettings(repo);
                      }}
                      title="Repo settings"
                    >
                      <Settings size={14} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Reports Section - takes 40% of remaining space */}
      <div className="flex-[2] border-t-2 border-black/10 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <h3 className="font-display font-semibold text-xs uppercase tracking-wider text-gray-500">
            Reports
          </h3>
          <button
            onClick={onCreateReport}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-lavender transition-colors"
            title="Create report"
          >
            <Plus size={14} />
          </button>
        </div>

        {reports.length === 0 ? (
          <p className="px-4 py-2 text-sm text-gray-300">
            No reports yet.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {reports.map((report) => {
              const isGenerating = report.status === 'generating' || report.status === 'pending';
              const isFailed = report.status === 'failed';
              const isSelected = selectedReportId === report.id;

              return (
                <li
                  key={report.id}
                  className={`rounded-lg transition-all ${
                    isSelected
                      ? 'bg-lavender border-2 border-black shadow-brutal-sm'
                      : 'hover:bg-cream border-2 border-transparent'
                  }`}
                >
                  <button
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                    onClick={() => onSelectReport(report.id)}
                    disabled={isGenerating}
                  >
                    <div className={`w-8 h-8 rounded-md border-2 border-black shrink-0 flex items-center justify-center ${
                      isFailed ? 'bg-coral/30' : isGenerating ? 'bg-yellow/30' : 'bg-lavender/50'
                    }`}>
                      {isGenerating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : isFailed ? (
                        <AlertCircle size={14} />
                      ) : (
                        <FileText size={14} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block font-display font-semibold text-sm truncate">
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
    </aside>
  );
}
