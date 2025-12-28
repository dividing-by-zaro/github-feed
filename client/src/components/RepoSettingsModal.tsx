import { useState } from 'react';
import type { Repo, Significance } from '../types';
import { ALL_SIGNIFICANCE, SIGNIFICANCE_LABELS } from '../types';
import { getRepoColor } from '../utils/colors';
import { X, Trash2, Check } from 'lucide-react';

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

const SIGNIFICANCE_COLORS: Record<string, string> = {
  major: 'bg-coral',
  minor: 'bg-mint',
  patch: 'bg-yellow',
  internal: 'bg-gray-100',
};

interface RepoSettingsModalProps {
  repo: Repo;
  onSave: (repo: Repo) => void;
  onDelete: (repoId: string) => void;
  onClose: () => void;
}

export default function RepoSettingsModal({
  repo,
  onSave,
  onDelete,
  onClose,
}: RepoSettingsModalProps) {
  const [displayName, setDisplayName] = useState(repo.displayName || '');
  const [customColor, setCustomColor] = useState(
    repo.customColor || getRepoColor(repo.id)
  );
  const [feedSignificance, setFeedSignificance] = useState<Significance[]>(
    repo.feedSignificance || ALL_SIGNIFICANCE
  );
  const [showReleases, setShowReleases] = useState(repo.showReleases ?? true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...repo,
      displayName: displayName.trim() || undefined,
      customColor,
      feedSignificance,
      showReleases,
    });
  };

  const toggleSignificance = (sig: Significance) => {
    setFeedSignificance((prev) =>
      prev.includes(sig) ? prev.filter((s) => s !== sig) : [...prev, sig]
    );
  };

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(repo.id);
      onClose();
    } else {
      setShowDeleteConfirm(true);
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

          {/* Feed Visibility */}
          <div className="space-y-3">
            <div>
              <label className="block font-display font-semibold text-sm">Feed Visibility</label>
              <p className="text-xs text-gray-500">What to show for this repo in feeds</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {/* Releases toggle */}
              <label
                className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-black/10 hover:border-black/30 cursor-pointer transition-colors"
                onClick={() => setShowReleases(!showReleases)}
              >
                <div className={`w-5 h-5 rounded border-2 border-black flex items-center justify-center ${showReleases ? 'bg-black text-white' : 'bg-white'}`}>
                  {showReleases && <Check size={12} strokeWidth={3} />}
                </div>
                <span className="px-2 py-0.5 bg-lavender text-xs font-display font-semibold rounded-full border-2 border-black">
                  Releases
                </span>
              </label>

              {/* Significance toggles */}
              {ALL_SIGNIFICANCE.map((sig) => (
                <label
                  key={sig}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-black/10 hover:border-black/30 cursor-pointer transition-colors"
                  onClick={() => toggleSignificance(sig)}
                >
                  <div className={`w-5 h-5 rounded border-2 border-black flex items-center justify-center ${feedSignificance.includes(sig) ? 'bg-black text-white' : 'bg-white'}`}>
                    {feedSignificance.includes(sig) && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span className={`px-2 py-0.5 text-xs font-display font-semibold rounded-full border-2 border-black ${SIGNIFICANCE_COLORS[sig]}`}>
                    {SIGNIFICANCE_LABELS[sig]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t-2 border-black/10">
            <button
              type="button"
              onClick={handleDelete}
              className={`brutal-btn ${showDeleteConfirm ? 'bg-coral border-coral' : 'brutal-btn-secondary'} text-black`}
            >
              <Trash2 size={16} />
              {showDeleteConfirm ? 'Click to confirm' : 'Delete'}
            </button>

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
