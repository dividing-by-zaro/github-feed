import type { FeedGroup } from '../types';
import { getRepoColor } from '../utils/colors';
import ChangeItem from './ChangeItem';
import { ExternalLink } from 'lucide-react';

interface FeedGroupProps {
  feedGroup: FeedGroup;
  repoName: string;
  avatarUrl?: string;
  customColor?: string;
  starredIds: string[];
  onToggleStar: (changeId: string) => void;
  isNew?: boolean;
}

export default function FeedGroupComponent({
  feedGroup,
  repoName,
  avatarUrl,
  customColor,
  starredIds,
  onToggleStar,
  isNew,
}: FeedGroupProps) {
  const repoColor = customColor || getRepoColor(feedGroup.repoId);

  return (
    <div
      className={`brutal-card overflow-hidden border-l-4 ${isNew ? 'bg-sky/5' : 'bg-white'}`}
      style={{ borderLeftColor: repoColor }}
    >
      {/* Header */}
      <div className="p-4 border-b-2 border-black/10">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={repoName}
              className="w-10 h-10 rounded-lg border-2 border-black"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-lg border-2 border-black"
              style={{ backgroundColor: repoColor }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-display font-bold text-sm"
                style={{ color: repoColor }}
              >
                {repoName}
              </span>
              {isNew && (
                <span className="px-2 py-0.5 bg-sky text-black text-xs font-display font-semibold rounded-full border-2 border-black">
                  New
                </span>
              )}
            </div>
            {feedGroup.type === 'pr' && feedGroup.prUrl ? (
              <a
                href={feedGroup.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1 text-sm text-gray-700 hover:text-black transition-colors"
              >
                <span className="font-mono text-xs bg-cream px-1.5 py-0.5 rounded border border-black/20">
                  #{feedGroup.prNumber}
                </span>
                <span className="truncate">{feedGroup.title}</span>
                <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
              </a>
            ) : (
              <span className="text-sm text-gray-700">{feedGroup.title}</span>
            )}
          </div>
        </div>
      </div>

      {/* Changes */}
      <div className="divide-y divide-black/10">
        {feedGroup.changes.map((change) => {
          const fullId = `${feedGroup.repoId}-${change.id}`;
          return (
            <ChangeItem
              key={change.id}
              change={change}
              isStarred={starredIds.includes(fullId)}
              onToggleStar={() => onToggleStar(fullId)}
            />
          );
        })}
      </div>
    </div>
  );
}
