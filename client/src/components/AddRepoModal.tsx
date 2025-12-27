import { useState, useEffect, useRef } from 'react';
import { searchIndexedRepos, type IndexedRepo } from '../api';

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
  const [suggestions, setSuggestions] = useState<IndexedRepo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number>();

  // Extract search term from URL or plain text
  const getSearchTerm = (input: string): string => {
    const trimmed = input.trim();
    // If it looks like a GitHub URL, extract owner/repo part
    const urlMatch = trimmed.match(/github\.com\/([^\/]+(?:\/[^\/]*)?)/i);
    if (urlMatch) {
      return urlMatch[1].replace(/[?#].*$/, '');
    }
    return trimmed;
  };

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const searchTerm = getSearchTerm(url);

    if (searchTerm.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSearching(false);
      return;
    }

    // Show loading state immediately
    setShowSuggestions(true);
    setIsSearching(true);

    debounceRef.current = window.setTimeout(async () => {
      try {
        const results = await searchIndexedRepos(searchTerm);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setSelectedIndex(-1);
      } catch (err) {
        console.error('Search failed:', err);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [url]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAdd(url.trim());
    }
  };

  const handleSelectSuggestion = (suggestion: IndexedRepo) => {
    if (suggestion.isFollowed) return; // Can't select already-followed repos
    setUrl(suggestion.url);
    setShowSuggestions(false);
    setSuggestions([]);
    // Auto-submit since it's a known indexed repo
    onAdd(suggestion.url);
  };

  // Get selectable suggestions (not already followed)
  const selectableSuggestions = suggestions.filter(s => !s.isFollowed);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || selectableSuggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < selectableSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < selectableSuggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(selectableSuggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        break;
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
            <div className="autocomplete-container">
              <input
                ref={inputRef}
                id="repo-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="https://github.com/owner/repo"
                disabled={isLoading}
                autoFocus
                autoComplete="off"
              />
              {showSuggestions && (
                <ul className="autocomplete-dropdown">
                  {isSearching ? (
                    <li className="autocomplete-loading">
                      <span className="autocomplete-spinner" />
                      Searching indexed repos...
                    </li>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((suggestion) => {
                      const selectableIndex = selectableSuggestions.findIndex(s => s.id === suggestion.id);
                      const isSelected = !suggestion.isFollowed && selectableIndex === selectedIndex;

                      return (
                        <li
                          key={suggestion.id}
                          className={`autocomplete-item ${isSelected ? 'selected' : ''} ${suggestion.isFollowed ? 'followed' : ''}`}
                          onClick={() => handleSelectSuggestion(suggestion)}
                          onMouseEnter={() => !suggestion.isFollowed && setSelectedIndex(selectableIndex)}
                        >
                          {suggestion.avatarUrl && (
                            <img
                              src={suggestion.avatarUrl}
                              alt=""
                              className="autocomplete-avatar"
                            />
                          )}
                          <div className="autocomplete-info">
                            <span className="autocomplete-name">
                              {suggestion.owner}/{suggestion.name}
                            </span>
                            {suggestion.description && (
                              <span className="autocomplete-description">
                                {suggestion.description.length > 60
                                  ? suggestion.description.slice(0, 60) + '...'
                                  : suggestion.description}
                              </span>
                            )}
                          </div>
                          <span className={`autocomplete-badge ${suggestion.isFollowed ? 'followed' : ''}`}>
                            {suggestion.isFollowed ? 'Followed' : 'Instant'}
                          </span>
                        </li>
                      );
                    })
                  ) : (
                    <li className="autocomplete-empty">No indexed repos found</li>
                  )}
                </ul>
              )}
            </div>
            <small>
              Enter a GitHub URL or search for an already-indexed repository
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
