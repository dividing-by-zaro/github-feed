import type { FeedGroup, Release, Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import FeedGroupComponent from './FeedGroup';
import './Feed.css';

interface FeedProps {
  feedGroups: FeedGroup[];
  releases: Release[];
  starredIds: string[];
  onToggleStar: (changeId: string) => void;
  repos: Repo[];
  lastSeenAt: string | null;
}

export default function Feed({
  feedGroups,
  releases,
  starredIds,
  onToggleStar,
  repos,
  lastSeenAt,
}: FeedProps) {
  const isNew = (dateStr: string) => {
    if (!lastSeenAt) return true; // Everything is new if never marked as seen
    return new Date(dateStr) > new Date(lastSeenAt);
  };
  // Merge feed groups and releases, sorted by date
  const allItems = [
    ...feedGroups.map((g) => ({ ...g, itemType: 'feedGroup' as const })),
    ...releases.map((r) => ({ ...r, itemType: 'release' as const })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (allItems.length === 0) {
    return (
      <div className="feed-empty">
        <p>No changes to show.</p>
        <p>Add a repo to start tracking changes.</p>
      </div>
    );
  }

  const getRepo = (repoId: string) => {
    // repoId is in "owner/name" format, so match against that
    return repos.find((r) => `${r.owner}/${r.name}` === repoId);
  };

  return (
    <div className="feed">
      {allItems.map((item) => {
        if (item.itemType === 'release') {
          const repo = getRepo(item.repoId);
          const repoName = repo?.displayName || repo?.name || item.repoId;
          const repoColor = repo?.customColor || getRepoColor(item.repoId);
          const itemIsNew = isNew(item.date);
          return (
            <div
              key={item.id}
              className={`release-item ${itemIsNew ? 'is-new' : ''}`}
              style={{ borderLeftColor: repoColor }}
            >
              <div className="release-header">
                <div className="release-repo-row">
                  {repo?.avatarUrl ? (
                    <img
                      src={repo.avatarUrl}
                      alt={repoName}
                      className="release-avatar"
                    />
                  ) : (
                    <div
                      className="release-color-dot"
                      style={{ backgroundColor: repoColor }}
                    />
                  )}
                  <span className="release-repo" style={{ color: repoColor }}>
                    {repoName}
                  </span>
                  {itemIsNew && <span className="new-badge">New</span>}
                </div>
                <span className="release-date">
                  {new Date(item.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="release-title-row">
                <span className="release-badge">🏷️ Release</span>
                <h3>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h3>
              </div>
              {item.body && (
                <p className="release-body">{item.body.slice(0, 200)}...</p>
              )}
            </div>
          );
        }

        const repo = getRepo(item.repoId);
        return (
          <FeedGroupComponent
            key={item.id}
            feedGroup={item}
            repoName={repo?.displayName || repo?.name || item.repoId}
            avatarUrl={repo?.avatarUrl ?? undefined}
            customColor={repo?.customColor ?? undefined}
            starredIds={starredIds}
            onToggleStar={onToggleStar}
            isNew={isNew(item.date)}
          />
        );
      })}
    </div>
  );
}
