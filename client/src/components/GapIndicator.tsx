import { Clock } from 'lucide-react';

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

function getGapStyle(days: number): string {
  if (days < 7) return 'bg-gray-100 text-gray-500 border-gray-200';
  if (days < 30) return 'bg-orange/20 text-orange border-orange/30';
  return 'bg-coral/20 text-coral border-coral/30';
}

export default function GapIndicator({ days }: GapIndicatorProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-black/5 border-t border-dashed border-black/10" />
      <div className={`flex items-center gap-1.5 px-3 py-1 text-xs font-display font-medium rounded-full border ${getGapStyle(days)}`}>
        <Clock size={12} />
        {formatGap(days)} gap
      </div>
      <div className="flex-1 h-px bg-black/5 border-t border-dashed border-black/10" />
    </div>
  );
}
