import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Loader2, AlertCircle, MessageSquare } from 'lucide-react';
import type { Update, Repo } from '../types';
import UpdateCard from './UpdateCard';

interface AskModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: string;
  phase: number;
  phaseMessage: string;
  streamedAnswer: string;
  isDone: boolean;
  error: string | null;
  citedUpdates: Update[];
  repos: Repo[];
  starredIds: string[];
  onToggleStar: (updateId: string) => void;
}

// Strip [[update:ID]] citation markers from text for display
function stripCitations(text: string): string {
  return text.replace(/\[\[update:[^\]]+\]\]/g, '');
}

export default function AskModal({
  isOpen,
  onClose,
  question,
  phase,
  phaseMessage,
  streamedAnswer,
  isDone,
  error,
  citedUpdates,
  repos,
  starredIds,
  onToggleStar,
}: AskModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  // Auto-scroll during streaming, unless user scrolled up
  useEffect(() => {
    if (userScrolledRef.current || !contentRef.current) return;
    contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [streamedAnswer]);

  const handleScroll = () => {
    if (!contentRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    // If user scrolled up more than 100px from bottom, stop auto-scroll
    userScrolledRef.current = scrollHeight - scrollTop - clientHeight > 100;
  };

  // Reset scroll tracking when modal opens
  useEffect(() => {
    if (isOpen) {
      userScrolledRef.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isStreaming = phase > 0 && !isDone && !error;
  const displayText = stripCitations(streamedAnswer);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white border-3 border-black rounded-2xl shadow-brutal-lg animate-bounce-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black/10 shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 bg-lavender rounded-full flex items-center justify-center shrink-0 border-2 border-black">
              <MessageSquare size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold truncate">{question}</h2>
              {isStreaming && phaseMessage && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={12} className="animate-spin" />
                  <span>{phaseMessage}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0 ml-3"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-6"
        >
          {error && (
            <div className="p-4 bg-coral/20 border-2 border-coral rounded-xl flex items-start gap-3 mb-4">
              <AlertCircle size={18} className="text-coral shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Something went wrong</p>
                <p className="text-sm text-gray-700 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!streamedAnswer && !error && phase > 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="animate-spin text-gray-400" />
              <p className="text-sm text-gray-500">{phaseMessage || 'Thinking...'}</p>
            </div>
          )}

          {displayText && (
            <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-a:text-blue-600 prose-code:bg-cream prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:border prose-code:border-black/10 prose-code:font-mono prose-code:text-sm prose-pre:bg-cream prose-pre:border-2 prose-pre:border-black/10 prose-pre:rounded-lg prose-strong:font-semibold">
              <ReactMarkdown>{displayText}</ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-black animate-pulse ml-0.5 align-text-bottom" />
              )}
            </div>
          )}

          {/* Cited Updates */}
          {isDone && citedUpdates.length > 0 && (
            <div className="mt-8 pt-6 border-t-2 border-black/10">
              <h3 className="font-display font-bold text-sm text-gray-500 uppercase tracking-wide mb-4">
                Referenced Updates ({citedUpdates.length})
              </h3>
              <div className="space-y-3">
                {citedUpdates.map((update) => {
                  const repo = repos.find(
                    (r) => `${r.owner}/${r.name}`.toLowerCase() === update.repoId.toLowerCase()
                  );
                  return (
                    <UpdateCard
                      key={update.id}
                      update={update}
                      repoName={update.repoId}
                      avatarUrl={repo?.avatarUrl ?? undefined}
                      customColor={repo?.customColor ?? undefined}
                      starredIds={starredIds}
                      onToggleStar={onToggleStar}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-black/10 flex justify-end shrink-0">
          <button onClick={onClose} className="brutal-btn brutal-btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
