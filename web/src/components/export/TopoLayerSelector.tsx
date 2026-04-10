/**
 * Topographic Layer Selector
 *
 * Two input modes:
 * 1. Direct: User selects layer count with slider
 * 2. Material: User enters material thickness + desired height → auto-calculate layers
 *
 * Shows preview of bands and calculates intervals based on actual terrain.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { BBox } from '@/types';
import {
  ElevationBand,
  calculateElevationBands,
} from '@/lib/elevation/elevationBands';
import {
  ElevationRange,
  getElevationRange,
} from '@/lib/elevation/elevationIndex';

type InputMode = 'layers' | 'material';

interface TopoLayerSelectorProps {
  bbox: BBox | null;
  onChange: (bands: ElevationBand[]) => void;
}

// Common material presets (thickness in mm)
const MATERIAL_PRESETS = [
  { label: '1/8" (3mm)', value: 3 },
  { label: '1/4" (6mm)', value: 6 },
  { label: '1/2" (12mm)', value: 12 },
  { label: 'Cardboard (1.5mm)', value: 1.5 },
  { label: 'Custom', value: 0 },
];

export function TopoLayerSelector({
  bbox,
  onChange,
}: TopoLayerSelectorProps) {
  const [elevationRange, setElevationRange] = useState<ElevationRange | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roundTo, setRoundTo] = useState(50);

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('material');

  // Direct mode: layer count
  const [layerCount, setLayerCount] = useState(8);

  // Material mode: thickness + desired height
  const [selectedPreset, setSelectedPreset] = useState(0); // index into MATERIAL_PRESETS
  const [materialThickness, setMaterialThickness] = useState(3); // mm
  const [customThickness, setCustomThickness] = useState('3');
  const [desiredHeight, setDesiredHeight] = useState(50); // mm (5cm default)

  // Calculate layer count from material settings
  const calculatedLayers = useMemo(() => {
    if (materialThickness <= 0 || desiredHeight <= 0) return 8;
    const layers = Math.round(desiredHeight / materialThickness);
    return Math.max(3, Math.min(30, layers));
  }, [materialThickness, desiredHeight]);

  // Sync calculated layers to layerCount when in material mode
  useEffect(() => {
    if (inputMode === 'material') {
      setLayerCount(calculatedLayers);
    }
  }, [inputMode, calculatedLayers]);

  // Handle material preset selection
  const handlePresetChange = (index: number) => {
    setSelectedPreset(index);
    const preset = MATERIAL_PRESETS[index];
    if (preset.value > 0) {
      setMaterialThickness(preset.value);
      setCustomThickness(preset.value.toString());
    }
  };

  // Handle custom thickness input
  const handleCustomThicknessChange = (value: string) => {
    setCustomThickness(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      setMaterialThickness(parsed);
    }
  };

  // Fetch elevation range when bbox changes
  useEffect(() => {
    if (!bbox) {
      setElevationRange(null);
      return;
    }

    const fetchElevation = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const range = await getElevationRange(bbox);
        setElevationRange(range);
      } catch (err) {
        setError('Could not fetch elevation data');
        // Use fallback range
        setElevationRange({ min: 0, max: 500 });
      } finally {
        setIsLoading(false);
      }
    };

    fetchElevation();
  }, [bbox]);

  // Calculate bands when settings change
  const bands = useMemo(() => {
    if (!elevationRange) return [];

    return calculateElevationBands(elevationRange, {
      layerCount,
      roundTo,
    });
  }, [elevationRange, layerCount, roundTo]);

  // Notify parent of band changes
  useEffect(() => {
    onChange(bands);
  }, [bands, onChange]);

  if (!bbox) {
    return (
      <div className="p-4 bg-neutral-50 rounded-lg text-sm text-neutral-500">
        Select an area on the map to configure topographic layers
      </div>
    );
  }

  const totalRange = elevationRange ? elevationRange.max - elevationRange.min : 0;
  const interval = totalRange > 0 ? Math.round(totalRange / layerCount) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700">
          Topographic Layers
        </span>
        {isLoading && (
          <span className="text-xs text-neutral-400">Loading elevation...</span>
        )}
      </div>

      {/* Elevation Range Info */}
      {elevationRange && (
        <div className="flex items-center justify-between text-xs text-neutral-500 bg-neutral-50 rounded px-3 py-2">
          <span>Elevation: {Math.round(elevationRange.min)}m - {Math.round(elevationRange.max)}m</span>
          <span>Range: {Math.round(totalRange)}m</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-2">
          {error} (using estimate)
        </div>
      )}

      {/* Input Mode Toggle */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg">
        <button
          onClick={() => setInputMode('material')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            inputMode === 'material'
              ? 'bg-white text-neutral-800 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          By Material
        </button>
        <button
          onClick={() => setInputMode('layers')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            inputMode === 'layers'
              ? 'bg-white text-neutral-800 shadow-sm'
              : 'text-neutral-500 hover:text-neutral-700'
          }`}
        >
          By Layer Count
        </button>
      </div>

      {/* Material Mode UI */}
      {inputMode === 'material' && (
        <div className="space-y-3">
          {/* Material Thickness */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">Material Thickness</label>
            <div className="flex gap-2">
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(parseInt(e.target.value))}
                className="flex-1 px-2 py-1.5 border border-neutral-200 rounded text-sm text-neutral-700"
              >
                {MATERIAL_PRESETS.map((preset, i) => (
                  <option key={i} value={i}>{preset.label}</option>
                ))}
              </select>
              {MATERIAL_PRESETS[selectedPreset].value === 0 && (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={customThickness}
                    onChange={(e) => handleCustomThicknessChange(e.target.value)}
                    className="w-16 px-2 py-1.5 border border-neutral-200 rounded text-sm text-neutral-700"
                  />
                  <span className="text-xs text-neutral-400">mm</span>
                </div>
              )}
            </div>
          </div>

          {/* Desired Model Height */}
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">Desired Model Height</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={10}
                max={200}
                step={5}
                value={desiredHeight}
                onChange={(e) => setDesiredHeight(parseInt(e.target.value))}
                className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex items-center gap-1 min-w-[60px]">
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={desiredHeight}
                  onChange={(e) => setDesiredHeight(parseInt(e.target.value) || 50)}
                  className="w-14 px-2 py-1 border border-neutral-200 rounded text-sm text-neutral-700"
                />
                <span className="text-xs text-neutral-400">mm</span>
              </div>
            </div>
            <div className="flex justify-between text-xs text-neutral-400">
              <span>1cm</span>
              <span>20cm</span>
            </div>
          </div>

          {/* Calculated Result */}
          <div className="flex items-center justify-between px-3 py-2 bg-blue-50 rounded text-sm">
            <span className="text-blue-700">Calculated Layers:</span>
            <span className="font-semibold text-blue-800">{calculatedLayers}</span>
          </div>
        </div>
      )}

      {/* Direct Layer Count Mode */}
      {inputMode === 'layers' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-neutral-500">Number of Layers</label>
            <span className="text-sm font-medium text-neutral-700">{layerCount}</span>
          </div>
          <input
            type="range"
            min={3}
            max={30}
            value={layerCount}
            onChange={(e) => setLayerCount(parseInt(e.target.value))}
            className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-neutral-400">
            <span>3 (thick)</span>
            <span>30 (detailed)</span>
          </div>
        </div>
      )}

      {/* Interval Info */}
      {interval > 0 && (
        <div className="text-xs text-neutral-500 bg-neutral-50 px-3 py-2 rounded">
          <div>Each layer = ~{interval}m of elevation</div>
          <div className="text-neutral-400 mt-1">
            {materialThickness}mm material = {(interval / materialThickness).toFixed(1)}x vertical exaggeration
          </div>
        </div>
      )}

      {/* Band Preview */}
      {bands.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-neutral-500">Layer Preview (bottom to top)</span>
          <div className="flex h-8 rounded overflow-hidden border border-neutral-200">
            {bands.map((band) => (
              <div
                key={band.index}
                style={{
                  flex: 1,
                  backgroundColor: band.color,
                }}
                title={band.label}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-neutral-400">
            <span>{bands[0]?.label}</span>
            <span>{bands[bands.length - 1]?.label}</span>
          </div>
        </div>
      )}

      {/* Round To Selector */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-neutral-500">Round intervals to:</span>
        <select
          value={roundTo}
          onChange={(e) => setRoundTo(parseInt(e.target.value))}
          className="px-2 py-1 border border-neutral-200 rounded text-neutral-700"
        >
          <option value={10}>10m</option>
          <option value={25}>25m</option>
          <option value={50}>50m</option>
          <option value={100}>100m</option>
        </select>
      </div>
    </div>
  );
}

export default TopoLayerSelector;
