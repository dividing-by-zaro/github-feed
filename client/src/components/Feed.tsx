import React, { useState } from 'react';
import type { Update, Release, Repo } from '../types';
import { getRepoColor } from '../utils/colors';
import UpdateCard from './UpdateCard';
import DateHeader from './DateHeader';
import GapIndicator from './GapIndicator';
import { RefreshCw, Tag, Sparkles } from 'lucide-react';

interface FeedProps {
  updates: Update[];
  releases: Release[];
  starredIds: string[];
  onToggleStar: (updateId: string) => void;
  onReleaseClick: (release: Release, repoName: string) => void;
  repos: Repo[];
  lastSeenAt: string | null;
  selectedRepo?: Repo | null;
  onFetchRecent?: () => Promise<{ newCount: number; totalFetched: number; lastActivityAt: string | null }>;
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
  const [isFetching, setIsFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<string | null>(null);

  const isNew = (dateStr: string) => {
    if (!lastSeenAt) return true;
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
    } catch {
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

  // Helper to get date from item (handles both Update.date and Release.publishedAt)
  const getItemDate = (item: { date?: string; publishedAt?: string }) => {
    return item.date ?? item.publishedAt ?? new Date().toISOString();
  };

  // Merge updates and releases, sorted by date
  const allItems = [
    ...updates.map((u) => ({ ...u, itemType: 'update' as const })),
    ...releases.map((r) => ({ ...r, itemType: 'release' as const })),
  ].sort((a, b) => new Date(getItemDate(b)).getTime() - new Date(getItemDate(a)).getTime());

  // Group items by date
  type FeedItem = (typeof allItems)[number];
  interface DateGroup {
    dateKey: string;
    date: Date;
    items: FeedItem[];
  }

  const groupedByDate: DateGroup[] = [];
  let currentGroup: DateGroup | null = null;

  for (const item of allItems) {
    const itemDate = new Date(getItemDate(item));
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

  const daysBetween = (date1: Date, date2: Date): number => {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.abs(Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24)));
  };

  // Empty state when viewing a specific repo
  if (allItems.length === 0 && selectedRepo) {
    if (lastActivityAt) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-16 h-16 bg-lavender rounded-full flex items-center justify-center border-3 border-black">
            <Sparkles size={28} />
          </div>
          <p className="font-display font-semibold text-lg">No changes on main since {formatLastFetched(lastActivityAt)}</p>
          {fetchResult && (
            <p className={`text-sm ${fetchResult.type === 'success' ? 'text-mint-dark' : 'text-gray-500'}`}>
              {fetchResult.message}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 bg-yellow rounded-full flex items-center justify-center border-3 border-black">
          <RefreshCw size={28} />
        </div>
        <p className="font-display font-semibold text-lg">No recent changes found</p>
        {onFetchRecent && (
          <>
            <button
              onClick={handleFetchRecent}
              disabled={isFetching}
              className="brutal-btn brutal-btn-primary"
            >
              {isFetching ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Load older updates
                </>
              )}
            </button>
            {fetchResult && (
              <p className={`text-sm ${fetchResult.type === 'success' ? 'text-mint-dark' : 'text-gray-500'}`}>
                {fetchResult.message}
              </p>
            )}
          </>
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
    return repos.find((r) => `${r.owner}/${r.name}` === repoId);
  };

  const renderItem = (item: FeedItem) => {
    if (item.itemType === 'release') {
      const repo = getRepo(item.repoId);
      const repoName = repo?.displayName || repo?.name || item.repoId;
      const repoColor = repo?.customColor || getRepoColor(item.repoId);
      const itemIsNew = isNew(getItemDate(item));

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
        isNew={isNew(getItemDate(item))}
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

      {selectedRepo && onFetchRecent && (
        <div className="flex flex-col items-center gap-3 py-8 border-t-2 border-dashed border-gray-100">
          <button
            onClick={handleFetchRecent}
            disabled={isFetching}
            className="brutal-btn brutal-btn-secondary"
          >
            {isFetching ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Load older updates
              </>
            )}
          </button>
          {fetchResult && (
            <p className={`text-sm ${fetchResult.type === 'success' ? 'text-mint-dark' : 'text-gray-500'}`}>
              {fetchResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
