'use client';

import { OutputMode } from '@/types/makerPresets';
import { cn } from '@/lib/utils/cn';

interface OutputModeSelectorProps {
  value: OutputMode;
  onChange: (mode: OutputMode) => void;
}

const OUTPUT_MODES: { id: OutputMode; label: string; description: string }[] = [
  {
    id: 'stroke-only',
    label: 'Stroke',
    description: 'Lines only, no fills',
  },
  {
    id: 'filled',
    label: 'Fill',
    description: 'Filled shapes, no strokes',
  },
  {
    id: 'combined',
    label: 'Both',
    description: 'Strokes and fills',
  },
];

export function OutputModeSelector({ value, onChange }: OutputModeSelectorProps) {
  return (
    <div className="flex gap-1">
      {OUTPUT_MODES.map(mode => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className={cn(
            'flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all',
            value === mode.id
              ? 'bg-neutral-900 text-white shadow-sm'
              : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
          )}
          title={mode.description}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
