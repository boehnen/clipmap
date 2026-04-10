'use client';

import { cn } from '@/lib/utils/cn';

export type ExportType = 'svg' | '3d-city' | 'topographic' | 'city-poster' | 'route-art' | 'star-map';

interface ExportTypeOption {
  id: ExportType;
  name: string;
  description: string;
  icon: string;
  available: boolean;
}

const EXPORT_TYPES: ExportTypeOption[] = [
  {
    id: 'svg',
    name: 'SVG Map',
    description: 'Vector layers for laser cutting & design',
    icon: '📐',
    available: true,
  },
  {
    id: '3d-city',
    name: '3D City Model',
    description: '3D printable city with buildings',
    icon: '🏙️',
    available: false,
  },
  {
    id: 'topographic',
    name: 'Topographic Map',
    description: 'Elevation contour lines',
    icon: '⛰️',
    available: false,
  },
  {
    id: 'city-poster',
    name: 'City Poster',
    description: 'Minimalist wall art prints',
    icon: '🖼️',
    available: false,
  },
  {
    id: 'route-art',
    name: 'Route Art',
    description: 'GPS activity visualization',
    icon: '🗺️',
    available: false,
  },
  {
    id: 'star-map',
    name: 'Star Map',
    description: 'Night sky from any location',
    icon: '✨',
    available: false,
  },
];

interface ExportTypeSelectorProps {
  selected: ExportType;
  onChange: (type: ExportType) => void;
}

export function ExportTypeSelector({ selected, onChange }: ExportTypeSelectorProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-neutral-700">Export Type</h3>
      <div className="space-y-1.5">
        {EXPORT_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => type.available && onChange(type.id)}
            disabled={!type.available}
            className={cn(
              'w-full p-2.5 rounded-lg border text-left transition-all flex items-center gap-3',
              selected === type.id
                ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                : 'border-neutral-200 bg-white hover:border-neutral-300',
              !type.available && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span className="text-xl flex-shrink-0">{type.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-neutral-900 flex items-center gap-2">
                {type.name}
                {!type.available && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-neutral-200 text-neutral-500 rounded">
                    Soon
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500 truncate">
                {type.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
