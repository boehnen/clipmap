'use client';

import { MakerPreset } from '@/types/makerPresets';
import { cn } from '@/lib/utils/cn';

interface PresetGridProps {
  presets: MakerPreset[];
  selectedId: string | null;
  onSelect: (preset: MakerPreset) => void;
}

export function PresetGrid({ presets, selectedId, onSelect }: PresetGridProps) {
  if (presets.length === 0) {
    return (
      <div className="text-xs text-neutral-400 text-center py-4">
        No presets for this category
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {presets.map(preset => (
        <button
          key={preset.id}
          onClick={() => onSelect(preset)}
          className={cn(
            'w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-all',
            selectedId === preset.id
              ? 'bg-blue-50 border border-blue-200 shadow-sm'
              : 'bg-neutral-50 border border-transparent hover:bg-neutral-100 hover:border-neutral-200'
          )}
        >
          <span className="text-base flex-shrink-0 mt-0.5">{preset.icon}</span>
          <div className="min-w-0 flex-1">
            <div className={cn(
              'text-sm font-medium truncate',
              selectedId === preset.id ? 'text-blue-700' : 'text-neutral-800'
            )}>
              {preset.name}
            </div>
            <div className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">
              {preset.description}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                preset.outputMode === 'stroke-only'
                  ? 'bg-orange-100 text-orange-700'
                  : preset.outputMode === 'filled'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-green-100 text-green-700'
              )}>
                {preset.outputMode === 'stroke-only' ? 'Stroke' :
                 preset.outputMode === 'filled' ? 'Fill' : 'Combined'}
              </span>
              <span className="text-[10px] text-neutral-400">
                {preset.layers.length} layers
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
