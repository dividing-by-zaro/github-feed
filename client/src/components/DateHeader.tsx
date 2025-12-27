import './DateHeader.css';

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

  // Today
  if (targetDate.getTime() === today.getTime()) {
    return 'Today';
  }

  // Yesterday
  if (targetDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  }

  // Within last 7 days - show day name
  const daysDiff = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 7) {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }

  // Same year - show month and day
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
  }

  // Different year - show full date
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function DateHeader({ date, updateCount }: DateHeaderProps) {
  return (
    <div className="date-header">
      <div className="date-header-line" />
      <div className="date-header-content">
        <span className="date-header-text">{formatDateHeader(date)}</span>
        <span className="date-header-count">
          {updateCount} update{updateCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="date-header-line" />
    </div>
  );
}
