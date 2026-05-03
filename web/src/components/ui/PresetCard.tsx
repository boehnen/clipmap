'use client';

import { useState, useEffect, useMemo } from 'react';
import { LocationPreset } from '@/types/ui';
import { generatePreview, getCachedPreview, PreviewData } from '@/lib/preview/generatePreview';

// Preset gradient palettes for variety
const GRADIENT_PALETTES = [
  { water: ['#0ea5e9', '#0c4a6e'], land: ['#a3e635', '#365314'] }, // Ocean/Forest
  { water: ['#38bdf8', '#1e3a5f'], land: ['#fcd34d', '#92400e'] }, // Sky/Sand
  { water: ['#06b6d4', '#164e63'], land: ['#d4d4d4', '#525252'] }, // Teal/Stone
  { water: ['#818cf8', '#312e81'], land: ['#fda4af', '#881337'] }, // Indigo/Rose
  { water: ['#2dd4bf', '#134e4a'], land: ['#fdba74', '#7c2d12'] }, // Emerald/Amber
  { water: ['#60a5fa', '#1e3a8a'], land: ['#86efac', '#14532d'] }, // Blue/Green
  { water: ['#a78bfa', '#4c1d95'], land: ['#fde68a', '#78350f'] }, // Purple/Gold
  { water: ['#22d3ee', '#0e7490'], land: ['#e5e5e5', '#404040'] }, // Cyan/Gray
  { water: ['#4ade80', '#166534'], land: ['#fca5a5', '#7f1d1d'] }, // Green/Red
  { water: ['#fb923c', '#9a3412'], land: ['#c4b5fd', '#5b21b6'] }, // Orange/Violet
];

// Helper to lighten a color
function lightenColor(hex: string, amount = 0.2): string {
  hex = hex.replace('#', '');
  const r = Math.min(255, Math.round(parseInt(hex.substring(0, 2), 16) * (1 + amount)));
  const g = Math.min(255, Math.round(parseInt(hex.substring(2, 4), 16) * (1 + amount)));
  const b = Math.min(255, Math.round(parseInt(hex.substring(4, 6), 16) * (1 + amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Helper to darken a color
function darkenColor(hex: string, amount = 0.3): string {
  hex = hex.replace('#', '');
  const r = Math.round(parseInt(hex.substring(0, 2), 16) * (1 - amount));
  const g = Math.round(parseInt(hex.substring(2, 4), 16) * (1 - amount));
  const b = Math.round(parseInt(hex.substring(4, 6), 16) * (1 - amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface PresetCardProps {
  preset: LocationPreset;
  onClick: () => void;
}

export function PresetCard({ preset, onClick }: PresetCardProps) {
  const [preview, setPreview] = useState<PreviewData | null>(() => getCachedPreview(preset.bbox));
  const [isLoading, setIsLoading] = useState(!preview);

  // Get gradient palette based on preset id hash for consistent colors
  const palette = useMemo(() => {
    // Simple hash of preset id to pick a palette
    let hash = 0;
    for (let i = 0; i < preset.id.length; i++) {
      hash = ((hash << 5) - hash) + preset.id.charCodeAt(i);
      hash = hash & hash;
    }
    const index = Math.abs(hash) % GRADIENT_PALETTES.length;
    return GRADIENT_PALETTES[index];
  }, [preset.id]);

  // Check for saved gradient styles (custom presets)
  const savedWaterGradient = preset.savedLayerStyles?.water?.fillGradient;
  const savedLandGradient = preset.savedLayerStyles?.land?.fillGradient;

  // Use saved gradients, preset colors, or palette
  const waterColors = useMemo(() => {
    if (savedWaterGradient && savedWaterGradient.stops.length >= 2) {
      return [savedWaterGradient.stops[0].color, savedWaterGradient.stops[savedWaterGradient.stops.length - 1].color];
    }
    if (preset.waterColor) {
      return [lightenColor(preset.waterColor, 0.15), darkenColor(preset.waterColor, 0.25)];
    }
    return palette.water;
  }, [preset.waterColor, palette, savedWaterGradient]);

  const landColors = useMemo(() => {
    if (savedLandGradient && savedLandGradient.stops.length >= 2) {
      return [savedLandGradient.stops[0].color, savedLandGradient.stops[savedLandGradient.stops.length - 1].color];
    }
    if (preset.landColor) {
      return [lightenColor(preset.landColor, 0.1), darkenColor(preset.landColor, 0.2)];
    }
    return palette.land;
  }, [preset.landColor, palette, savedLandGradient]);

  // Get gradient angles from saved styles
  const waterAngle = savedWaterGradient?.type === 'linear' ? savedWaterGradient.angle : 180;
  const landAngle = savedLandGradient?.type === 'linear' ? savedLandGradient.angle : 135;
  const isWaterRadial = savedWaterGradient?.type === 'radial';
  const isLandRadial = savedLandGradient?.type === 'radial';

  useEffect(() => {
    // If already cached, use it
    const cached = getCachedPreview(preset.bbox);
    if (cached) {
      setPreview(cached);
      setIsLoading(false);
      return;
    }

    // Load preview in background
    let cancelled = false;
    setIsLoading(true);

    generatePreview(preset.bbox)
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preset.bbox]);

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white hover:border-blue-300 hover:shadow-lg transition-all text-left w-full"
    >
      {/* Preview with fixed aspect ratio */}
      <div
        className="aspect-[4/3] w-full relative overflow-hidden"
        style={{ background: preset.gradient }}
      >
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Actual map preview */}
        {preview && (
          <svg
            viewBox={preview.viewBox}
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              {/* Water gradient */}
              {isWaterRadial ? (
                <radialGradient id={`water-grad-${preset.id}`} cx="50%" cy="50%" r="70%">
                  <stop offset="0%" stopColor={waterColors[0]} />
                  <stop offset="100%" stopColor={waterColors[1]} />
                </radialGradient>
              ) : (
                <linearGradient
                  id={`water-grad-${preset.id}`}
                  gradientTransform={`rotate(${waterAngle - 90}, 0.5, 0.5)`}
                >
                  <stop offset="0%" stopColor={waterColors[0]} />
                  <stop offset="100%" stopColor={waterColors[1]} />
                </linearGradient>
              )}
              {/* Land gradient */}
              {isLandRadial ? (
                <radialGradient id={`land-grad-${preset.id}`} cx="50%" cy="50%" r="70%">
                  <stop offset="0%" stopColor={landColors[0]} />
                  <stop offset="100%" stopColor={landColors[1]} />
                </radialGradient>
              ) : (
                <linearGradient
                  id={`land-grad-${preset.id}`}
                  gradientTransform={`rotate(${landAngle - 90}, 0.5, 0.5)`}
                >
                  <stop offset="0%" stopColor={landColors[0]} />
                  <stop offset="100%" stopColor={landColors[1]} />
                </linearGradient>
              )}
            </defs>

            {/* Water background fills entire view */}
            <rect
              x="0"
              y="0"
              width={preview.width}
              height={preview.height}
              fill={`url(#water-grad-${preset.id})`}
            />

            {/* Land on top of water */}
            {preview.landPath && (
              <path
                d={preview.landPath}
                fill={`url(#land-grad-${preset.id})`}
                fillRule="evenodd"
              />
            )}
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="font-semibold text-neutral-900 group-hover:text-blue-600 transition-colors">
          {preset.name}
        </h3>
        <p className="text-sm text-neutral-500 mt-0.5">{preset.subtitle}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mt-2">
          {preset.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-neutral-100 text-neutral-600 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Custom preset indicator */}
      {preset.isCustom && (
        <div className="absolute top-2 left-2 px-2 py-0.5 text-xs bg-white/90 text-neutral-600 rounded-full shadow-sm">
          Saved
        </div>
      )}
    </button>
  );
}
