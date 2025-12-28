import { useState } from 'react';
import type { Category, Significance } from '../types';
import {
  ALL_CATEGORIES,
  ALL_SIGNIFICANCE,
  CATEGORY_LABELS,
  SIGNIFICANCE_LABELS,
} from '../types';
import { ChevronDown, Check } from 'lucide-react';

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
    <div className="flex items-center gap-2">
      {/* Significance Dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(openDropdown === 'significance' ? null : 'significance')}
          className={`flex items-center gap-2 px-3 py-2 rounded-full border-2 font-display font-medium text-sm transition-all ${
            hasActiveSignificance
              ? 'bg-yellow border-black'
              : 'bg-white border-black/30 hover:border-black'
          } ${openDropdown === 'significance' ? 'shadow-brutal-sm' : ''}`}
        >
          <span>{getSignificanceLabel()}</span>
          <ChevronDown size={14} className={`transition-transform ${openDropdown === 'significance' ? 'rotate-180' : ''}`} />
        </button>

        {openDropdown === 'significance' && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
            <div className="absolute right-0 mt-2 w-48 bg-white border-3 border-black rounded-lg shadow-brutal z-50 overflow-hidden animate-slide-down">
              <label className="flex items-center gap-3 px-4 py-3 hover:bg-cream cursor-pointer transition-colors">
                <div className={`w-5 h-5 rounded border-2 border-black flex items-center justify-center ${showReleases ? 'bg-lavender' : 'bg-white'}`}>
                  {showReleases && <Check size={12} strokeWidth={3} />}
                </div>
                <span className="font-display font-medium text-sm">Releases</span>
              </label>

              <div className="h-px bg-black/10" />

              {ALL_SIGNIFICANCE.map((sig) => (
                <label
                  key={sig}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream cursor-pointer transition-colors"
                  onClick={() => toggleSignificance(sig)}
                >
                  <div className={`w-5 h-5 rounded border-2 border-black flex items-center justify-center ${selectedSignificance.includes(sig) ? 'bg-mint' : 'bg-white'}`}>
                    {selectedSignificance.includes(sig) && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span className="font-display font-medium text-sm">{SIGNIFICANCE_LABELS[sig]}</span>
                </label>
              ))}

              <div className="h-px bg-black/10" />

              <div className="flex gap-2 p-2">
                <button
                  onClick={() => {
                    onSignificanceChange([...ALL_SIGNIFICANCE]);
                    onShowReleasesChange(true);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-display font-semibold bg-cream hover:bg-cream-dark rounded-md transition-colors"
                >
                  Select all
                </button>
                <button
                  onClick={() => {
                    onSignificanceChange([]);
                    onShowReleasesChange(false);
                  }}
                  className="flex-1 px-3 py-1.5 text-xs font-display font-semibold bg-cream hover:bg-cream-dark rounded-md transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Category Dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(openDropdown === 'category' ? null : 'category')}
          className={`flex items-center gap-2 px-3 py-2 rounded-full border-2 font-display font-medium text-sm transition-all ${
            hasActiveCategory
              ? 'bg-pink border-black'
              : 'bg-white border-black/30 hover:border-black'
          } ${openDropdown === 'category' ? 'shadow-brutal-sm' : ''}`}
        >
          <span>{getCategoryLabel()}</span>
          <ChevronDown size={14} className={`transition-transform ${openDropdown === 'category' ? 'rotate-180' : ''}`} />
        </button>

        {openDropdown === 'category' && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpenDropdown(null)} />
            <div className="absolute right-0 mt-2 w-48 bg-white border-3 border-black rounded-lg shadow-brutal z-50 overflow-hidden animate-slide-down">
              {ALL_CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream cursor-pointer transition-colors"
                  onClick={() => toggleCategory(cat)}
                >
                  <div className={`w-5 h-5 rounded border-2 border-black flex items-center justify-center ${selectedCategories.includes(cat) ? 'bg-mint' : 'bg-white'}`}>
                    {selectedCategories.includes(cat) && <Check size={12} strokeWidth={3} />}
                  </div>
                  <span className="font-display font-medium text-sm">{CATEGORY_LABELS[cat]}</span>
                </label>
              ))}

              <div className="h-px bg-black/10" />

              <div className="flex gap-2 p-2">
                <button
                  onClick={() => onCategoriesChange([...ALL_CATEGORIES])}
                  className="flex-1 px-3 py-1.5 text-xs font-display font-semibold bg-cream hover:bg-cream-dark rounded-md transition-colors"
                >
                  Select all
                </button>
                <button
                  onClick={() => onCategoriesChange([])}
                  className="flex-1 px-3 py-1.5 text-xs font-display font-semibold bg-cream hover:bg-cream-dark rounded-md transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
