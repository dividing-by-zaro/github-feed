import { useState, useMemo } from 'react';
import type { Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import { Trash2, ChevronDown } from 'lucide-react';

type SortOption = 'date-desc' | 'date-asc' | 'alpha-asc' | 'alpha-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'alpha-asc', label: 'A → Z' },
  { value: 'alpha-desc', label: 'Z → A' },
];

interface MyReposPageProps {
  repos: Repo[];
  onOpenSettings: (repo: Repo) => void;
  onDelete: (repoId: string) => void;
}

export default function MyReposPage({
  repos,
  onOpenSettings,
  onDelete,
}: MyReposPageProps) {
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const sortedRepos = useMemo(() => {
    const sorted = [...repos];
    switch (sortBy) {
      case 'date-desc':
        return sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
      case 'date-asc':
        return sorted.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateA - dateB;
        });
      case 'alpha-asc':
        return sorted.sort((a, b) => {
          const nameA = (a.displayName || `${a.owner}/${a.name}`).toLowerCase();
          const nameB = (b.displayName || `${b.owner}/${b.name}`).toLowerCase();
          return nameA.localeCompare(nameB);
        });
      case 'alpha-desc':
        return sorted.sort((a, b) => {
          const nameA = (a.displayName || `${a.owner}/${a.name}`).toLowerCase();
          const nameB = (b.displayName || `${b.owner}/${b.name}`).toLowerCase();
          return nameB.localeCompare(nameA);
        });
      default:
        return sorted;
    }
  }, [repos, sortBy]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, repoId: string) => {
    e.stopPropagation();
    setDeleteConfirmId(repoId);
  };

  const handleConfirmDelete = (e: React.MouseEvent, repoId: string) => {
    e.stopPropagation();
    onDelete(repoId);
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
          Manage Repos
          <span className="px-2.5 py-0.5 text-lg font-semibold bg-mint border-2 border-black rounded-full">
            {repos.length}
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
                      sortBy === option.value ? 'bg-mint/30' : ''
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

      {/* Repos List */}
      {repos.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No repos yet</p>
          <p className="text-gray-300 text-sm mt-1">Add a repo to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRepos.map((repo) => {
            const displayName = repo.displayName || repo.name;
            const fullName = `${repo.owner}/${repo.name}`;
            const showSubtitle = repo.displayName && repo.displayName !== repo.name;
            const color = repo.customColor || getRepoColor(repo.id);

            return (
              <div
                key={repo.id}
                className="brutal-card p-4 flex items-center gap-4 cursor-pointer hover:bg-cream/50 transition-colors"
                onClick={() => onOpenSettings(repo)}
              >
                {/* Repo avatar */}
                {repo.avatarUrl ? (
                  <img
                    src={repo.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-lg border-2 border-black flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-lg border-2 border-black flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}

                {/* Repo info */}
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-base truncate">
                    {displayName}
                  </div>
                  {showSubtitle && (
                    <div className="text-sm text-gray-500 font-mono truncate">
                      {fullName}
                    </div>
                  )}
                  <div className="text-xs text-gray-300 mt-1">
                    Added {formatDate(repo.createdAt)}
                  </div>
                </div>

                {/* Delete button or confirmation */}
                {deleteConfirmId === repo.id ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-sm font-medium">Really delete?</span>
                    <button
                      onClick={(e) => handleConfirmDelete(e, repo.id)}
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
                    onClick={(e) => handleDeleteClick(e, repo.id)}
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
