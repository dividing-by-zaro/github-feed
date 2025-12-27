import React, { useState } from 'react';
import type { FeedGroup, Release, Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import FeedGroupComponent from './FeedGroup';
import DateHeader from './DateHeader';
import GapIndicator from './GapIndicator';
import './Feed.css';

interface FeedProps {
  feedGroups: FeedGroup[];
  releases: Release[];
  starredIds: string[];
  onToggleStar: (changeId: string) => void;
  onReleaseClick: (release: Release, repoName: string) => void;
  repos: Repo[];
  lastSeenAt: string | null;
  selectedRepo?: Repo | null;
  onFetchRecent?: () => Promise<{ newCount: number; totalFetched: number; lastActivityAt: string | null }>;
}

export default function Feed({
  feedGroups,
  releases,
  starredIds,
  onToggleStar,
  onReleaseClick,
  repos,
  lastSeenAt,
  selectedRepo,
  onFetchRecent,
}: FeedProps) {
  const [isFetching, setIsFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<string | null>(null);
  const isNew = (dateStr: string) => {
    if (!lastSeenAt) return true; // Everything is new if never marked as seen
    return new Date(dateStr) > new Date(lastSeenAt);
  };

  const handleFetchRecent = async () => {
    if (!onFetchRecent || isFetching) return;

    setIsFetching(true);
    setFetchResult(null);

    try {
      const result = await onFetchRecent();
      setLastActivityAt(result.lastActivityAt);

      if (result.newCount > 0) {
        setFetchResult({
          message: `Found ${result.newCount} new update${result.newCount > 1 ? 's' : ''}`,
          type: 'success',
        });
      } else if (result.totalFetched === 0) {
        setFetchResult({
          message: 'This repo has no pull requests',
          type: 'info',
        });
      } else {
        setFetchResult({
          message: 'No older updates found',
          type: 'info',
        });
      }
    } catch (err) {
      setFetchResult({
        message: 'Failed to fetch updates',
        type: 'info',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const formatLastFetched = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'unknown';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Merge feed groups and releases, sorted by date
  const allItems = [
    ...feedGroups.map((g) => ({ ...g, itemType: 'feedGroup' as const })),
    ...releases.map((r) => ({ ...r, itemType: 'release' as const })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Group items by date (YYYY-MM-DD)
  type FeedItem = (typeof allItems)[number];
  interface DateGroup {
    dateKey: string;
    date: Date;
    items: FeedItem[];
  }

  const groupedByDate: DateGroup[] = [];
  let currentGroup: DateGroup | null = null;

  for (const item of allItems) {
    const itemDate = new Date(item.date);
    const dateKey = itemDate.toISOString().split('T')[0];

    if (!currentGroup || currentGroup.dateKey !== dateKey) {
      currentGroup = {
        dateKey,
        date: itemDate,
        items: [item],
      };
      groupedByDate.push(currentGroup);
    } else {
      currentGroup.items.push(item);
    }
  }

  // Calculate days between two dates
  const daysBetween = (date1: Date, date2: Date): number => {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.abs(Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
  };

  // Empty state when viewing a specific repo
  if (allItems.length === 0 && selectedRepo) {
    // After fetching, show the actual GitHub activity date
    if (lastActivityAt) {
      return (
        <div className="feed-empty">
          <p>No changes on main since {formatLastFetched(lastActivityAt)}</p>
          {fetchResult && (
            <p className={`fetch-result ${fetchResult.type}`}>{fetchResult.message}</p>
          )}
        </div>
      );
    }

    // Before fetching, prompt to load updates
    return (
      <div className="feed-empty">
        <p>No recent changes found.</p>
        {onFetchRecent && (
          <>
            <button
              className="fetch-recent-btn"
              onClick={handleFetchRecent}
              disabled={isFetching}
            >
              {isFetching ? 'Loading...' : 'Load older updates'}
            </button>
            {fetchResult && (
              <p className={`fetch-result ${fetchResult.type}`}>{fetchResult.message}</p>
            )}
          </>
        )}
      </div>
    );
  }

  // Generic empty state
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

  const renderItem = (item: (typeof allItems)[number]) => {
    if (item.itemType === 'release') {
      const repo = getRepo(item.repoId);
      const repoName = repo?.displayName || repo?.name || item.repoId;
      const repoColor = repo?.customColor || getRepoColor(item.repoId);
      const itemIsNew = isNew(item.date);
      return (
        <div
          key={item.id}
          className={`release-item clickable ${itemIsNew ? 'is-new' : ''}`}
          style={{ borderLeftColor: repoColor }}
          onClick={() => onReleaseClick(item, repoName)}
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
          </div>
          <div className="release-title-row">
            <span className="release-badge">Release</span>
            <h3>{item.title}</h3>
          </div>
          {item.summary ? (
            <ul className="release-summary">
              {item.summary.split('\n').filter(line => line.trim()).map((line, i) => (
                <li key={i}>{line.replace(/^[-•*]\s*/, '')}</li>
              ))}
            </ul>
          ) : item.body && (
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
  };

  // Minimum gap threshold in days to show a gap indicator
  const GAP_THRESHOLD = 2;

  // Calculate days from today to the first item
  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="feed">
      {groupedByDate.map((group, groupIndex) => {
        const elements: React.ReactNode[] = [];

        // Add gap indicator before the first group if it's not from today
        if (groupIndex === 0) {
          const firstDate = new Date(group.date.getFullYear(), group.date.getMonth(), group.date.getDate());
          const daysFromToday = Math.floor((todayNormalized.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysFromToday >= GAP_THRESHOLD) {
            elements.push(
              <GapIndicator key="gap-from-today" days={daysFromToday} />
            );
          }
        }

        // Add gap indicator if there's a significant gap from the previous group
        if (groupIndex > 0) {
          const prevGroup = groupedByDate[groupIndex - 1];
          const gap = daysBetween(prevGroup.date, group.date) - 1; // -1 because consecutive days have 1 day diff
          if (gap >= GAP_THRESHOLD) {
            elements.push(
              <GapIndicator key={`gap-${group.dateKey}`} days={gap} />
            );
          }
        }

        // Add date header
        elements.push(
          <DateHeader
            key={`header-${group.dateKey}`}
            date={group.date}
            updateCount={group.items.length}
          />
        );

        // Add items for this date
        elements.push(
          <div key={`items-${group.dateKey}`} className="date-group-items">
            {group.items.map(renderItem)}
          </div>
        );

        return elements;
      })}

      {selectedRepo && onFetchRecent && (
        <div className="load-older-section">
          <button
            className="load-older-btn"
            onClick={handleFetchRecent}
            disabled={isFetching}
          >
            {isFetching ? 'Loading...' : 'Load older updates'}
          </button>
          {fetchResult && (
            <p className={`fetch-result ${fetchResult.type}`}>{fetchResult.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
