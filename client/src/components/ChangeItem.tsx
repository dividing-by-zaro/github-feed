import { useState } from 'react';
import type { Change, Category } from '../types';
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

interface ChangeItemProps {
  change: Change;
  isStarred: boolean;
  onToggleStar: () => void;
}

function parseSummary(summary: string): string[] {
  const lines = summary.split('\n').filter((line) => line.trim());
  const hasBullets = lines.some((line) => /^[-*]\s/.test(line.trim()));

  if (hasBullets) {
    return lines
      .map((line) => line.trim().replace(/^[-*]\s*/, ''))
      .filter((line) => line.length > 0);
  }

  return [summary];
}

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

export default function ChangeItem({
  change,
  isStarred,
  onToggleStar,
}: ChangeItemProps) {
  const [showCommits, setShowCommits] = useState(false);
  const summaryPoints = parseSummary(change.summary);
  const hasMultiplePoints = summaryPoints.length > 1;

  return (
    <div className="p-4 hover:bg-cream/50 transition-colors">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 flex items-center justify-center rounded-md border-2 border-black text-sm ${CATEGORY_COLORS[change.category] || 'bg-gray-100'}`}>
          {CATEGORY_ICONS[change.category]}
        </span>
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
          {CATEGORY_LABELS[change.category]}
        </span>
        <span className={`px-2 py-0.5 text-xs font-display font-bold uppercase rounded-full border-2 border-black ${SIGNIFICANCE_COLORS[change.significance]}`}>
          {SIGNIFICANCE_LABELS[change.significance]}
        </span>
        <div className="flex-1" />
        <button
          onClick={onToggleStar}
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

      {/* Title */}
      <h4 className="font-display font-semibold text-base mb-2">{change.title}</h4>

      {/* Summary */}
      {hasMultiplePoints ? (
        <ul className="space-y-1 text-sm text-gray-700">
          {summaryPoints.map((point, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 shrink-0" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-700">{summaryPoints[0]}</p>
      )}

      {/* Commits */}
      {change.commits && change.commits.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowCommits(!showCommits)}
            className="flex items-center gap-1 text-xs font-display font-medium text-gray-500 hover:text-black transition-colors"
          >
            {showCommits ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {change.commits.length} commit{change.commits.length !== 1 ? 's' : ''}
          </button>

          {showCommits && (
            <ul className="mt-2 space-y-1.5 pl-4 border-l-2 border-gray-100">
              {change.commits.map((commit) => (
                <li key={commit.sha} className="flex items-start gap-2 text-xs group">
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
  );
}
