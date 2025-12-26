import { useState } from 'react';
import type { Change } from '../types';
import { CATEGORY_ICONS, CATEGORY_LABELS, SIGNIFICANCE_LABELS } from '../types';
import './ChangeItem.css';

interface ChangeItemProps {
  change: Change;
  isStarred: boolean;
  onToggleStar: () => void;
}

// Parse summary into bullet points if it contains them
function parseSummary(summary: string): string[] {
  // Check if summary contains bullet points (lines starting with - or •)
  const lines = summary.split('\n').filter((line) => line.trim());
  const hasBullets = lines.some((line) => /^[-•*]\s/.test(line.trim()));

  if (hasBullets) {
    return lines
      .map((line) => line.trim().replace(/^[-•*]\s*/, ''))
      .filter((line) => line.length > 0);
  }

  // If no bullets, return as single item
  return [summary];
}

export default function ChangeItem({
  change,
  isStarred,
  onToggleStar,
}: ChangeItemProps) {
  const [showCommits, setShowCommits] = useState(false);
  const summaryPoints = parseSummary(change.summary);
  const hasMultiplePoints = summaryPoints.length > 1;

  return (
    <div className="change-item">
      <div className="change-header">
        <span className="change-icon">{CATEGORY_ICONS[change.category]}</span>
        <span className="change-category">{CATEGORY_LABELS[change.category]}</span>
        <span className={`change-significance ${change.significance}`}>
          {SIGNIFICANCE_LABELS[change.significance]}
        </span>
        <button
          className={`change-star ${isStarred ? 'starred' : ''}`}
          onClick={onToggleStar}
          title={isStarred ? 'Unstar' : 'Star'}
        >
          {isStarred ? '★' : '☆'}
        </button>
      </div>

      <h4 className="change-title">{change.title}</h4>

      {hasMultiplePoints ? (
        <ul className="change-summary-list">
          {summaryPoints.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      ) : (
        <p className="change-summary">{summaryPoints[0]}</p>
      )}

      {change.commits && change.commits.length > 0 && (
        <div className="change-commits">
          <button
            className="commits-toggle"
            onClick={() => setShowCommits(!showCommits)}
          >
            {showCommits ? '▼' : '▶'} {change.commits.length} commit{change.commits.length !== 1 ? 's' : ''}
          </button>

          {showCommits && (
            <ul className="commits-list">
              {change.commits.map((commit) => (
                <li key={commit.sha} className="commit-item">
                  <code className="commit-sha">{commit.sha}</code>
                  <span className="commit-message">{commit.message}</span>
                  <a
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="commit-link"
                  >
                    →
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
