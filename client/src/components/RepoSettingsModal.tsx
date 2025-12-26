import { useState } from 'react';
import type { Repo, Significance } from '../types';
import { ALL_SIGNIFICANCE, SIGNIFICANCE_LABELS } from '../types';
import { getRepoColor } from '../utils/colors';
import './RepoSettingsModal.css';

const COLOR_OPTIONS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...repo,
      displayName: displayName.trim() || undefined,
      customColor,
      feedSignificance,
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal repo-settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Repo Settings</h2>
        <p className="repo-settings-subtitle">{repo.owner}/{repo.name}</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="display-name">Display Name</label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={repo.name}
            />
            <small>Custom name to display in the feed</small>
          </div>

          <div className="form-group">
            <label>Color</label>
            <div className="color-picker">
              {COLOR_OPTIONS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-option ${customColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setCustomColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Show in "All Repos" Feed</label>
            <div className="significance-options">
              {ALL_SIGNIFICANCE.map((sig) => (
                <label key={sig} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={feedSignificance.includes(sig)}
                    onChange={() => toggleSignificance(sig)}
                  />
                  {SIGNIFICANCE_LABELS[sig]}
                </label>
              ))}
            </div>
            <small>Which significance levels to include when viewing all repos</small>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className={`delete-btn ${showDeleteConfirm ? 'confirm' : ''}`}
              onClick={handleDelete}
            >
              {showDeleteConfirm ? 'Click again to confirm' : 'Delete Repo'}
            </button>
            <div className="modal-actions-right">
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
