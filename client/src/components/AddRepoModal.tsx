import { useState } from 'react';

interface AddRepoModalProps {
  onAdd: (repoUrl: string) => void;
  onClose: () => void;
  isLoading: boolean;
}

export default function AddRepoModal({
  onAdd,
  onClose,
  isLoading,
}: AddRepoModalProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAdd(url.trim());
    }
  };

  const isValidUrl = url.match(/github\.com\/[^\/]+\/[^\/]+/);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Repository</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="repo-url">GitHub Repository URL</label>
            <input
              id="repo-url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={isLoading}
              autoFocus
            />
            <small>
              Enter the full GitHub URL of the repository you want to track
            </small>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!isValidUrl || isLoading}
            >
              {isLoading ? 'Analyzing...' : 'Add Repo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
