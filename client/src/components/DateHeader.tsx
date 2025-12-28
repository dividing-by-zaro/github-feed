import { Calendar } from 'lucide-react';

interface DateHeaderProps {
  date: Date;
  updateCount: number;
}

function formatDateHeader(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetDate.getTime() === today.getTime()) {
    return 'Today';
  }

  if (targetDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  const daysDiff = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 7) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DateHeader({ date, updateCount }: DateHeaderProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 py-3 bg-cream -mx-4 px-4">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-black rounded-full shadow-brutal-sm">
        <Calendar size={14} />
        <span className="font-display font-semibold text-sm">{formatDateHeader(date)}</span>
      </div>
      <span className="font-display text-xs text-gray-500 font-medium">
        {updateCount} update{updateCount !== 1 ? 's' : ''}
      </span>
      <div className="flex-1 h-px bg-black/10" />
    </div>
  );
}
