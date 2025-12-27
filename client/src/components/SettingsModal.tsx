import { useState } from 'react';
import { updateUserSettings } from '../api';

interface SettingsModalProps {
  hasOpenaiKey: boolean;
  hasGithubToken: boolean;
  onSave: () => void;
  onClose: () => void;
}

export default function SettingsModal({
  hasOpenaiKey,
  hasGithubToken,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const updates: { openaiApiKey?: string; githubToken?: string } = {};

      // Only send if user entered a new value
      if (apiKey.trim()) {
        updates.openaiApiKey = apiKey.trim();
      }
      if (githubToken.trim()) {
        updates.githubToken = githubToken.trim();
      }

      if (Object.keys(updates).length > 0) {
        await updateUserSettings(updates);
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearOpenaiKey = async () => {
    setIsSaving(true);
    try {
      await updateUserSettings({ openaiApiKey: '' });
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearGithubToken = async () => {
    setIsSaving(true);
    try {
      await updateUserSettings({ githubToken: '' });
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear token');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        {error && (
          <div className="error-banner" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="api-key">
              OpenAI API Key
              {hasOpenaiKey && <span className="key-status"> (set)</span>}
            </label>
            <div className="key-input-group">
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasOpenaiKey ? '••••••••' : 'sk-...'}
              />
              {hasOpenaiKey && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={handleClearOpenaiKey}
                  disabled={isSaving}
                >
                  Clear
                </button>
              )}
            </div>
            <small>
              Get one at{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                platform.openai.com
              </a>
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="github-token">
              GitHub Token
              {hasGithubToken && <span className="key-status"> (set)</span>}
            </label>
            <div className="key-input-group">
              <input
                id="github-token"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder={hasGithubToken ? '••••••••' : 'ghp_...'}
              />
              {hasGithubToken && (
                <button
                  type="button"
                  className="clear-btn"
                  onClick={handleClearGithubToken}
                  disabled={isSaving}
                >
                  Clear
                </button>
              )}
            </div>
            <small>
              Increases API rate limit from 60 to 5,000 requests/hour.
              Get one at{' '}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/settings/tokens
              </a>
              {' '}(select "public_repo" scope)
            </small>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isSaving}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
