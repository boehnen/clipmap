'use client';

import { cn } from '@/lib/utils/cn';
import { LayerName } from '@/types';

export interface UseCase {
  id: string;
  name: string;
  icon: string;
  description: string;
  layers: LayerName[];
  strokeWidths?: Partial<Record<LayerName, number>>;
  recommended?: string;
}

export const USE_CASES: UseCase[] = [
  {
    id: 'laser-city',
    name: 'Laser Cut Map',
    icon: '✂️',
    description: 'Roads & water for single-material cutting',
    layers: ['roads', 'water', 'land'],
    strokeWidths: { roads: 0.5, water: 0.3 },
    recommended: 'Plywood, acrylic',
  },
  {
    id: 'layered-wood',
    name: 'Layered Wood',
    icon: '🪵',
    description: 'Separate layers for stacked wood art',
    layers: ['land', 'water', 'parks', 'roads'],
    strokeWidths: { roads: 0.4, water: 0.3, parks: 0.3 },
    recommended: '3-4 layers of wood/acrylic',
  },
  {
    id: 'engrave',
    name: 'Engraving',
    icon: '🔥',
    description: 'Detailed map for laser engraving',
    layers: ['roads', 'water', 'parks', 'buildings', 'railways'],
    strokeWidths: { roads: 0.2, water: 0.15, parks: 0.15, buildings: 0.1 },
    recommended: 'Wood, leather, slate',
  },
  {
    id: 'vinyl',
    name: 'Vinyl Cutter',
    icon: '📄',
    description: 'Simplified roads only for vinyl',
    layers: ['roads'],
    strokeWidths: { roads: 0.8 },
    recommended: 'Vinyl decal',
  },
  {
    id: 'wall-art',
    name: 'Wall Art',
    icon: '🖼️',
    description: 'Full detail for framed prints',
    layers: ['land', 'water', 'parks', 'roads', 'buildings'],
    strokeWidths: { roads: 0.3, water: 0.2, parks: 0.2, buildings: 0.15 },
    recommended: 'Print or large format',
  },
  {
    id: 'custom',
    name: 'Custom',
    icon: '⚙️',
    description: 'Choose your own layers',
    layers: [],
  },
];

interface UseCasePresetsProps {
  selected: string;
  onChange: (useCase: UseCase) => void;
}

export function UseCasePresets({ selected, onChange }: UseCasePresetsProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-700">Use Case</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            onClick={() => onChange(uc)}
            className={cn(
              'p-2 rounded-lg border text-center transition-all',
              selected === uc.id
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            )}
          >
            <div className="text-lg mb-0.5">{uc.icon}</div>
            <div className="text-xs font-medium text-neutral-800 leading-tight">{uc.name}</div>
          </button>
        ))}
      </div>
      {selected && selected !== 'custom' && (
        <p className="text-xs text-neutral-500">
          {USE_CASES.find(u => u.id === selected)?.description}
        </p>
      )}
    </div>
  );
}
