'use client';

import { useState } from 'react';
import { LayerName } from '@/types';
import { LayerStyle } from '@/types/makerPresets';
import { cn } from '@/lib/utils/cn';
import { LAYERS } from '@/data/layers';

interface LayerStyleRowProps {
  layerName: LayerName;
  style: LayerStyle;
  onChange: (style: Partial<LayerStyle>) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function LayerStyleRow({
  layerName,
  style,
  onChange,
  expanded = false,
  onToggleExpand,
}: LayerStyleRowProps) {
  const layerInfo = LAYERS.find(l => l.name === layerName);
  const label = layerInfo?.label || layerName;

  return (
    <div className="rounded-lg border border-neutral-200 overflow-hidden">
      {/* Header row */}
      <div
        className={cn(
          'flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors',
          expanded ? 'bg-neutral-50' : 'hover:bg-neutral-50'
        )}
        onClick={onToggleExpand}
      >
        {/* Visibility toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange({ visible: !style.visible });
          }}
          className={cn(
            'w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors',
            style.visible ? 'bg-blue-500 border-blue-500' : 'border-neutral-300'
          )}
        >
          {style.visible && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Color preview */}
        <div
          className="w-5 h-5 rounded border flex-shrink-0"
          style={{
            backgroundColor: style.fill !== 'none' ? style.fill : 'transparent',
            borderColor: style.stroke !== 'none' ? style.stroke : '#d1d5db',
            borderWidth: style.stroke !== 'none' ? '2px' : '1px',
          }}
        />

        {/* Label */}
        <span className={cn(
          'flex-1 text-sm truncate',
          style.visible ? 'text-neutral-800' : 'text-neutral-400'
        )}>
          {label}
        </span>

        {/* Expand arrow */}
        <svg
          className={cn(
            'w-4 h-4 text-neutral-400 transition-transform',
            expanded && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded controls */}
      {expanded && (
        <div className="px-3 py-2.5 bg-white border-t border-neutral-100 space-y-3">
          {/* Stroke color */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-14">Stroke</span>
            <input
              type="color"
              value={style.stroke === 'none' ? '#000000' : style.stroke}
              onChange={(e) => onChange({ stroke: e.target.value })}
              className="w-7 h-6 rounded cursor-pointer border border-neutral-200"
              disabled={style.stroke === 'none'}
            />
            <button
              onClick={() => onChange({ stroke: style.stroke === 'none' ? '#000000' : 'none' })}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                style.stroke === 'none'
                  ? 'bg-neutral-200 text-neutral-600'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              )}
            >
              {style.stroke === 'none' ? 'Off' : 'None'}
            </button>
          </div>

          {/* Fill color */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-14">Fill</span>
            <input
              type="color"
              value={style.fill === 'none' ? '#ffffff' : style.fill}
              onChange={(e) => onChange({ fill: e.target.value })}
              className="w-7 h-6 rounded cursor-pointer border border-neutral-200"
              disabled={style.fill === 'none'}
            />
            <button
              onClick={() => onChange({ fill: style.fill === 'none' ? '#ffffff' : 'none' })}
              className={cn(
                'text-xs px-2 py-1 rounded transition-colors',
                style.fill === 'none'
                  ? 'bg-neutral-200 text-neutral-600'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
              )}
            >
              {style.fill === 'none' ? 'Off' : 'None'}
            </button>
          </div>

          {/* Stroke width */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-14">Width</span>
            <input
              type="range"
              min="0.25"
              max="3"
              step="0.25"
              value={style.strokeWidth}
              onChange={(e) => onChange({ strokeWidth: parseFloat(e.target.value) })}
              className="flex-1 h-1.5 accent-blue-500"
            />
            <span className="text-xs text-neutral-500 w-8 text-right">
              {style.strokeWidth.toFixed(2)}x
            </span>
          </div>

          {/* Opacity */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-14">Opacity</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={style.opacity}
              onChange={(e) => onChange({ opacity: parseFloat(e.target.value) })}
              className="flex-1 h-1.5 accent-blue-500"
            />
            <span className="text-xs text-neutral-500 w-8 text-right">
              {Math.round(style.opacity * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
