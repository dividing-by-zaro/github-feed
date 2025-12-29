import { useState, useMemo } from 'react';
import type { Report } from '../types';
import { Trash2, ChevronDown, FileText, Loader2, AlertCircle } from 'lucide-react';

type SortOption = 'date-desc' | 'date-asc' | 'alpha-asc' | 'alpha-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'alpha-asc', label: 'A → Z' },
  { value: 'alpha-desc', label: 'Z → A' },
];

interface MyReportsPageProps {
  reports: Report[];
  onSelect: (reportId: string) => void;
  onDelete: (reportId: string) => void;
}

export default function MyReportsPage({
  reports,
  onSelect,
  onDelete,
}: MyReportsPageProps) {
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  };

  const handleDeleteClick = (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    setDeleteConfirmId(reportId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    onDelete(reportId);
    setDeleteConfirmId(null);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmId(null);
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          Manage Reports
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

      {/* Reports List */}
      {reports.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No reports yet</p>
          <p className="text-gray-300 text-sm mt-1">Generate a report to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReports.map((report) => {
            const isGenerating = report.status === 'generating' || report.status === 'pending';
            const isFailed = report.status === 'failed';

            return (
              <div
                key={report.id}
                className={`brutal-card p-4 flex items-center gap-4 transition-colors ${
                  isGenerating ? 'opacity-60' : 'cursor-pointer hover:bg-cream/50'
                }`}
                onClick={() => !isGenerating && onSelect(report.id)}
              >
                {/* Report icon */}
                <div className={`w-10 h-10 rounded-lg border-2 border-black flex-shrink-0 flex items-center justify-center ${
                  isFailed ? 'bg-coral/30' : isGenerating ? 'bg-yellow/30' : 'bg-lavender/50'
                }`}>
                  {isGenerating ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : isFailed ? (
                    <AlertCircle size={18} />
                  ) : (
                    <FileText size={18} />
                  )}
                </div>

                {/* Report info */}
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-base truncate">
                    {report.repoName}
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {isGenerating ? (
                      <span className="text-yellow-600">{report.progress || 'Generating...'}</span>
                    ) : isFailed ? (
                      <span className="text-red-600">Failed to generate</span>
                    ) : (
                      formatDateRange(report.startDate, report.endDate)
                    )}
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    Created {formatDate(report.createdAt)}
                  </div>
                </div>

                {/* Delete button or confirmation */}
                {deleteConfirmId === report.id ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-medium">Really delete?</span>
                    <button
                      onClick={(e) => handleConfirmDelete(e, report.id)}
                      className="px-3 py-1.5 text-sm font-semibold bg-coral border-2 border-black rounded-lg hover:bg-coral-dark transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={handleCancelDelete}
                      className="px-3 py-1.5 text-sm font-semibold bg-white border-2 border-black rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => handleDeleteClick(e, report.id)}
                    className="w-9 h-9 flex items-center justify-center rounded-lg border-2 border-black/20 hover:border-coral hover:bg-coral/20 transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
