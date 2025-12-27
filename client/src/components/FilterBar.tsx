import { useState } from 'react';
import type { Category, Significance } from '../types';
import {
  ALL_CATEGORIES,
  ALL_SIGNIFICANCE,
  CATEGORY_LABELS,
  SIGNIFICANCE_LABELS,
} from '../types';
import './FilterBar.css';

interface FilterBarProps {
  selectedSignificance: Significance[];
  selectedCategories: Category[];
  showReleases: boolean;
  onSignificanceChange: (significance: Significance[]) => void;
  onCategoriesChange: (categories: Category[]) => void;
  onShowReleasesChange: (show: boolean) => void;
}

export default function FilterBar({
  selectedSignificance,
  selectedCategories,
  showReleases,
  onSignificanceChange,
  onCategoriesChange,
  onShowReleasesChange,
}: FilterBarProps) {
  const [openDropdown, setOpenDropdown] = useState<'significance' | 'category' | null>(null);

  const toggleSignificance = (sig: Significance) => {
    if (selectedSignificance.includes(sig)) {
      onSignificanceChange(selectedSignificance.filter((s) => s !== sig));
    } else {
      onSignificanceChange([...selectedSignificance, sig]);
    }
  };

  const toggleCategory = (cat: Category) => {
    if (selectedCategories.includes(cat)) {
      onCategoriesChange(selectedCategories.filter((c) => c !== cat));
    } else {
      onCategoriesChange([...selectedCategories, cat]);
    }
  };

  const getSignificanceLabel = () => {
    const count = selectedSignificance.length + (showReleases ? 1 : 0);
    if (count === 0) return 'Levels';
    if (count === ALL_SIGNIFICANCE.length + 1) return 'All levels';
    return `${count} levels`;
  };

  const getCategoryLabel = () => {
    if (selectedCategories.length === 0) return 'Categories';
    if (selectedCategories.length === ALL_CATEGORIES.length) return 'All categories';
    return `${selectedCategories.length} categories`;
  };

  const hasActiveSignificance = selectedSignificance.length > 0 || showReleases;
  const hasActiveCategory = selectedCategories.length > 0;

  return (
    <div className="filter-bar">
      <div className="filter-dropdown-container">
        <button
          className={`filter-dropdown-btn ${hasActiveSignificance ? 'active' : ''} ${openDropdown === 'significance' ? 'open' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === 'significance' ? null : 'significance')}
        >
          <span>{getSignificanceLabel()}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {openDropdown === 'significance' && (
          <>
            <div className="filter-dropdown-backdrop" onClick={() => setOpenDropdown(null)} />
            <div className="filter-dropdown-menu">
              <label className="filter-dropdown-item">
                <input
                  type="checkbox"
                  checked={showReleases}
                  onChange={() => onShowReleasesChange(!showReleases)}
                />
                <span>Releases</span>
              </label>
              <div className="filter-dropdown-divider" />
              {ALL_SIGNIFICANCE.map((sig) => (
                <label key={sig} className="filter-dropdown-item">
                  <input
                    type="checkbox"
                    checked={selectedSignificance.includes(sig)}
                    onChange={() => toggleSignificance(sig)}
                  />
                  <span>{SIGNIFICANCE_LABELS[sig]}</span>
                </label>
              ))}
              <div className="filter-dropdown-divider" />
              <div className="filter-dropdown-actions">
                <button
                  onClick={() => {
                    onSignificanceChange([...ALL_SIGNIFICANCE]);
                    onShowReleasesChange(true);
                  }}
                >
                  Select all
                </button>
                <button
                  onClick={() => {
                    onSignificanceChange([]);
                    onShowReleasesChange(false);
                  }}
                >
                  Deselect all
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="filter-dropdown-container">
        <button
          className={`filter-dropdown-btn ${hasActiveCategory ? 'active' : ''} ${openDropdown === 'category' ? 'open' : ''}`}
          onClick={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
        >
          <span>{getCategoryLabel()}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {openDropdown === 'category' && (
          <>
            <div className="filter-dropdown-backdrop" onClick={() => setOpenDropdown(null)} />
            <div className="filter-dropdown-menu">
              {ALL_CATEGORIES.map((cat) => (
                <label key={cat} className="filter-dropdown-item">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(cat)}
                    onChange={() => toggleCategory(cat)}
                  />
                  <span>{CATEGORY_LABELS[cat]}</span>
                </label>
              ))}
              <div className="filter-dropdown-divider" />
              <div className="filter-dropdown-actions">
                <button onClick={() => onCategoriesChange([...ALL_CATEGORIES])}>
                  Select all
                </button>
                <button onClick={() => onCategoriesChange([])}>
                  Deselect all
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
