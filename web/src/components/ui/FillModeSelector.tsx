'use client';

import { useState, useRef, useEffect } from 'react';
import { GradientFill, LinearGradient, RadialGradient } from '@/types/makerPresets';
import { cn } from '@/lib/utils/cn';

type FillMode = 'solid' | 'linear' | 'radial';

interface FillModeSelectorProps {
  fill: string;
  fillGradient?: GradientFill;
  onFillChange: (fill: string) => void;
  onGradientChange: (gradient: GradientFill | undefined) => void;
  defaultGradientType?: 'linear' | 'radial'; // Which gradient type to default to when switching from solid
}

// Default gradients for each mode
const DEFAULT_LINEAR: LinearGradient = {
  type: 'linear',
  angle: 180,
  stops: [
    { offset: 0, color: '#3b82f6' },
    { offset: 100, color: '#1e3a8a' },
  ],
};

const DEFAULT_RADIAL: RadialGradient = {
  type: 'radial',
  cx: 50,
  cy: 50,
  stops: [
    { offset: 0, color: '#3b82f6' },
    { offset: 100, color: '#1e3a8a' },
  ],
};

// Preset gradient swatches
const GRADIENT_PRESETS: Array<{ name: string; colors: [string, string] }> = [
  { name: 'Ocean', colors: ['#0ea5e9', '#1e3a5f'] },
  { name: 'Forest', colors: ['#4ade80', '#14532d'] },
  { name: 'Sand', colors: ['#fcd34d', '#92400e'] },
  { name: 'Sunset', colors: ['#fb923c', '#7c2d12'] },
  { name: 'Berry', colors: ['#c084fc', '#581c87'] },
  { name: 'Steel', colors: ['#94a3b8', '#334155'] },
  { name: 'Mint', colors: ['#6ee7b7', '#065f46'] },
  { name: 'Rose', colors: ['#fda4af', '#881337'] },
  { name: 'Sky', colors: ['#7dd3fc', '#0c4a6e'] },
  { name: 'Earth', colors: ['#a3a3a3', '#404040'] },
];

export function FillModeSelector({
  fill,
  fillGradient,
  onFillChange,
  onGradientChange,
  defaultGradientType = 'linear',
}: FillModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentMode: FillMode = fillGradient
    ? fillGradient.type === 'linear'
      ? 'linear'
      : 'radial'
    : 'solid';

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const handleModeChange = (mode: FillMode) => {
    if (mode === 'solid') {
      onGradientChange(undefined);
    } else if (mode === 'linear') {
      const gradient: LinearGradient = fillGradient?.type === 'linear'
        ? fillGradient
        : { ...DEFAULT_LINEAR, stops: [{ offset: 0, color: fill }, { offset: 100, color: darkenColor(fill) }] };
      onGradientChange(gradient);
    } else {
      const gradient: RadialGradient = fillGradient?.type === 'radial'
        ? fillGradient
        : { ...DEFAULT_RADIAL, stops: [{ offset: 0, color: fill }, { offset: 100, color: darkenColor(fill) }] };
      onGradientChange(gradient);
    }
  };

  const handleColorChange = (stopIndex: number, color: string) => {
    if (!fillGradient) return;

    const newStops = [...fillGradient.stops];
    newStops[stopIndex] = { ...newStops[stopIndex], color };

    if (fillGradient.type === 'linear') {
      onGradientChange({ ...fillGradient, stops: newStops });
    } else {
      onGradientChange({ ...fillGradient, stops: newStops });
    }
  };

  const handlePresetClick = (colors: [string, string]) => {
    if (!fillGradient) return;

    const newStops = [
      { offset: 0, color: colors[0] },
      { offset: 100, color: colors[1] },
    ];

    if (fillGradient.type === 'linear') {
      onGradientChange({ ...fillGradient, stops: newStops });
    } else {
      onGradientChange({ ...fillGradient, stops: newStops });
    }
  };

  // Get preview style
  const getPreviewStyle = (): React.CSSProperties => {
    if (!fillGradient) {
      return { backgroundColor: fill };
    }

    if (fillGradient.type === 'linear') {
      const stops = fillGradient.stops.map(s => `${s.color} ${s.offset}%`).join(', ');
      return { background: `linear-gradient(${fillGradient.angle}deg, ${stops})` };
    } else {
      const stops = fillGradient.stops.map(s => `${s.color} ${s.offset}%`).join(', ');
      const cx = fillGradient.cx ?? 50;
      const cy = fillGradient.cy ?? 50;
      return { background: `radial-gradient(circle at ${cx}% ${cy}%, ${stops})` };
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Preview button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-6 rounded border border-neutral-300 cursor-pointer overflow-hidden"
        style={getPreviewStyle()}
        title={`Fill: ${currentMode}`}
      />

      {/* Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-xl border border-neutral-200 z-50 p-3">
          {/* Mode tabs */}
          <div className="flex gap-1 mb-3">
            {(['solid', 'linear', 'radial'] as FillMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={cn(
                  'flex-1 py-1.5 text-xs rounded transition-colors',
                  currentMode === mode
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-neutral-600 hover:bg-neutral-100'
                )}
              >
                {mode === 'solid' ? 'Solid' : mode === 'linear' ? 'Linear' : 'Radial'}
              </button>
            ))}
          </div>

          {/* Color inputs */}
          {currentMode === 'solid' ? (
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Color</label>
              <input
                type="color"
                value={fill}
                onChange={(e) => onFillChange(e.target.value)}
                className="w-full h-8 rounded border border-neutral-300 cursor-pointer"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Start Color</label>
                <input
                  type="color"
                  value={fillGradient?.stops[0]?.color || fill}
                  onChange={(e) => handleColorChange(0, e.target.value)}
                  className="w-full h-7 rounded border border-neutral-300 cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">End Color</label>
                <input
                  type="color"
                  value={fillGradient?.stops[1]?.color || darkenColor(fill)}
                  onChange={(e) => handleColorChange(1, e.target.value)}
                  className="w-full h-7 rounded border border-neutral-300 cursor-pointer"
                />
              </div>

              {/* Angle slider for linear */}
              {currentMode === 'linear' && fillGradient?.type === 'linear' && (
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">
                    Angle: {fillGradient.angle}°
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={fillGradient.angle}
                    onChange={(e) => onGradientChange({ ...fillGradient, angle: parseInt(e.target.value) })}
                    className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              <p className="text-xs text-neutral-400 pt-1">
                Drag handles on map to adjust
              </p>

              {/* Preset swatches */}
              <div className="pt-2 border-t border-neutral-100 mt-2">
                <p className="text-xs text-neutral-500 mb-1.5">Presets</p>
                <div className="grid grid-cols-5 gap-1">
                  {GRADIENT_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetClick(preset.colors)}
                      className="w-full aspect-square rounded border border-neutral-200 hover:border-blue-400 hover:scale-110 transition-all cursor-pointer"
                      style={{
                        background: currentMode === 'radial'
                          ? `radial-gradient(circle, ${preset.colors[0]}, ${preset.colors[1]})`
                          : `linear-gradient(180deg, ${preset.colors[0]}, ${preset.colors[1]})`,
                      }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper to darken a color
function darkenColor(hex: string, amount = 0.3): string {
  // Remove #
  hex = hex.replace('#', '');

  // Parse
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Darken
  const newR = Math.round(r * (1 - amount));
  const newG = Math.round(g * (1 - amount));
  const newB = Math.round(b * (1 - amount));

  // Convert back
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
