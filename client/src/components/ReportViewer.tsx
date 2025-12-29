import { useState } from 'react';
import { X, Download, Trash2, ChevronDown, ChevronRight, ExternalLink, AlertCircle } from 'lucide-react';
import type { Report, ReportSection, ReportTheme } from '../types';

interface ReportViewerProps {
  report: Report;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onDownload: (id: string) => Promise<void>;
}

const SIGNIFICANCE_STYLES = {
  major: {
    bg: 'bg-coral/20',
    border: 'border-coral',
    badge: 'bg-coral',
    label: 'Major Features',
  },
  minor: {
    bg: 'bg-mint/20',
    border: 'border-mint',
    badge: 'bg-mint',
    label: 'Minor Enhancements',
  },
  patch: {
    bg: 'bg-yellow/20',
    border: 'border-yellow',
    badge: 'bg-yellow',
    label: 'Patch Fixes',
  },
};

function ThemeCard({ theme, significance }: { theme: ReportTheme; significance: 'major' | 'minor' | 'patch' }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const styles = SIGNIFICANCE_STYLES[significance];

  return (
    <div className={`border-2 ${styles.border} rounded-xl overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${styles.bg} hover:opacity-90 transition-opacity`}
      >
        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        <span className="font-display font-semibold">{theme.name}</span>
        {theme.relatedPRs.length > 0 && (
          <span className="ml-auto text-xs text-gray-500">
            {theme.relatedPRs.length} PR{theme.relatedPRs.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="p-4 bg-white space-y-4">
          <div className="prose prose-sm max-w-none">
            {theme.summary.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-gray-700 leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>

          {theme.relatedPRs.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <h4 className="text-xs font-display font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Related PRs
              </h4>
              <ul className="space-y-1">
                {theme.relatedPRs.map((pr) => (
                  <li key={pr.number}>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-black transition-colors"
                    >
                      <span className="text-gray-400">#{pr.number}</span>
                      <span className="truncate">{pr.title}</span>
                      <ExternalLink size={12} className="shrink-0 text-gray-400" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionBlock({ section }: { section: ReportSection }) {
  const styles = SIGNIFICANCE_STYLES[section.significance];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={`px-3 py-1 text-sm font-display font-semibold rounded-full border-2 border-black ${styles.badge}`}>
          {styles.label}
        </span>
        <span className="text-sm text-gray-500">
          {section.themes.length} theme{section.themes.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-3">
        {section.themes.map((theme, i) => (
          <ThemeCard key={i} theme={theme} significance={section.significance} />
        ))}
      </div>
    </div>
  );
}

export default function ReportViewer({
  report,
  onClose,
  onDelete,
  onDownload,
}: ReportViewerProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(report.id);
      onClose();
    } catch (err) {
      console.error('Failed to delete report:', err);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await onDownload(report.id);
    } catch (err) {
      console.error('Failed to download report:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const content = report.content;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white border-3 border-black rounded-2xl shadow-brutal-lg animate-bounce-in flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-2 border-black/10 shrink-0">
          <div>
            <h2 className="font-display text-xl font-bold">
              {report.repoOwner}/{report.repoName}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {new Date(report.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              {' '}&ndash;{' '}
              {new Date(report.endDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {report.status === 'failed' ? (
            <div className="flex items-center gap-3 p-4 bg-coral/20 rounded-xl border-2 border-coral">
              <AlertCircle size={20} className="text-red-600 shrink-0" />
              <div>
                <p className="font-semibold text-red-700">Report generation failed</p>
                <p className="text-sm text-red-600">{report.error || 'Unknown error'}</p>
              </div>
            </div>
          ) : !content ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-500">
                <div className="w-5 h-5 border-2 border-gray-300 border-t-lavender rounded-full animate-spin" />
                <span>Loading report...</span>
              </div>
            </div>
          ) : (
            <>
              {/* Metadata */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="px-3 py-1.5 bg-cream rounded-lg border border-black/10">
                  <span className="text-gray-500">Updates: </span>
                  <span className="font-semibold">{content.metadata.updateCount}</span>
                </div>
                <div className="px-3 py-1.5 bg-cream rounded-lg border border-black/10">
                  <span className="text-gray-500">PRs: </span>
                  <span className="font-semibold">{content.metadata.prCount}</span>
                </div>
                <div className="px-3 py-1.5 bg-cream rounded-lg border border-black/10">
                  <span className="text-gray-500">Generated: </span>
                  <span className="font-semibold">
                    {new Date(content.metadata.generatedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="space-y-3">
                <h3 className="font-display text-lg font-bold">Executive Summary</h3>
                <div className="p-4 bg-lavender/20 rounded-xl border-2 border-lavender">
                  {content.executiveSummary.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="text-gray-700 leading-relaxed mb-3 last:mb-0">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>

              {/* Sections */}
              {content.sections.map((section, i) => (
                <SectionBlock key={i} section={section} />
              ))}

              {content.sections.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No significant changes found in this period.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t-2 border-black/10 shrink-0">
          {showDeleteConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">Delete this report?</span>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="brutal-btn brutal-btn-danger text-sm py-1.5 px-3"
              >
                {isDeleting ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="brutal-btn brutal-btn-secondary text-sm py-1.5 px-3"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="brutal-btn brutal-btn-secondary text-sm"
              >
                <Trash2 size={16} />
                Delete
              </button>
              <button
                onClick={handleDownload}
                disabled={isDownloading || report.status !== 'completed'}
                className="brutal-btn brutal-btn-primary text-sm disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Save as Markdown
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
