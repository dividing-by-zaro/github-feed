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

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Significance:</span>
        <div className="filter-buttons">
          <button
            className={`filter-button ${showReleases ? 'active' : ''}`}
            onClick={() => onShowReleasesChange(!showReleases)}
          >
            Releases
          </button>
          {ALL_SIGNIFICANCE.map((sig) => (
            <button
              key={sig}
              className={`filter-button ${selectedSignificance.includes(sig) ? 'active' : ''}`}
              onClick={() => toggleSignificance(sig)}
            >
              {SIGNIFICANCE_LABELS[sig]}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <span className="filter-label">Category:</span>
        <div className="filter-buttons">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`filter-button ${selectedCategories.includes(cat) ? 'active' : ''}`}
              onClick={() => toggleCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
