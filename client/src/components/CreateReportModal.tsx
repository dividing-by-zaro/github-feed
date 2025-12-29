import { useState } from 'react';
import { X, FileText, Info } from 'lucide-react';
import type { Repo, CreateReportInput } from '../types';

interface CreateReportModalProps {
  repos: Repo[];
  onCreate: (data: CreateReportInput) => Promise<void>;
  onClose: () => void;
  isLoading: boolean;
}

export default function CreateReportModal({
  repos,
  onCreate,
  onClose,
  isLoading,
}: CreateReportModalProps) {
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Get today and 3 months ago for date limits
  const today = new Date().toISOString().split('T')[0];
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const minDate = threeMonthsAgo.toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedRepoId) {
      setError('Please select a repository');
      return;
    }

    if (!startDate || !endDate) {
      setError('Please select both start and end dates');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      setError('Start date must be before end date');
      return;
    }

    // Check 3 month limit
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 92) {
      setError('Date range cannot exceed 3 months');
      return;
    }

    const repo = repos.find((r) => r.id === selectedRepoId);
    if (!repo) {
      setError('Please select a valid repository');
      return;
    }

    try {
      await onCreate({
        globalRepoId: repo.globalRepoId,
        startDate,
        endDate,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create report');
    }
  };

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);
  const isValid = selectedRepoId && startDate && endDate;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white border-3 border-black rounded-2xl shadow-brutal-lg animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-lavender border-2 border-black rounded-xl flex items-center justify-center">
              <FileText size={20} />
            </div>
            <h2 className="font-display text-xl font-bold">Create Report</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Repo Selection */}
          <div className="space-y-2">
            <label htmlFor="repo-select" className="block font-display font-semibold text-sm">
              Repository
            </label>
            <select
              id="repo-select"
              value={selectedRepoId}
              onChange={(e) => setSelectedRepoId(e.target.value)}
              disabled={isLoading}
              className="brutal-input"
            >
              <option value="">Select a repository...</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.owner}/{repo.displayName || repo.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="start-date" className="block font-display font-semibold text-sm">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={minDate}
                max={endDate || today}
                disabled={isLoading}
                className="brutal-input"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="end-date" className="block font-display font-semibold text-sm">
                End Date
              </label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || minDate}
                max={today}
                disabled={isLoading}
                className="brutal-input"
              />
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 p-4 bg-cream rounded-xl border-2 border-black/10">
            <Info size={18} className="text-gray-500 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600">
              <p className="font-semibold mb-1">What&apos;s included:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Major features and enhancements</li>
                <li>Bug fixes and patches</li>
                <li>Grouped by significance level</li>
              </ul>
              <p className="mt-2 text-xs text-gray-500">
                Docs and internal updates are automatically excluded.
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-coral/20 border-2 border-coral rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Selected repo preview */}
          {selectedRepo && (
            <div className="flex items-center gap-3 p-3 bg-lavender/30 rounded-xl border-2 border-lavender">
              {selectedRepo.avatarUrl && (
                <img
                  src={selectedRepo.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-lg border-2 border-black"
                />
              )}
              <div>
                <span className="font-display font-semibold text-sm">
                  {selectedRepo.owner}/{selectedRepo.displayName || selectedRepo.name}
                </span>
                {selectedRepo.description && (
                  <p className="text-xs text-gray-500 truncate max-w-xs">
                    {selectedRepo.description}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="brutal-btn brutal-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isLoading}
              className="brutal-btn brutal-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Report'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
