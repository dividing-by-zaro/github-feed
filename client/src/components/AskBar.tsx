import { useState, useRef } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';

const TIME_PRESETS = [
  { label: 'Last week', days: 7 },
  { label: 'Last month', days: 30 },
  { label: 'Last 3 months', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last year', days: 365 },
  { label: 'All time', days: 365 * 5 },
] as const;

const DEFAULT_PRESET_INDEX = 2; // Last 3 months

interface AskBarProps {
  repoName?: string;
  onSubmit: (question: string, timeRange: { start: string; end: string }) => void;
  disabled?: boolean;
}

function getTimeRange(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default function AskBar({ repoName, onSubmit, disabled }: AskBarProps) {
  const [query, setQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET_INDEX);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const showChips = isFocused || query.length > 0;

  const handleSubmit = () => {
    const trimmed = query.trim();
    if (trimmed.length < 3 || disabled) return;
    onSubmit(trimmed, getTimeRange(TIME_PRESETS[selectedPreset].days));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="mb-6">
      <div className="bg-white border-3 border-black rounded-xl shadow-brutal p-3 transition-shadow">
        <div className="flex items-center gap-3">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={repoName ? `Ask about ${repoName}...` : 'Ask about your repos...'}
            className="flex-1 bg-transparent text-sm font-medium placeholder:text-gray-400 outline-none"
            disabled={disabled}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X size={16} className="text-gray-400" />
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={query.trim().length < 3 || disabled}
            className="brutal-btn brutal-btn-primary text-sm px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ask
            <ArrowRight size={14} />
          </button>
        </div>

        {showChips && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
            {TIME_PRESETS.map((preset, i) => (
              <button
                key={preset.label}
                onClick={() => setSelectedPreset(i)}
                className={`px-3 py-1 text-xs font-semibold rounded-full border-2 whitespace-nowrap transition-colors ${
                  i === selectedPreset
                    ? 'bg-mint border-black'
                    : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
