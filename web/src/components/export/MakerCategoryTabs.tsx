'use client';

import { MakerCategory, MAKER_CATEGORIES } from '@/types/makerPresets';
import { cn } from '@/lib/utils/cn';

interface MakerCategoryTabsProps {
  selected: MakerCategory;
  onChange: (category: MakerCategory) => void;
}

export function MakerCategoryTabs({ selected, onChange }: MakerCategoryTabsProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {MAKER_CATEGORIES.map(category => (
        <button
          key={category.id}
          onClick={() => onChange(category.id)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
            selected === category.id
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          )}
          title={category.description}
        >
          <span>{category.icon}</span>
          <span>{category.name}</span>
        </button>
      ))}
    </div>
  );
}
