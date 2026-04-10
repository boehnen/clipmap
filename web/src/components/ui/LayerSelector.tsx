'use client';

import { useState } from 'react';
import { LayerConfig, LayerName } from '@/types';
import { LAYERS } from '@/data/layers';
import { cn } from '@/lib/utils/cn';

interface LayerSelectorProps {
  layers: LayerConfig[];
  onChange: (layers: LayerConfig[]) => void;
  disabled?: boolean;
}

export function LayerSelector({ layers, onChange, disabled }: LayerSelectorProps) {
  const [expandedLayer, setExpandedLayer] = useState<LayerName | null>(null);

  const toggleLayer = (name: LayerName) => {
    onChange(
      layers.map(layer =>
        layer.name === name ? { ...layer, visible: !layer.visible } : layer
      )
    );
  };

  const updateStrokeWidth = (name: LayerName, strokeWidth: number) => {
    onChange(
      layers.map(layer =>
        layer.name === name ? { ...layer, strokeWidth } : layer
      )
    );
  };

  const toggleExpanded = (name: LayerName) => {
    setExpandedLayer(expandedLayer === name ? null : name);
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-neutral-700">Layers</label>
      <div className="space-y-1.5">
        {LAYERS.map(layerInfo => {
          const layer = layers.find(l => l.name === layerInfo.name);
          const isVisible = layer?.visible ?? layerInfo.defaultVisible;
          const strokeWidth = layer?.strokeWidth ?? layerInfo.defaultStrokeWidth;
          const isExpanded = expandedLayer === layerInfo.name && isVisible;

          return (
            <div key={layerInfo.name} className="space-y-1">
              <div className="flex items-center gap-1.5">
                {/* Toggle button */}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleLayer(layerInfo.name)}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-lg border transition-colors text-left',
                    isVisible
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {layerInfo.label}
                </button>

                {/* Stroke width expand button */}
                {isVisible && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleExpanded(layerInfo.name)}
                    className={cn(
                      'px-2 py-2 text-xs rounded-lg border transition-colors',
                      isExpanded
                        ? 'bg-brand-50 border-brand-200 text-brand-600'
                        : 'bg-white border-neutral-200 text-neutral-500 hover:border-neutral-300',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    title="Stroke width"
                  >
                    {strokeWidth.toFixed(1)}mm
                  </button>
                )}
              </div>

              {/* Stroke width slider */}
              {isExpanded && (
                <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50 rounded-lg">
                  <span className="text-xs text-neutral-500 w-12">Stroke</span>
                  <input
                    type="range"
                    min="0.05"
                    max="2"
                    step="0.05"
                    value={strokeWidth}
                    onChange={(e) => updateStrokeWidth(layerInfo.name, parseFloat(e.target.value))}
                    disabled={disabled}
                    className="flex-1 h-1.5 bg-neutral-200 rounded-full appearance-none cursor-pointer accent-brand-500"
                  />
                  <input
                    type="number"
                    min="0.05"
                    max="2"
                    step="0.05"
                    value={strokeWidth}
                    onChange={(e) => updateStrokeWidth(layerInfo.name, parseFloat(e.target.value) || 0.1)}
                    disabled={disabled}
                    className="w-14 px-1.5 py-0.5 text-xs border border-neutral-200 rounded text-center"
                  />
                  <span className="text-xs text-neutral-500">mm</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
