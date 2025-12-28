import ReactMarkdown from 'react-markdown';
import type { Release } from '../types';
import { X, ExternalLink, Tag } from 'lucide-react';

interface ReleaseModalProps {
  release: Release;
  repoName: string;
  onClose: () => void;
}

export default function ReleaseModal({ release, repoName, onClose }: ReleaseModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white border-3 border-black rounded-2xl shadow-brutal-lg animate-bounce-in flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b-2 border-black/10 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-display font-semibold text-sm text-gray-500">{repoName}</span>
                <span className="px-2 py-0.5 bg-lavender text-xs font-display font-semibold rounded-full border-2 border-black flex items-center gap-1">
                  <Tag size={10} />
                  {release.tagName}
                </span>
              </div>
              <h2 className="font-display text-2xl font-bold">{release.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shrink-0"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {release.body ? (
            <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:font-bold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-a:text-blue-600 prose-code:bg-cream prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:border prose-code:border-black/10 prose-code:font-mono prose-code:text-sm prose-pre:bg-cream prose-pre:border-2 prose-pre:border-black/10 prose-pre:rounded-lg">
              <ReactMarkdown>{release.body}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <Tag size={20} />
              </div>
              <p className="font-display font-medium">No release notes available</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t-2 border-black/10 flex items-center justify-between shrink-0">
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="brutal-btn brutal-btn-mint"
          >
            <ExternalLink size={16} />
            View on GitHub
          </a>
          <button onClick={onClose} className="brutal-btn brutal-btn-secondary">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
