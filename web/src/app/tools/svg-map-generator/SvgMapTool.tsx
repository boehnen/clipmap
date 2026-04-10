'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { BBox, LayerName } from '@/types';
import { exportServerless, createExportZip, downloadBlob } from '@/lib/export/serverlessExport';
import { getBboxDimensions } from '@/lib/utils/geo';
import { cn } from '@/lib/utils/cn';
import { LayerStyle, OutputMode } from '@/types/makerPresets';

const MapContainer = dynamic(
  () => import('@/components/map/MapContainer').then(mod => mod.MapContainer),
  { ssr: false, loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse" /> }
);

type ExportState = 'idle' | 'exporting' | 'complete' | 'error';

const AVAILABLE_LAYERS: { name: LayerName; label: string; type: 'fill' | 'stroke'; comingSoon?: boolean }[] = [
  { name: 'land', label: 'Land', type: 'fill' },
  { name: 'water', label: 'Water', type: 'fill' },
  { name: 'roads', label: 'Roads', type: 'stroke', comingSoon: true },
  { name: 'boundaries', label: 'Boundaries', type: 'stroke', comingSoon: true },
];

const DEFAULT_STYLES: Record<LayerName, LayerStyle> = {
  land: { visible: true, stroke: 'none', fill: '#f5f5f5', strokeWidth: 1, opacity: 1 },
  water: { visible: true, stroke: 'none', fill: '#b3d9ff', strokeWidth: 1, opacity: 1 },
  parks: { visible: false, stroke: 'none', fill: '#c8e6c9', strokeWidth: 1, opacity: 1 },
  roads: { visible: false, stroke: '#333333', fill: 'none', strokeWidth: 1, opacity: 1 },
  railways: { visible: false, stroke: '#666666', fill: 'none', strokeWidth: 1, opacity: 1 },
  ferries: { visible: false, stroke: '#0066cc', fill: 'none', strokeWidth: 1, opacity: 0.6 },
  buildings: { visible: false, stroke: '#888888', fill: '#e8e8e8', strokeWidth: 1, opacity: 1 },
  places: { visible: false, stroke: '#333333', fill: 'none', strokeWidth: 1, opacity: 1 },
  boundaries: { visible: false, stroke: '#9c27b0', fill: 'none', strokeWidth: 1, opacity: 1 },
  transit: { visible: false, stroke: '#ff9800', fill: 'none', strokeWidth: 1, opacity: 1 },
  contours: { visible: false, stroke: '#8b4513', fill: 'none', strokeWidth: 0.5, opacity: 0.7 },
  elevation: { visible: false, stroke: 'none', fill: '#d2b48c', strokeWidth: 1, opacity: 0.8 },
};

export function SvgMapTool() {
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [layerStyles, setLayerStyles] = useState<Record<LayerName, LayerStyle>>(DEFAULT_STYLES);
  const [showPreview, setShowPreview] = useState(true);
  const outputMode: OutputMode = 'combined';

  const dimensions = bbox ? getBboxDimensions(bbox) : null;

  const toggleLayer = useCallback((name: LayerName) => {
    setLayerStyles(prev => ({
      ...prev,
      [name]: { ...prev[name], visible: !prev[name].visible },
    }));
  }, []);

  const updateFill = useCallback((name: LayerName, fill: string) => {
    setLayerStyles(prev => ({
      ...prev,
      [name]: { ...prev[name], fill },
    }));
  }, []);

  const updateStroke = useCallback((name: LayerName, stroke: string) => {
    setLayerStyles(prev => ({
      ...prev,
      [name]: { ...prev[name], stroke },
    }));
  }, []);

  const handleExport = useCallback(async () => {
    if (!bbox) return;

    setExportState('exporting');
    setError(null);

    try {
      const selectedLayers = (Object.keys(layerStyles) as LayerName[])
        .filter(name => layerStyles[name].visible);

      const layers = await exportServerless(
        { bbox, layers: selectedLayers, styles: layerStyles, outputMode },
        {
          onError: (errorMsg, layer) => {
            setError(`${layer || 'Export'}: ${errorMsg}`);
          },
        }
      );

      if (layers.length > 0) {
        const zip = await createExportZip(layers);
        const timestamp = new Date().toISOString().slice(0, 10);
        downloadBlob(zip, `clipmap-${timestamp}.zip`);
      }

      setExportState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }, [bbox, layerStyles, outputMode]);

  const selectedLayerCount = Object.values(layerStyles).filter(s => s.visible).length;
  const canExport = bbox && selectedLayerCount > 0;

  return (
    <div className="flex h-full">
      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          onBoundsChange={setBbox}
          className="absolute inset-0"
          showPreview={showPreview}
          layerStyles={layerStyles}
          outputMode={outputMode}
        />
      </div>

      {/* Minimal Sidebar */}
      <div className="w-64 bg-white border-l border-neutral-200 flex flex-col">
        <div className="p-4 border-b border-neutral-100">
          <h1 className="text-lg font-semibold text-neutral-900">ClipMap</h1>
          {dimensions && (
            <p className="text-sm text-neutral-500 mt-1">
              {dimensions.widthKm < 1
                ? `${Math.round(dimensions.widthKm * 1000)}m`
                : `${dimensions.widthKm.toFixed(1)}km`}
              {' × '}
              {dimensions.heightKm < 1
                ? `${Math.round(dimensions.heightKm * 1000)}m`
                : `${dimensions.heightKm.toFixed(1)}km`}
            </p>
          )}
        </div>

        {/* Layers */}
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-neutral-400 uppercase">Layers</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-neutral-500">Preview</span>
              <input
                type="checkbox"
                checked={showPreview}
                onChange={() => setShowPreview(p => !p)}
                className="w-4 h-4 rounded border-neutral-300 text-green-600 focus:ring-green-500"
              />
            </label>
          </div>
          <div className="space-y-3">
            {AVAILABLE_LAYERS.map(layer => (
              <div key={layer.name} className={cn("flex items-center gap-3", layer.comingSoon && "opacity-50")}>
                <input
                  type="checkbox"
                  checked={layerStyles[layer.name].visible}
                  onChange={() => toggleLayer(layer.name)}
                  disabled={layer.comingSoon}
                  className="w-4 h-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-neutral-700 flex-1">
                  {layer.label}
                  {layer.comingSoon && <span className="text-xs text-neutral-400 ml-1">(Coming Soon)</span>}
                </span>
                {!layer.comingSoon && (
                  layer.type === 'fill' ? (
                    <input
                      type="color"
                      value={layerStyles[layer.name].fill === 'none' ? '#ffffff' : layerStyles[layer.name].fill}
                      onChange={(e) => updateFill(layer.name, e.target.value)}
                      className="w-8 h-6 rounded border border-neutral-300 cursor-pointer"
                    />
                  ) : (
                    <input
                      type="color"
                      value={layerStyles[layer.name].stroke === 'none' ? '#000000' : layerStyles[layer.name].stroke}
                      onChange={(e) => updateStroke(layer.name, e.target.value)}
                      className="w-8 h-6 rounded border border-neutral-300 cursor-pointer"
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Export Button */}
        <div className="p-4 border-t border-neutral-200">
          <button
            onClick={handleExport}
            disabled={!canExport || exportState === 'exporting'}
            className={cn(
              'w-full py-3 rounded-lg font-medium transition-all',
              exportState === 'exporting' || !canExport
                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {exportState === 'exporting' ? 'Exporting...' : 'Export SVG'}
          </button>
          {!bbox && (
            <p className="text-xs text-neutral-400 text-center mt-2">
              Select area on map
            </p>
          )}
        </div>
      </div>

    </div>
  );
}
