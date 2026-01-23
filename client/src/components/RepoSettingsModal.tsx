import { useState } from 'react';
import type { Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import { X, Trash2, RefreshCw, Clock } from 'lucide-react';

// Format relative time (e.g., "2 hours ago", "3 days ago")
function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString();
}

const COLOR_OPTIONS = [
  { color: '#6366f1', name: 'Indigo' },
  { color: '#8b5cf6', name: 'Violet' },
  { color: '#ec4899', name: 'Pink' },
  { color: '#f43f5e', name: 'Rose' },
  { color: '#f97316', name: 'Orange' },
  { color: '#eab308', name: 'Yellow' },
  { color: '#22c55e', name: 'Green' },
  { color: '#14b8a6', name: 'Teal' },
  { color: '#06b6d4', name: 'Cyan' },
  { color: '#3b82f6', name: 'Blue' },
];

interface RepoSettingsModalProps {
  repo: Repo;
  onSave: (repo: Repo) => void;
  onDelete: (repoId: string) => void;
  onRefresh: (repoId: string) => Promise<void>;
  onClose: () => void;
}

export default function RepoSettingsModal({
  repo,
  onSave,
  onDelete,
  onRefresh,
  onClose,
}: RepoSettingsModalProps) {
  const [displayName, setDisplayName] = useState(repo.displayName || '');
  const [customColor, setCustomColor] = useState(
    repo.customColor || getRepoColor(repo.id)
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...repo,
      displayName: displayName.trim() || undefined,
      customColor,
    });
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(repo.id);
      onClose();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh(repo.id);
      onClose();
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white border-3 border-black rounded-2xl shadow-brutal-lg animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black/10 sticky top-0 bg-white z-10">
          <div>
            <h2 className="font-display text-xl font-bold">Repo Settings</h2>
            <p className="text-sm text-gray-500 font-mono">{repo.owner}/{repo.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Display Name */}
          <div className="space-y-2">
            <label htmlFor="display-name" className="block font-display font-semibold text-sm">
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={repo.name}
              className="brutal-input"
            />
            <p className="text-xs text-gray-500">Custom name to display in the feed</p>
          </div>

          {/* Color Picker */}
          <div className="space-y-2">
            <label className="block font-display font-semibold text-sm">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map(({ color }) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCustomColor(color)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    customColor === color
                      ? 'border-black shadow-brutal-sm scale-110'
                      : 'border-black/20 hover:border-black/50'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Last Indexed Info */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <Clock size={16} className="text-gray-500" />
            <span className="text-sm text-gray-600">
              Last indexed: <span className="font-medium text-gray-800">{formatRelativeTime(repo.lastFetchedAt)}</span>
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t-2 border-black/10">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                className={`brutal-btn ${showDeleteConfirm ? 'bg-coral border-coral' : 'brutal-btn-secondary'} text-black`}
              >
                <Trash2 size={16} />
                {showDeleteConfirm ? 'Click to confirm' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="brutal-btn brutal-btn-secondary text-black"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Checking...' : 'Check for updates'}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="brutal-btn brutal-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="brutal-btn brutal-btn-primary"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
