import { useState, useEffect, useRef } from 'react';
import { searchIndexedRepos, type IndexedRepo } from '../api';
import { X, Search, Zap, Check } from 'lucide-react';

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

  const getSearchTerm = (input: string): string => {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(/github\.com\/([^\/]+(?:\/[^\/]*)?)/i);
    if (urlMatch) {
      return urlMatch[1].replace(/[?#].*$/, '');
    }
    return trimmed;
  };

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
    if (suggestion.isFollowed) return;
    setUrl(suggestion.url);
    setShowSuggestions(false);
    setSuggestions([]);
    onAdd(suggestion.url);
  };

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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white border-3 border-black rounded-2xl shadow-brutal-lg animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black/10">
          <h2 className="font-display text-xl font-bold">Add Repository</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-2">
            <label htmlFor="repo-url" className="block font-display font-semibold text-sm">
              GitHub Repository URL
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300">
                <Search size={18} />
              </div>
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
                className="brutal-input pl-10"
              />

              {/* Autocomplete Dropdown */}
              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border-3 border-black rounded-xl shadow-brutal overflow-hidden z-10 max-h-72 overflow-y-auto">
                  {isSearching ? (
                    <div className="flex items-center gap-3 px-4 py-3 text-gray-500">
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-mint rounded-full animate-spin" />
                      <span className="text-sm">Searching indexed repos...</span>
                    </div>
                  ) : suggestions.length > 0 ? (
                    suggestions.map((suggestion) => {
                      const selectableIndex = selectableSuggestions.findIndex(s => s.id === suggestion.id);
                      const isSelected = !suggestion.isFollowed && selectableIndex === selectedIndex;

                      return (
                        <div
                          key={suggestion.id}
                          onClick={() => handleSelectSuggestion(suggestion)}
                          onMouseEnter={() => !suggestion.isFollowed && setSelectedIndex(selectableIndex)}
                          className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-black/5 last:border-b-0 ${
                            isSelected ? 'bg-yellow/30' : suggestion.isFollowed ? 'opacity-50 cursor-default' : 'hover:bg-cream'
                          }`}
                        >
                          {suggestion.avatarUrl && (
                            <img
                              src={suggestion.avatarUrl}
                              alt=""
                              className="w-8 h-8 rounded-lg border-2 border-black"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="block font-display font-semibold text-sm">
                              {suggestion.owner}/{suggestion.name}
                            </span>
                            {suggestion.description && (
                              <span className="block text-xs text-gray-500 truncate">
                                {suggestion.description.length > 60
                                  ? suggestion.description.slice(0, 60) + '...'
                                  : suggestion.description}
                              </span>
                            )}
                          </div>
                          <span className={`shrink-0 px-2 py-1 text-xs font-display font-semibold rounded-full border-2 border-black ${
                            suggestion.isFollowed ? 'bg-gray-100 text-gray-500' : 'bg-mint text-black'
                          }`}>
                            {suggestion.isFollowed ? (
                              <span className="flex items-center gap-1">
                                <Check size={12} />
                                Followed
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <Zap size={12} />
                                Instant
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="px-4 py-3 text-sm text-gray-500">
                      No indexed repos found
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Enter a GitHub URL or search for an already-indexed repository
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
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
              disabled={!isValidUrl || isLoading}
              className="brutal-btn brutal-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Add Repo'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
