import React from 'react';
import type { Update, Release, Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import UpdateCard from './UpdateCard';
import DateHeader from './DateHeader';
import GapIndicator from './GapIndicator';
import { RefreshCw, Tag, Clock } from 'lucide-react';

interface FeedProps {
  updates: Update[];
  releases: Release[];
  starredIds: string[];
  onToggleStar: (updateId: string) => void;
  onReleaseClick: (release: Release, repoName: string) => void;
  repos: Repo[];
  lastSeenAt: string | null;
  selectedRepo?: Repo | null;
  onFetchRecent?: () => void;
}

export default function Feed({
  updates,
  releases,
  starredIds,
  onToggleStar,
  onReleaseClick,
  repos,
  lastSeenAt,
  selectedRepo,
  onFetchRecent,
}: FeedProps) {
  // Derive loading state from selected repo's status
  const isFetching = selectedRepo?.status === 'pending' || selectedRepo?.status === 'indexing';
  const fetchFailed = selectedRepo?.status === 'failed';

  // Check if item is "new" based on when it was indexed (createdAt), not activity date
  const isNew = (item: { createdAt?: string; publishedAt?: string }) => {
    if (!lastSeenAt) return true;
    // Use createdAt for updates, publishedAt for releases (releases don't have createdAt yet)
    const indexedAt = item.createdAt ?? item.publishedAt;
    if (!indexedAt) return false;
    return new Date(indexedAt) > new Date(lastSeenAt);
  };

  const handleFetchRecent = () => {
    if (!onFetchRecent || isFetching) return;
    onFetchRecent();
  };

  // Helper to get date from item (handles both Update.date and Release.publishedAt)
  const getItemDate = (item: { date?: string; publishedAt?: string }) => {
    return item.date ?? item.publishedAt ?? new Date().toISOString();
  };

  // Merge updates and releases
  type FeedItem = (Update & { itemType: 'update' }) | (Release & { itemType: 'release' });
  const allItems: FeedItem[] = [
    ...updates.map((u) => ({ ...u, itemType: 'update' as const })),
    ...releases.map((r) => ({ ...r, itemType: 'release' as const })),
  ];

  // Group items by date using a Map (ensures no duplicate date headers)
  interface DateGroup {
    dateKey: string;
    date: Date;
    items: FeedItem[];
  }

  const groupMap = new Map<string, DateGroup>();

  for (const item of allItems) {
    const itemDate = new Date(getItemDate(item));
    const dateKey = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}-${String(itemDate.getDate()).padStart(2, '0')}`;

    if (!groupMap.has(dateKey)) {
      groupMap.set(dateKey, {
        dateKey,
        date: itemDate,
        items: [],
      });
    }
    groupMap.get(dateKey)!.items.push(item);
  }

  // Convert to array and sort groups by date (newest first)
  const groupedByDate = Array.from(groupMap.values())
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Sort items within each group by date (newest first)
  for (const group of groupedByDate) {
    group.items.sort((a, b) =>
      new Date(getItemDate(b)).getTime() - new Date(getItemDate(a)).getTime()
    );
  }

  const daysBetween = (date1: Date, date2: Date): number => {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.abs(Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
  };

  // Empty state when viewing a specific repo
  if (allItems.length === 0 && selectedRepo) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 bg-yellow rounded-full flex items-center justify-center border-3 border-black">
          <RefreshCw size={28} className={isFetching ? 'animate-spin' : ''} />
        </div>
        <p className="font-display font-semibold text-lg">
          {isFetching ? 'Loading updates...' : 'No recent changes found'}
        </p>
        {isFetching && selectedRepo.progress && (
          <p className="text-sm text-yellow-600">{selectedRepo.progress}</p>
        )}
        {fetchFailed && selectedRepo.error && (
          <p className="text-sm text-red-600">{selectedRepo.error}</p>
        )}
        {onFetchRecent && !isFetching && (
          <button
            onClick={handleFetchRecent}
            className="brutal-btn brutal-btn-primary"
          >
            <RefreshCw size={16} />
            Load older updates
          </button>
        )}
      </div>
    );
  }

  // Generic empty state
  if (allItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 bg-mint rounded-full flex items-center justify-center border-3 border-black">
          <Tag size={28} />
        </div>
        <p className="font-display font-semibold text-lg">No changes to show</p>
        <p className="text-gray-500">Add a repo to start tracking changes</p>
      </div>
    );
  }

  const getRepo = (repoId: string) => {
    const lowerRepoId = repoId.toLowerCase();
    return repos.find((r) => `${r.owner}/${r.name}`.toLowerCase() === lowerRepoId);
  };

  const renderItem = (item: FeedItem) => {
    if (item.itemType === 'release') {
      const repo = getRepo(item.repoId);
      const repoName = repo?.displayName || repo?.name || item.repoId;
      const repoColor = repo?.customColor || getRepoColor(item.repoId);
      const itemIsNew = isNew(item);

      return (
        <div
          key={item.id}
          onClick={() => onReleaseClick(item, repoName)}
          className={`group brutal-card p-4 cursor-pointer border-l-4 border-t-4 ${itemIsNew ? 'bg-sky/10' : 'bg-white'}`}
          style={{ borderLeftColor: repoColor, borderTopColor: repoColor }}
        >
          <div className="flex items-center gap-3 mb-3">
            {repo?.avatarUrl ? (
              <img
                src={repo.avatarUrl}
                alt={repoName}
                className="w-8 h-8 rounded-md border-2 border-black"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-md border-2 border-black"
                style={{ backgroundColor: repoColor }}
              />
            )}
            <span className="font-display font-semibold text-sm" style={{ color: repoColor }}>
              {repoName}
            </span>
            {itemIsNew && (
              <span className="px-2 py-0.5 bg-sky text-black text-xs font-display font-semibold rounded-full border-2 border-black">
                New
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-1 bg-lavender text-black text-xs font-display font-semibold rounded-full border-2 border-black">
              Release
            </span>
            <h3 className="font-display font-bold text-lg">{item.title}</h3>
          </div>

          {item.summary ? (
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
              {item.summary.split('\n').filter(line => line.trim()).map((line, i) => (
                <li key={i}>{line.replace(/^[-*]\s*/, '')}</li>
              ))}
            </ul>
          ) : item.body && (
            <p className="text-sm text-gray-500 line-clamp-2">{item.body.slice(0, 200)}...</p>
          )}
        </div>
      );
    }

    const repo = getRepo(item.repoId);
    return (
      <UpdateCard
        key={item.id}
        update={item}
        repoName={repo?.displayName || repo?.name || item.repoId}
        avatarUrl={repo?.avatarUrl ?? undefined}
        customColor={repo?.customColor ?? undefined}
        starredIds={starredIds}
        onToggleStar={onToggleStar}
        isNew={isNew(item)}
      />
    );
  };

  const GAP_THRESHOLD = 2;
  const today = new Date();
  const todayNormalized = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="space-y-4">
      {groupedByDate.map((group, groupIndex) => {
        const elements: React.ReactNode[] = [];

        // Gap from today
        if (groupIndex === 0) {
          const firstDate = new Date(group.date.getFullYear(), group.date.getMonth(), group.date.getDate());
          const daysFromToday = Math.floor((todayNormalized.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysFromToday >= GAP_THRESHOLD) {
            elements.push(
              <GapIndicator key="gap-from-today" days={daysFromToday} />
            );
          }
        }

        // Gap from previous group
        if (groupIndex > 0) {
          const prevGroup = groupedByDate[groupIndex - 1];
          const gap = daysBetween(prevGroup.date, group.date) - 1;
          if (gap >= GAP_THRESHOLD) {
            elements.push(
              <GapIndicator key={`gap-${group.dateKey}`} days={gap} />
            );
          }
        }

        // Date header
        elements.push(
          <DateHeader
            key={`header-${group.dateKey}`}
            date={group.date}
            updateCount={group.items.length}
          />
        );

        // Items
        elements.push(
          <div key={`items-${group.dateKey}`} className="space-y-3">
            {group.items.map(renderItem)}
          </div>
        );

        return elements;
      })}

      {selectedRepo && onFetchRecent && allItems.length > 0 && (
        <div className="mt-4 p-5 bg-cream/50 border-2 border-dashed border-gray-300 rounded-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center border-2 border-gray-400 shrink-0">
              <Clock size={20} className="text-gray-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-display font-semibold text-gray-700 mb-1">
                End of indexed updates
              </h3>
              <p className="text-sm text-gray-500 mb-3">
                Updates indexed back to{' '}
                <span className="font-semibold text-gray-700">
                  {new Date(getItemDate(allItems[allItems.length - 1])).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                . There may be older changes in this repository.
              </p>
              <button
                onClick={handleFetchRecent}
                disabled={isFetching}
                className="brutal-btn brutal-btn-secondary text-sm"
              >
                {isFetching ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    {selectedRepo.progress || 'Loading...'}
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Load older updates
                  </>
                )}
              </button>
              {fetchFailed && selectedRepo.error && (
                <p className="text-sm text-red-600 mt-2">{selectedRepo.error}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
