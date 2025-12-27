import './GapIndicator.css';

interface GapIndicatorProps {
  days: number;
}

function formatGap(days: number): string {
  if (days < 7) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  }

  const weeks = Math.floor(days / 7);
  if (days < 30) {
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }

  const months = Math.floor(days / 30);
  if (months < 12) {
    return `${months} month${months !== 1 ? 's' : ''}`;
  }

  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? 's' : ''}`;
}

function getGapTier(days: number): 'minor' | 'moderate' | 'major' {
  if (days < 7) return 'minor';
  if (days < 30) return 'moderate';
  return 'major';
}

export default function GapIndicator({ days }: GapIndicatorProps) {
  const tier = getGapTier(days);

  return (
    <div className={`gap-indicator gap-indicator-${tier}`}>
      <div className="gap-indicator-line" />
      <span className="gap-indicator-text">{formatGap(days)}</span>
      <div className="gap-indicator-line" />
    </div>
  );
}
