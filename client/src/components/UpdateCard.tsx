import { useState } from 'react';
import type { Update, Category } from '../types';
import { getRepoColor } from '../utils/colors';
import { CATEGORY_LABELS, SIGNIFICANCE_LABELS } from '../types';
import {
  Star,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Rocket,
  Sparkles,
  Bug,
  Zap,
  Archive,
  Gauge,
  Shield,
  FileText,
} from 'lucide-react';

const CATEGORY_ICONS: Record<Category, React.ReactNode> = {
  feature: <Rocket size={14} strokeWidth={2.5} />,
  enhancement: <Sparkles size={14} strokeWidth={2.5} />,
  bugfix: <Bug size={14} strokeWidth={2.5} />,
  breaking: <Zap size={14} strokeWidth={2.5} />,
  deprecation: <Archive size={14} strokeWidth={2.5} />,
  performance: <Gauge size={14} strokeWidth={2.5} />,
  security: <Shield size={14} strokeWidth={2.5} />,
  docs: <FileText size={14} strokeWidth={2.5} />,
};

const SIGNIFICANCE_COLORS: Record<string, string> = {
  major: 'bg-coral border-coral',
  minor: 'bg-mint border-mint',
  patch: 'bg-yellow border-yellow',
  internal: 'bg-gray-100 border-gray-100',
};

const CATEGORY_COLORS: Record<string, string> = {
  feature: 'bg-mint',
  enhancement: 'bg-sky',
  bugfix: 'bg-coral',
  breaking: 'bg-coral',
  deprecation: 'bg-orange',
  performance: 'bg-yellow',
  security: 'bg-pink',
  docs: 'bg-lavender',
};

function parseSummary(summary: string | null): string[] {
  if (!summary) return [];
  const lines = summary.split('\n').filter((line) => line.trim());
  return lines.map((line) => line.trim().replace(/^[-*]\s*/, '')).filter((line) => line.length > 0);
}

interface UpdateCardProps {
  update: Update;
  repoName: string;
  avatarUrl?: string;
  customColor?: string;
  starredIds: string[];
  onToggleStar: (updateId: string) => void;
  isNew?: boolean;
}

export default function UpdateCard({
  update,
  repoName,
  avatarUrl,
  customColor,
  starredIds,
  onToggleStar,
  isNew,
}: UpdateCardProps) {
  const [showCommits, setShowCommits] = useState(false);
  const repoColor = customColor || getRepoColor(update.repoId);
  const summaryPoints = parseSummary(update.summary);
  const fullId = `${update.repoId}-${update.id}`;
  const isStarred = starredIds.includes(fullId);

  // Collect all commits from all PRs
  const commits = (update.prs ?? []).flatMap((pr) =>
    (pr.commits ?? []).map((commit) => ({
      ...commit,
      prNumber: pr.prNumber,
      prTitle: pr.title,
    }))
  );

  return (
    <div
      className={`brutal-card overflow-hidden border-l-4 border-t-4 ${isNew ? 'bg-sky/5' : 'bg-white'}`}
      style={{ borderLeftColor: repoColor, borderTopColor: repoColor }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-3 mb-3">
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
            <span
              className="font-display font-bold text-sm"
              style={{ color: repoColor }}
            >
              {repoName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isNew && (
              <div className="relative flex items-center gap-1 px-2 py-0.5 bg-yellow text-black text-xs font-display font-semibold uppercase tracking-wide rounded-md border-2 border-black overflow-hidden">
                <Sparkles size={11} strokeWidth={2.5} className="shrink-0" />
                <span>New</span>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 animate-shimmer" />
              </div>
            )}
            <button
              onClick={() => onToggleStar(fullId)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                isStarred
                  ? 'bg-yellow text-black border-2 border-black'
                  : 'hover:bg-gray-100 text-gray-300 hover:text-gray-500'
              }`}
              title={isStarred ? 'Unstar' : 'Star'}
            >
              <Star size={16} fill={isStarred ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>

        {/* Category & Significance badges */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`w-7 h-7 flex items-center justify-center rounded-md border-2 border-black text-sm ${CATEGORY_COLORS[update.category] || 'bg-gray-100'}`}>
            {CATEGORY_ICONS[update.category]}
          </span>
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
            {CATEGORY_LABELS[update.category]}
          </span>
          <span className={`px-2 py-0.5 text-xs font-display font-bold uppercase rounded-full border-2 border-black ${SIGNIFICANCE_COLORS[update.significance]}`}>
            {SIGNIFICANCE_LABELS[update.significance]}
          </span>
        </div>

        {/* Title */}
        <h4 className="font-display font-semibold text-base mb-2">{update.title}</h4>

        {/* Summary */}
        {summaryPoints.length > 0 && (
          <ul className="space-y-1 text-sm text-gray-700 mb-3">
            {summaryPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Commits */}
        {commits.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowCommits(!showCommits)}
              className="flex items-center gap-1 text-xs font-display font-medium text-gray-500 hover:text-black transition-colors"
            >
              {showCommits ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {commits.length} commit{commits.length !== 1 ? 's' : ''}
            </button>

            {showCommits && (
              <ul className="mt-2 space-y-1.5 pl-4 border-l-2 border-gray-100">
                {commits.map((commit, idx) => (
                  <li key={`${commit.sha}-${idx}`} className="flex items-start gap-2 text-xs group">
                    <code className="font-mono bg-cream px-1.5 py-0.5 rounded border border-black/10 text-[10px] shrink-0">
                      {commit.sha}
                    </code>
                    <span className="text-gray-600 flex-1 truncate">{commit.message}</span>
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-black transition-all shrink-0"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
