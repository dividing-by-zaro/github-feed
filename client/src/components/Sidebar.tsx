import { Infinity, Star, Rocket, Settings } from 'lucide-react';
import type { Repo } from '../types';

type ViewMode = 'all' | 'starred' | 'releases' | 'my-repos';

interface SidebarProps {
  repos: Repo[];
  selectedRepoId: string | null;
  viewMode: ViewMode;
  onSelectRepo: (repoId: string | null) => void;
  onSelectView: (mode: ViewMode) => void;
  onOpenRepoSettings: (repo: Repo) => void;
}

export default function Sidebar({
  repos,
  selectedRepoId,
  viewMode,
  onSelectRepo,
  onSelectView,
  onOpenRepoSettings,
}: SidebarProps) {
  const isViewActive = (mode: ViewMode) => viewMode === mode && !selectedRepoId;

  return (
    <aside className="w-64 bg-white border-r-3 border-black flex flex-col shrink-0">
      {/* Navigation */}
      <nav className="p-4 space-y-2">
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
            isViewActive('all')
              ? 'bg-yellow border-2 border-black shadow-brutal-sm'
              : 'hover:bg-cream border-2 border-transparent'
          }`}
          onClick={() => onSelectView('all')}
        >
          <Infinity size={18} />
          All Repos
        </button>
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
            isViewActive('starred')
              ? 'bg-pink border-2 border-black shadow-brutal-sm'
              : 'hover:bg-cream border-2 border-transparent'
          }`}
          onClick={() => onSelectView('starred')}
        >
          <Star size={18} />
          Starred
        </button>
        <button
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-display font-medium text-sm transition-all ${
            isViewActive('releases')
              ? 'bg-mint border-2 border-black shadow-brutal-sm'
              : 'hover:bg-cream border-2 border-transparent'
          }`}
          onClick={() => onSelectView('releases')}
        >
          <Rocket size={18} />
          Releases
        </button>
      </nav>

      {/* Repos Section */}
      <div className="flex-1 border-t-2 border-black/10 overflow-hidden flex flex-col">
        <h3 className="px-4 py-3 font-display font-semibold text-xs uppercase tracking-wider text-gray-500">
          Repos
        </h3>

        {repos.length === 0 ? (
          <p className="px-4 py-2 text-sm text-gray-300">
            No repos yet. Add one to get started.
          </p>
        ) : (
          <ul className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
            {repos.map((repo) => (
              <li
                key={repo.id}
                className={`group relative rounded-lg transition-all ${
                  selectedRepoId === repo.id
                    ? 'bg-lavender border-2 border-black shadow-brutal-sm'
                    : 'hover:bg-cream border-2 border-transparent'
                }`}
              >
                <button
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                  onClick={() => onSelectRepo(repo.id)}
                >
                  {repo.avatarUrl ? (
                    <img
                      src={repo.avatarUrl}
                      alt={`${repo.owner} avatar`}
                      className="w-8 h-8 rounded-md border-2 border-black shrink-0"
                    />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-md border-2 border-black shrink-0"
                      style={{ backgroundColor: repo.customColor || '#E8D5FF' }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="block font-display font-semibold text-sm truncate">
                      {repo.displayName || repo.name}
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {repo.owner}
                    </span>
                  </div>
                </button>

                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenRepoSettings(repo);
                  }}
                  title="Repo settings"
                >
                  <Settings size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
