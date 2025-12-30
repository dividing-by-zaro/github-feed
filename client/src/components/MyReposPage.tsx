import { useState, useMemo } from 'react';
import type { Repo, Update } from '../types';
import { getRepoColor } from '../utils/colors';
import { ChevronDown, Settings, GitPullRequest, TrendingUp, Zap, Clock, Calendar } from 'lucide-react';
import { Github } from 'lucide-react';

type SortOption = 'date-desc' | 'date-asc' | 'alpha-asc' | 'alpha-desc';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'date-desc', label: 'Newest First' },
  { value: 'date-asc', label: 'Oldest First' },
  { value: 'alpha-asc', label: 'A → Z' },
  { value: 'alpha-desc', label: 'Z → A' },
];

interface MyReposPageProps {
  repos: Repo[];
  updates: Update[];
  onOpenSettings: (repo: Repo) => void;
  onDelete: (repoId: string) => void;
  onSelectRepo: (repoId: string) => void;
}

export default function MyReposPage({
  repos,
  updates,
  onOpenSettings,
  onSelectRepo,
}: MyReposPageProps) {
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

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

  // Calculate stats
  const stats = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const updates24h = updates.filter(u => now - new Date(u.date).getTime() < day).length;
    const updates7d = updates.filter(u => now - new Date(u.date).getTime() < 7 * day).length;
    const updates30d = updates.filter(u => now - new Date(u.date).getTime() < 30 * day).length;
    const totalPRs = updates.reduce((sum, u) => sum + (u.prCount || 0), 0);
    const majorUpdates = updates.filter(u => u.significance === 'major').length;

    return { updates24h, updates7d, updates30d, totalPRs, majorUpdates };
  }, [updates]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSettingsClick = (e: React.MouseEvent, repo: Repo) => {
    e.stopPropagation();
    onOpenSettings(repo);
  };

  const currentSortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label;

  // Helper to get PR count for a repo
  const getRepoPRCount = (repo: Repo) => {
    const repoKey = `${repo.owner}/${repo.name}`.toLowerCase();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const repoUpdates = updates.filter(u =>
      u.repoId.toLowerCase() === repoKey &&
      new Date(u.date).getTime() > weekAgo
    );
    return repoUpdates.reduce((sum, u) => sum + (u.prCount || 0), 0);
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          Repos
          <span className="px-2.5 py-0.5 text-lg font-semibold bg-yellow border-2 border-black rounded-full">
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

      {/* Stats Section */}
      {repos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <div className="brutal-card p-4 bg-yellow/20">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <Clock size={16} />
              Last 24h
            </div>
            <div className="text-4xl font-bold">{stats.updates24h}</div>
            <div className="text-sm text-gray-400 mt-1">updates</div>
          </div>
          <div className="brutal-card p-4 bg-mint/20">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <TrendingUp size={16} />
              Last 7d
            </div>
            <div className="text-4xl font-bold">{stats.updates7d}</div>
            <div className="text-sm text-gray-400 mt-1">updates</div>
          </div>
          <div className="brutal-card p-4 bg-lavender/20">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <TrendingUp size={16} />
              Last 30d
            </div>
            <div className="text-4xl font-bold">{stats.updates30d}</div>
            <div className="text-sm text-gray-400 mt-1">updates</div>
          </div>
          <div className="brutal-card p-4 bg-sky/20">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <GitPullRequest size={16} />
              Total PRs
            </div>
            <div className="text-4xl font-bold">{stats.totalPRs}</div>
            <div className="text-sm text-gray-400 mt-1">merged</div>
          </div>
          <div className="brutal-card p-4 bg-coral/20">
            <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-2">
              <Zap size={16} />
              Updates
            </div>
            <div className="text-4xl font-bold">{stats.majorUpdates}</div>
            <div className="text-sm text-gray-400 mt-1">major changes</div>
          </div>
        </div>
      )}

      {/* Repos List */}
      {repos.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500 font-medium">No repos yet</p>
          <p className="text-gray-300 text-sm mt-1">Add a repo to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedRepos.map((repo) => {
            const displayName = repo.displayName || repo.name;
            const color = repo.customColor || getRepoColor(repo.id);
            const prCount = getRepoPRCount(repo);

            return (
              <div
                key={repo.id}
                className="group relative bg-white border-3 border-black rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-brutal hover:-translate-y-0.5"
                onClick={() => onSelectRepo(repo.id)}
              >
                {/* Colored accent bar */}
                <div
                  className="h-1.5 w-full"
                  style={{ backgroundColor: color }}
                />

                <div className="p-4">
                  {/* Row 1: Avatar, Name/Owner, Actions */}
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    {repo.avatarUrl ? (
                      <img
                        src={repo.avatarUrl}
                        alt=""
                        className="w-11 h-11 rounded-lg border-2 border-black flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-lg border-2 border-black flex-shrink-0 flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: color }}
                      >
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Name and owner */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-lg truncate leading-tight">
                        {displayName}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {repo.owner}
                      </p>
                    </div>

                    {/* Action buttons - always visible */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <a
                        href={`https://github.com/${repo.owner}/${repo.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-black/20 hover:border-black hover:bg-cream transition-colors"
                        title="View on GitHub"
                      >
                        <Github size={18} />
                      </a>
                      <button
                        onClick={(e) => handleSettingsClick(e, repo)}
                        className="w-10 h-10 flex items-center justify-center rounded-lg border-2 border-black/20 hover:border-black hover:bg-cream transition-colors"
                        title="Settings"
                      >
                        <Settings size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Stats */}
                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <GitPullRequest size={14} className="text-gray-400" />
                      {prCount > 0 ? (
                        <span className="text-sm font-semibold" style={{ color }}>
                          {prCount} PR{prCount !== 1 ? 's' : ''} this week
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">
                          No PRs this week
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-gray-400" />
                      <span className="text-sm text-gray-500">
                        Added {formatDate(repo.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
