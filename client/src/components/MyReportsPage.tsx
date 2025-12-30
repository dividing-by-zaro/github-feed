import { useState, useMemo } from 'react';
import type { Report, Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import { ChevronDown, FileText, Loader2, AlertCircle, CheckCircle, Calendar, BarChart3, GitPullRequest, Zap, Download } from 'lucide-react';

type SortOption = 'date-desc' | 'date-asc' | 'alpha-asc' | 'alpha-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'alpha-asc', label: 'A → Z' },
  { value: 'alpha-desc', label: 'Z → A' },
];

interface MyReportsPageProps {
  reports: Report[];
  repos: Repo[];
  onSelect: (reportId: string) => void;
  onDelete: (reportId: string) => void;
}

export default function MyReportsPage({
  reports,
  repos,
  onSelect,
}: MyReportsPageProps) {
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  const sortedReports = useMemo(() => {
    const sorted = [...reports];
    switch (sortBy) {
      case 'date-desc':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });
      case 'date-asc':
        return sorted.sort((a, b) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateA - dateB;
        });
      case 'alpha-asc':
        return sorted.sort((a, b) => {
          const nameA = a.repoName.toLowerCase();
          const nameB = b.repoName.toLowerCase();
          return nameA.localeCompare(nameB);
        });
      case 'alpha-desc':
        return sorted.sort((a, b) => {
          const nameA = a.repoName.toLowerCase();
          const nameB = b.repoName.toLowerCase();
          return nameB.localeCompare(nameA);
        });
      default:
        return sorted;
    }
  }, [reports, sortBy]);

  // Calculate stats
  const stats = useMemo(() => {
    const completed = reports.filter(r => r.status === 'completed').length;
    const failed = reports.filter(r => r.status === 'failed').length;
    const generating = reports.filter(r => r.status === 'pending' || r.status === 'generating').length;

    // Calculate total updates and PRs from completed reports
    const totalUpdates = reports
      .filter(r => r.status === 'completed' && r.content?.metadata)
      .reduce((sum, r) => sum + (r.content?.metadata?.updateCount || 0), 0);

    const totalPRs = reports
      .filter(r => r.status === 'completed' && r.content?.metadata)
      .reduce((sum, r) => sum + (r.content?.metadata?.prCount || 0), 0);

    return { completed, failed, generating, totalUpdates, totalPRs };
  }, [reports]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          Reports
          <span className="px-2.5 py-0.5 text-lg font-semibold bg-mint border-2 border-black rounded-full">
            {reports.length}
          </span>
        </h1>

        {/* Sort Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowSortDropdown(!showSortDropdown)}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-black rounded-lg font-semibold text-sm hover:bg-cream-dark transition-colors"
          >
            {currentSortLabel}
            <ChevronDown size={16} className={`transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showSortDropdown && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSortDropdown(false)}
              />
              <div className="absolute right-0 mt-2 w-40 bg-white border-3 border-black rounded-lg shadow-brutal z-50 overflow-hidden animate-slide-down">
                {SORT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value);
                      setShowSortDropdown(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-cream transition-colors ${
                      sortBy === option.value ? 'bg-lavender/30' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats Section */}
      {reports.length > 0 && (
        <div className="flex flex-wrap gap-4 mb-8">
          <div className="brutal-card p-4 bg-mint/20 flex-1 min-w-[140px]">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <CheckCircle size={16} />
              Completed
            </div>
            <div className="text-4xl font-bold">{stats.completed}</div>
            <div className="text-sm text-gray-400 mt-1">reports</div>
          </div>
          {stats.generating > 0 && (
            <div className="brutal-card p-4 bg-yellow/20 flex-1 min-w-[140px]">
              <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
                <Loader2 size={16} className="animate-spin" />
                In Progress
              </div>
              <div className="text-4xl font-bold">{stats.generating}</div>
              <div className="text-sm text-gray-400 mt-1">generating</div>
            </div>
          )}
          {stats.failed > 0 && (
            <div className="brutal-card p-4 bg-coral/20 flex-1 min-w-[140px]">
              <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
                <AlertCircle size={16} />
                Failed
              </div>
              <div className="text-4xl font-bold">{stats.failed}</div>
              <div className="text-sm text-gray-400 mt-1">reports</div>
            </div>
          )}
          <div className="brutal-card p-4 bg-lavender/20 flex-1 min-w-[140px]">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <BarChart3 size={16} />
              Updates
            </div>
            <div className="text-4xl font-bold">{stats.totalUpdates}</div>
            <div className="text-sm text-gray-400 mt-1">analyzed</div>
          </div>
          <div className="brutal-card p-4 bg-sky/20 flex-1 min-w-[140px]">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <Calendar size={16} />
              PRs
            </div>
            <div className="text-4xl font-bold">{stats.totalPRs}</div>
            <div className="text-sm text-gray-400 mt-1">covered</div>
          </div>
        </div>
      )}

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No reports yet</p>
          <p className="text-gray-300 text-sm mt-1">Generate a report to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedReports.map((report) => {
            const isGenerating = report.status === 'generating' || report.status === 'pending';
            const isFailed = report.status === 'failed';
            const isCompleted = report.status === 'completed';

            // Find the repo for this report to get avatar and color
            const repo = repos.find(r =>
              r.owner.toLowerCase() === report.repoOwner.toLowerCase() &&
              r.name.toLowerCase() === report.repoName.toLowerCase()
            );
            const color = repo?.customColor || getRepoColor(report.globalRepoId);

            // Get stats for completed reports
            const prCount = report.content?.metadata?.prCount || 0;
            const majorSection = report.content?.sections?.find(s => s.significance === 'major');
            const majorCount = majorSection?.themes?.length || 0;

            return (
              <div
                key={report.id}
                className={`group relative bg-white border-3 border-black rounded-xl overflow-hidden transition-all duration-200 ${
                  isGenerating ? 'opacity-70' : 'cursor-pointer hover:shadow-brutal hover:-translate-y-0.5'
                }`}
                onClick={() => !isGenerating && onSelect(report.id)}
              >
                {/* Colored accent bar */}
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: isGenerating ? '#FDEE4D' : isFailed ? '#FF7F7F' : color }}
                />

                <div className="p-4">
                  {/* Row 1: Avatar, Name/Owner, Actions */}
                  <div className="flex items-center gap-3">
                    {/* Avatar with status or repo image */}
                    {isGenerating ? (
                      <div className="w-11 h-11 rounded-lg border-2 border-black bg-yellow/30 flex items-center justify-center flex-shrink-0">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                    ) : isFailed ? (
                      <div className="w-11 h-11 rounded-lg border-2 border-black bg-coral/30 flex items-center justify-center flex-shrink-0">
                        <AlertCircle size={20} />
                      </div>
                    ) : repo?.avatarUrl ? (
                      <img
                        src={repo.avatarUrl}
                        alt=""
                        className="w-11 h-11 rounded-lg border-2 border-black flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-lg border-2 border-black flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        <FileText size={20} className="text-black/60" />
                      </div>
                    )}

                    {/* Name and owner */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-lg truncate leading-tight">
                        {report.repoName}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {report.repoOwner}
                      </p>
                    </div>

                    {/* Action buttons - always visible */}
                    {!isGenerating && isCompleted && (
                      <a
                        href={`/api/reports/${report.id}/markdown`}
                        download={`${report.repoName}-report.md`}
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-black/20 hover:border-black hover:bg-cream transition-colors flex-shrink-0"
                        title="Download report"
                      >
                        <Download size={18} />
                      </a>
                    )}
                  </div>

                  {/* Row 2: Stats or Status */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                    {isGenerating ? (
                      <div className="flex-1">
                        <span className="text-sm text-yellow-600 font-medium">
                          {report.progress || 'Generating...'}
                        </span>
                        <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow rounded-full animate-pulse" style={{ width: '60%' }} />
                        </div>
                      </div>
                    ) : isFailed ? (
                      <span className="text-sm text-red-500 font-medium">
                        Generation failed
                      </span>
                    ) : (
                      <>
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-gray-400" />
                          <span className="text-sm text-gray-500">
                            {formatDateRange(report.startDate, report.endDate)}
                          </span>
                        </div>
                        {isCompleted && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <GitPullRequest size={14} className="text-gray-400" />
                              <span className="text-sm font-semibold" style={{ color }}>
                                {prCount} PRs
                              </span>
                            </div>
                            {majorCount > 0 && (
                              <div className="flex items-center gap-1.5">
                                <Zap size={14} className="text-coral" />
                                <span className="text-sm font-semibold text-coral">
                                  {majorCount} major
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
