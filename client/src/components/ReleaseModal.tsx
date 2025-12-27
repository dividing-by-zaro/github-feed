import ReactMarkdown from 'react-markdown';
import type { Release } from '../types';
import './ReleaseModal.css';

interface ReleaseModalProps {
  release: Release;
  repoName: string;
  onClose: () => void;
}

export default function ReleaseModal({ release, repoName, onClose }: ReleaseModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal release-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="release-modal-title">
            <span className="release-modal-repo">{repoName}</span>
            <h2>{release.title}</h2>
            <span className="release-modal-tag">{release.tagName}</span>
          </div>
          <button className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body release-modal-body">
          {release.body ? (
            <ReactMarkdown>{release.body}</ReactMarkdown>
          ) : (
            <p className="release-no-notes">No release notes available.</p>
          )}
        </div>
        <div className="modal-footer">
          <a
            href={release.url}
            target="_blank"
            rel="noopener noreferrer"
            className="release-modal-link"
          >
            View on GitHub
          </a>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
