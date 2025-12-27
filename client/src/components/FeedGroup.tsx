import type { FeedGroup } from '../types';
import { getRepoColor } from '../utils/colors';
import ChangeItem from './ChangeItem';
import './FeedGroup.css';

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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className={`feed-group ${isNew ? 'is-new' : ''}`} style={{ borderLeftColor: repoColor }}>
      <div className="feed-group-header">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={repoName}
            className="feed-group-avatar"
          />
        ) : (
          <div
            className="feed-group-color-dot"
            style={{ backgroundColor: repoColor }}
          />
        )}
        <div className="feed-group-info">
          <div className="feed-group-repo-row">
            <span className="feed-group-repo" style={{ color: repoColor }}>
              {repoName}
            </span>
            {isNew && <span className="new-badge">New</span>}
          </div>
          {feedGroup.type === 'pr' && feedGroup.prUrl ? (
            <a
              href={feedGroup.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="feed-group-title"
            >
              PR #{feedGroup.prNumber} - {feedGroup.title}
            </a>
          ) : (
            <span className="feed-group-title">{feedGroup.title}</span>
          )}
        </div>
        <span className="feed-group-date">{formatDate(feedGroup.date)}</span>
      </div>

      <div className="feed-group-changes">
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
