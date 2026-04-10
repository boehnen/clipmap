'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { BBox, LayerName } from '@/types';
import { LAYERS } from '@/data/layers';
import { LayerPreviewModal } from '@/components/ui/LayerPreviewModal';
import { LayerData } from '@/lib/api/client';
import { exportServerless } from '@/lib/export/serverlessExport';
import { getBboxDimensions, getDetailLevel } from '@/lib/utils/geo';
import { cn } from '@/lib/utils/cn';

// Maker preset types and data
import { MakerCategory, MakerPreset, LayerStyle, OutputMode } from '@/types/makerPresets';
import { MAKER_PRESETS, getPresetsForCategory } from '@/data/makerPresets';
import { MakerCategoryTabs, PresetGrid, LayerStyleRow, OutputModeSelector } from '@/components/export';

const MapContainer = dynamic(
  () => import('@/components/map/MapContainer').then(mod => mod.MapContainer),
  { ssr: false, loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse" /> }
);

type ExportState = 'idle' | 'exporting' | 'complete' | 'error';

// Default layer styles
const DEFAULT_LAYER_STYLES: Record<LayerName, LayerStyle> = {
  land: { visible: true, stroke: 'none', fill: '#f5f5f5', strokeWidth: 1, opacity: 1 },
  water: { visible: true, stroke: 'none', fill: '#b3d9ff', strokeWidth: 1, opacity: 1 },
  parks: { visible: true, stroke: 'none', fill: '#c8e6c9', strokeWidth: 1, opacity: 1 },
  roads: { visible: true, stroke: '#404040', fill: 'none', strokeWidth: 1, opacity: 1 },
  railways: { visible: true, stroke: '#666666', fill: 'none', strokeWidth: 1, opacity: 1 },
  ferries: { visible: false, stroke: '#0066cc', fill: 'none', strokeWidth: 1, opacity: 0.6, dashArray: '4,4' },
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

  // Maker preset state
  const [selectedCategory, setSelectedCategory] = useState<MakerCategory>('laser-cutting');
  const [selectedPreset, setSelectedPreset] = useState<MakerPreset | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>('stroke-only');
  const [layerStyles, setLayerStyles] = useState<Record<LayerName, LayerStyle>>(DEFAULT_LAYER_STYLES);
  const [expandedLayer, setExpandedLayer] = useState<LayerName | null>(null);
  const [isCustomized, setIsCustomized] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [previewLayers, setPreviewLayers] = useState<LayerData[]>([]);
  const [currentLayer, setCurrentLayer] = useState<string | undefined>();
  const [currentStatus, setCurrentStatus] = useState<string | undefined>();
  const [queuePosition, setQueuePosition] = useState<number | undefined>();

  // Live preview toggle (canvas overlay on map)
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(true);

  const dimensions = bbox ? getBboxDimensions(bbox) : null;
  const detailLevel = bbox ? getDetailLevel(bbox) : null;

  // Get presets for selected category
  const categoryPresets = useMemo(() => getPresetsForCategory(selectedCategory), [selectedCategory]);

  // Select first preset when category changes
  useEffect(() => {
    if (categoryPresets.length > 0 && !selectedPreset) {
      applyPreset(categoryPresets[0]);
    }
  }, [categoryPresets]);

  // Apply a preset
  const applyPreset = useCallback((preset: MakerPreset) => {
    setSelectedPreset(preset);
    setOutputMode(preset.outputMode);
    setIsCustomized(false);

    // Apply preset layer styles
    const newStyles = { ...DEFAULT_LAYER_STYLES };

    // First, set all layers to not visible
    for (const key of Object.keys(newStyles) as LayerName[]) {
      newStyles[key] = { ...newStyles[key], visible: false };
    }

    // Then apply preset layer settings
    for (const layerName of preset.layers) {
      const presetStyle = preset.layerStyles[layerName];
      newStyles[layerName] = {
        ...DEFAULT_LAYER_STYLES[layerName],
        visible: true,
        ...presetStyle,
      };
    }

    setLayerStyles(newStyles);
  }, []);

  // Handle category change
  const handleCategoryChange = useCallback((category: MakerCategory) => {
    setSelectedCategory(category);
    const presets = getPresetsForCategory(category);
    if (presets.length > 0) {
      applyPreset(presets[0]);
    }
  }, [applyPreset]);

  // Update single layer style
  const updateLayerStyle = useCallback((layerName: LayerName, updates: Partial<LayerStyle>) => {
    setLayerStyles(prev => ({
      ...prev,
      [layerName]: { ...prev[layerName], ...updates },
    }));
    setIsCustomized(true);
  }, []);

  // Reset to current preset
  const resetToPreset = useCallback(() => {
    if (selectedPreset) {
      applyPreset(selectedPreset);
    }
  }, [selectedPreset, applyPreset]);

  // Export handler - serverless (no backend required)
  const handleExport = useCallback(async () => {
    if (!bbox) return;

    setShowPreview(true);
    setExportState('exporting');
    setError(null);
    setPreviewLayers([]);
    setCurrentLayer(undefined);
    setCurrentStatus(undefined);
    setQueuePosition(undefined);

    try {
      const selectedLayers = (Object.keys(layerStyles) as LayerName[])
        .filter(name => layerStyles[name].visible);

      // Use serverless export (no backend required)
      const exportedLayers = await exportServerless(
        {
          bbox,
          layers: selectedLayers,
          styles: layerStyles,
          outputMode,
        },
        {
          onProgress: (layer, status) => {
            setCurrentLayer(layer);
            setCurrentStatus(status);
          },
          onLayer: (layerName, svg) => {
            // Convert to LayerData format for preview
            const layerData: LayerData = {
              name: layerName,
              svg,
              width: 800,
              height: 800,
            };
            setPreviewLayers(prev => [...prev, layerData]);
            setCurrentLayer(undefined);
            setCurrentStatus(undefined);
          },
          onComplete: () => setExportState('complete'),
          onError: (errorMsg, layer) => {
            setError(`${layer || 'Export'}: ${errorMsg}`);
            setExportState('error');
          },
        }
      );

      // If no layers were exported, set error
      if (exportedLayers.length === 0) {
        setError('No layers were exported. Try selecting different layers.');
        setExportState('error');
      } else {
        setExportState('complete');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }, [bbox, layerStyles, outputMode]);

  const handleClosePreview = useCallback(() => {
    setShowPreview(false);
    setExportState('idle');
    setPreviewLayers([]);
    setError(null);
  }, []);

  const selectedLayerCount = Object.values(layerStyles).filter(s => s.visible).length;
  const canExport = bbox && selectedLayerCount > 0;

  // Visible layers for the layer list
  const visibleLayerNames = useMemo(() => {
    return LAYERS.map(l => l.name).filter(name => layerStyles[name]?.visible);
  }, [layerStyles]);

  return (
    <div className="flex-1 flex h-full">
      {/* Map */}
      <div className="flex-1 relative min-h-0">
        <MapContainer
          onBoundsChange={setBbox}
          className="absolute inset-0"
          showPreview={livePreviewEnabled}
          layerStyles={layerStyles}
          outputMode={outputMode}
        />
      </div>

      {/* Sidebar */}
      <div className="w-80 bg-white border-l border-neutral-200 flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-neutral-100">
          <h1 className="text-base font-semibold text-neutral-900">Export SVG</h1>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Selection Info */}
          {dimensions ? (
            <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">Selection</span>
                <span className="font-medium text-neutral-700">
                  {dimensions.widthKm < 1
                    ? `${Math.round(dimensions.widthKm * 1000)}m`
                    : `${dimensions.widthKm.toFixed(1)}km`}
                  {' × '}
                  {dimensions.heightKm < 1
                    ? `${Math.round(dimensions.heightKm * 1000)}m`
                    : `${dimensions.heightKm.toFixed(1)}km`}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-neutral-400">Detail level</span>
                <span className="text-neutral-500 capitalize">{detailLevel}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-neutral-200">
                <span className="text-neutral-400">Live Preview</span>
                <button
                  onClick={() => setLivePreviewEnabled(!livePreviewEnabled)}
                  className={cn(
                    'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                    livePreviewEnabled
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-neutral-100 text-neutral-500'
                  )}
                >
                  {livePreviewEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-4 border-b border-neutral-100 bg-neutral-50">
              <p className="text-sm text-neutral-500 text-center">
                Draw a rectangle on the map to select an area
              </p>
            </div>
          )}

          {/* Maker Category Tabs */}
          <div className="px-4 py-3 border-b border-neutral-100">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
              Maker Type
            </div>
            <MakerCategoryTabs
              selected={selectedCategory}
              onChange={handleCategoryChange}
            />
          </div>

          {/* Preset Selection */}
          <div className="px-4 py-3 border-b border-neutral-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Preset
              </span>
              {isCustomized && selectedPreset && (
                <button
                  onClick={resetToPreset}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Reset
                </button>
              )}
            </div>
            <PresetGrid
              presets={categoryPresets}
              selectedId={selectedPreset?.id || null}
              onSelect={applyPreset}
            />
            {selectedPreset?.notes && (
              <p className="text-xs text-neutral-500 mt-2 italic">
                {selectedPreset.notes}
              </p>
            )}
          </div>

          {/* Output Mode */}
          <div className="px-4 py-3 border-b border-neutral-100">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
              Output Mode
            </div>
            <OutputModeSelector
              value={outputMode}
              onChange={(mode) => {
                setOutputMode(mode);
                setIsCustomized(true);
              }}
            />
          </div>

          {/* Layer Styles */}
          <div className="px-4 py-3">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">
              Layers ({selectedLayerCount})
            </div>
            <div className="space-y-1.5">
              {LAYERS.map(layerInfo => {
                const style = layerStyles[layerInfo.name];
                if (!style) return null;

                return (
                  <LayerStyleRow
                    key={layerInfo.name}
                    layerName={layerInfo.name}
                    style={style}
                    onChange={(updates) => updateLayerStyle(layerInfo.name, updates)}
                    expanded={expandedLayer === layerInfo.name}
                    onToggleExpand={() =>
                      setExpandedLayer(expandedLayer === layerInfo.name ? null : layerInfo.name)
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Material Recommendations */}
          {selectedPreset?.materialRecommendations && selectedPreset.materialRecommendations.length > 0 && (
            <div className="px-4 py-3 border-t border-neutral-100 bg-neutral-50">
              <div className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-1.5">
                Recommended Materials
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedPreset.materialRecommendations.map(material => (
                  <span
                    key={material}
                    className="px-2 py-0.5 text-xs bg-white border border-neutral-200 rounded text-neutral-600"
                  >
                    {material}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && !showPreview && (
            <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Export Button */}
        <div className="p-4 border-t border-neutral-200 bg-white">
          <button
            onClick={handleExport}
            disabled={!canExport || exportState === 'exporting'}
            className={cn(
              'w-full py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2',
              exportState === 'exporting' || !canExport
                ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
            )}
          >
            {exportState === 'exporting' ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Export {selectedLayerCount} {selectedLayerCount === 1 ? 'Layer' : 'Layers'}
              </>
            )}
          </button>
          {!bbox && (
            <p className="text-xs text-neutral-400 text-center mt-2">
              Select an area on the map first
            </p>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      <LayerPreviewModal
        isOpen={showPreview}
        onClose={handleClosePreview}
        layers={previewLayers}
        isLoading={exportState === 'exporting'}
        currentLayer={currentLayer}
        currentStatus={currentStatus}
        queuePosition={queuePosition}
        error={error || undefined}
        layerStyles={layerStyles}
        outputMode={outputMode}
      />
    </div>
  );
}
