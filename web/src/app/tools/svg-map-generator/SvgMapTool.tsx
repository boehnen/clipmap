'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { BBox, LayerName } from '@/types';
import { exportServerless, createExportZip, downloadBlob, createCombinedSvg, svgToPng } from '@/lib/export/serverlessExport';
import { getBboxDimensions } from '@/lib/utils/geo';
import { cn } from '@/lib/utils/cn';
import { LayerStyle, OutputMode, GradientFill } from '@/types/makerPresets';
import { FlyToTarget, LocationPreset } from '@/types/ui';
import { FillModeSelector } from '@/components/ui/FillModeSelector';
import { AppUIProvider, useAppUI } from '@/contexts/AppUIContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { LocationPresetsModal } from '@/components/ui/LocationPresetsModal';
import { OnboardingTour } from '@/components/ui/OnboardingTour';
import { createCommands } from '@/data/commands';
import { LOCATION_PRESETS } from '@/data/locationPresets';

const MapContainer = dynamic(
  () => import('@/components/map/MapContainer').then(mod => mod.MapContainer),
  { ssr: false, loading: () => <div className="w-full h-full bg-neutral-100 animate-pulse" /> }
);

type ExportState = 'idle' | 'exporting' | 'complete' | 'error';
type ExportFormat = 'svg' | 'png';

const AVAILABLE_LAYERS: { name: LayerName; label: string; type: 'fill' | 'stroke'; comingSoon?: boolean }[] = [
  { name: 'land', label: 'Land', type: 'fill' },
  { name: 'water', label: 'Water', type: 'fill' },
  { name: 'roads', label: 'Roads', type: 'stroke', comingSoon: true },
  { name: 'boundaries', label: 'Boundaries', type: 'stroke', comingSoon: true },
];

const DEFAULT_STYLES: Record<LayerName, LayerStyle> = {
  land: {
    visible: true,
    stroke: 'none',
    fill: '#d3d5cd',
    fillGradient: {
      type: 'linear',
      angle: 135,
      stops: [{ offset: 0, color: '#e8e4df' }, { offset: 100, color: '#b8c4a8' }],
    },
    strokeWidth: 1,
    opacity: 1,
  },
  water: {
    visible: true,
    stroke: 'none',
    fill: '#5f7391',
    fillGradient: {
      type: 'radial',
      cx: 50,
      cy: 50,
      stops: [{ offset: 0, color: '#7dd3fc' }, { offset: 100, color: '#1e3a5f' }],
    },
    strokeWidth: 1,
    opacity: 1,
  },
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

function SvgMapToolInner() {
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('png');
  const [error, setError] = useState<string | null>(null);
  const [layerStyles, setLayerStyles] = useState<Record<LayerName, LayerStyle>>(DEFAULT_STYLES);
  const [showPreview, setShowPreview] = useState(true);
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const outputMode: OutputMode = 'combined';

  // Refs for map controls
  const fitToViewRef = useRef<(() => void) | null>(null);
  const copyBboxRef = useRef<(() => void) | null>(null);

  // UI Context
  const {
    state,
    openCommandPalette,
    closeCommandPalette,
    openPresets,
    closePresets,
    startTour,
    nextTourStep,
    prevTourStep,
    skipTour,
  } = useAppUI();

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

  const updateGradient = useCallback((name: LayerName, gradient: GradientFill | undefined) => {
    setLayerStyles(prev => ({
      ...prev,
      [name]: { ...prev[name], fillGradient: gradient },
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
        const timestamp = new Date().toISOString().slice(0, 10);

        if (exportFormat === 'png') {
          // Create combined SVG and convert to PNG
          const combinedSvg = createCombinedSvg(layers);
          const { width, height } = layers[0];
          const pngBlob = await svgToPng(combinedSvg, width, height, 2);
          downloadBlob(pngBlob, `clipmap-${timestamp}.png`);
        } else {
          // Export as ZIP of SVG files
          const zip = await createExportZip(layers);
          downloadBlob(zip, `clipmap-${timestamp}.zip`);
        }
      }

      setExportState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }, [bbox, layerStyles, outputMode, exportFormat]);

  // Handle going to a preset location
  const goToLocation = useCallback((locationId: string) => {
    const preset = LOCATION_PRESETS.find(p => p.id === locationId);
    if (!preset) return;

    const center: [number, number] = [
      (preset.bbox.minLat + preset.bbox.maxLat) / 2,
      (preset.bbox.minLon + preset.bbox.maxLon) / 2,
    ];

    setFlyToTarget({
      center,
      zoom: preset.zoom,
      bbox: preset.bbox,
    });
  }, []);

  // Handle selecting a preset from modal
  const handleSelectPreset = useCallback((preset: LocationPreset) => {
    const center: [number, number] = [
      (preset.bbox.minLat + preset.bbox.maxLat) / 2,
      (preset.bbox.minLon + preset.bbox.maxLon) / 2,
    ];

    setFlyToTarget({
      center,
      zoom: preset.zoom,
      bbox: preset.bbox,
    });
  }, []);

  // Create commands for the palette
  const commands = useMemo(() => createCommands({
    goToLocation,
    toggleLayer: (layer) => toggleLayer(layer as LayerName),
    fitToView: () => fitToViewRef.current?.(),
    copyBbox: () => copyBboxRef.current?.(),
    exportSvg: handleExport,
    startTour,
    openPresets,
    togglePreview: () => setShowPreview(p => !p),
  }), [goToLocation, toggleLayer, handleExport, startTour, openPresets]);

  // Handle escape - close any open modal
  const handleEscape = useCallback(() => {
    if (state.isCommandPaletteOpen) {
      closeCommandPalette();
    } else if (state.isPresetsOpen) {
      closePresets();
    } else if (state.isTourActive) {
      skipTour();
    }
  }, [state, closeCommandPalette, closePresets, skipTour]);

  // Keyboard shortcuts (disabled when command palette is open)
  useKeyboardShortcuts({
    onCommandPalette: openCommandPalette,
    onEscape: handleEscape,
    onLayerToggle: (layer) => toggleLayer(layer as LayerName),
    onFitToView: () => fitToViewRef.current?.(),
    onCopyBbox: () => copyBboxRef.current?.(),
    onExport: handleExport,
    onStartTour: startTour,
    onPresets: openPresets,
    onTogglePreview: () => setShowPreview(p => !p),
  }, !state.isCommandPaletteOpen && !state.isTourActive);

  const selectedLayerCount = Object.values(layerStyles).filter(s => s.visible).length;
  const canExport = bbox && selectedLayerCount > 0;

  return (
    <div className="flex h-full relative">
      {/* Map */}
      <div className="flex-1 relative" data-tour="map">
        <MapContainer
          onBoundsChange={setBbox}
          className="absolute inset-0"
          showPreview={showPreview}
          layerStyles={layerStyles}
          outputMode={outputMode}
          flyToTarget={flyToTarget}
          onFitToViewRef={fitToViewRef}
          onCopyBboxRef={copyBboxRef}
          onGradientChange={updateGradient}
        />

        {/* Mobile Menu Button */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden absolute top-4 right-4 z-[1000] p-3 bg-white rounded-lg shadow-lg border border-neutral-200"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Mobile Export Button - positioned to avoid zoom controls on right */}
        <div className="md:hidden absolute bottom-4 left-4 right-20 z-[1000] flex gap-2">
          {/* Format toggle */}
          <div className="flex bg-white rounded-lg shadow-lg border border-neutral-200 overflow-hidden">
            <button
              onClick={() => setExportFormat('png')}
              className={cn(
                'px-3 py-3 text-sm font-medium transition-colors',
                exportFormat === 'png'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600'
              )}
            >
              PNG
            </button>
            <button
              onClick={() => setExportFormat('svg')}
              className={cn(
                'px-3 py-3 text-sm font-medium transition-colors',
                exportFormat === 'svg'
                  ? 'bg-blue-600 text-white'
                  : 'text-neutral-600'
              )}
            >
              SVG
            </button>
          </div>
          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={!canExport || exportState === 'exporting'}
            className={cn(
              'flex-1 py-3 rounded-lg font-medium shadow-lg transition-all',
              exportState === 'exporting' || !canExport
                ? 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                : 'bg-blue-600 text-white active:bg-blue-700'
            )}
          >
            {exportState === 'exporting' ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-[1001]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Responsive */}
      <div
        className={cn(
          'bg-white border-l border-neutral-200 flex flex-col transition-transform duration-300',
          // Desktop: always visible
          'hidden md:flex md:w-64 md:relative md:translate-x-0',
          // Mobile: slide-in from right
          'fixed inset-y-0 right-0 w-80 max-w-[85vw] z-[1002]',
          sidebarOpen ? 'flex translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="p-4 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-neutral-900">ClipMap</h1>
            <div className="flex items-center gap-1">
              <button
                onClick={openCommandPalette}
                className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                title="Command Palette (Ctrl+K)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
              {/* Mobile close button */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="md:hidden p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors"
                aria-label="Close menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
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

        {/* Presets Button */}
        <div className="px-4 pt-4">
          <button
            onClick={() => { openPresets(); setSidebarOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Location Presets</span>
            <kbd className="ml-auto px-1.5 py-0.5 text-xs bg-white border rounded hidden sm:inline">P</kbd>
          </button>
        </div>

        {/* Layers */}
        <div className="flex-1 p-4 overflow-y-auto" data-tour="layers">
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
          <div className="space-y-4" data-tour="colors">
            {AVAILABLE_LAYERS.map(layer => (
              <div key={layer.name} className={cn("flex items-center gap-3", layer.comingSoon && "opacity-50")}>
                <input
                  type="checkbox"
                  checked={layerStyles[layer.name].visible}
                  onChange={() => toggleLayer(layer.name)}
                  disabled={layer.comingSoon}
                  className="w-5 h-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-neutral-700 flex-1">
                  {layer.label}
                  {layer.comingSoon && <span className="text-xs text-neutral-400 ml-1">(Coming Soon)</span>}
                </span>
                {!layer.comingSoon && (
                  layer.type === 'fill' ? (
                    <FillModeSelector
                      fill={layerStyles[layer.name].fill === 'none' ? '#ffffff' : layerStyles[layer.name].fill}
                      fillGradient={layerStyles[layer.name].fillGradient}
                      onFillChange={(fill) => updateFill(layer.name, fill)}
                      onGradientChange={(gradient) => updateGradient(layer.name, gradient)}
                      defaultGradientType={layer.name === 'water' ? 'radial' : 'linear'}
                    />
                  ) : (
                    <input
                      type="color"
                      value={layerStyles[layer.name].stroke === 'none' ? '#000000' : layerStyles[layer.name].stroke}
                      onChange={(e) => updateStroke(layer.name, e.target.value)}
                      className="w-8 h-7 rounded border border-neutral-300 cursor-pointer"
                    />
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Help & Shortcuts */}
        <div className="px-4 pb-2 hidden md:block">
          <button
            onClick={startTour}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Take a tour
          </button>
          <span className="text-xs text-neutral-300 mx-2">|</span>
          <button
            onClick={openCommandPalette}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            Shortcuts
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Export Button - Desktop only (mobile has floating button) */}
        <div className="p-4 border-t border-neutral-200 hidden md:block" data-tour="export">
          {/* Format selector */}
          <div className="flex gap-1 mb-3 p-1 bg-neutral-100 rounded-lg">
            <button
              onClick={() => setExportFormat('png')}
              className={cn(
                'flex-1 py-1.5 text-sm rounded-md transition-colors',
                exportFormat === 'png'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              PNG
            </button>
            <button
              onClick={() => setExportFormat('svg')}
              className={cn(
                'flex-1 py-1.5 text-sm rounded-md transition-colors',
                exportFormat === 'svg'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              )}
            >
              SVG
            </button>
          </div>
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
            {exportState === 'exporting' ? 'Exporting...' : `Export ${exportFormat.toUpperCase()}`}
          </button>
          {!bbox && (
            <p className="text-xs text-neutral-400 text-center mt-2">
              Select area on map
            </p>
          )}
          {exportFormat === 'svg' && (
            <p className="text-xs text-neutral-400 text-center mt-2">
              Downloads as ZIP with separate layer files
            </p>
          )}
        </div>

        {/* Mobile-only help section */}
        <div className="md:hidden p-4 border-t border-neutral-200">
          <div className="flex gap-2">
            <button
              onClick={() => { startTour(); setSidebarOpen(false); }}
              className="flex-1 py-2.5 px-3 text-sm text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors"
            >
              Tour
            </button>
            <button
              onClick={() => { openCommandPalette(); setSidebarOpen(false); }}
              className="flex-1 py-2.5 px-3 text-sm text-neutral-600 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors"
            >
              Commands
            </button>
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={state.isCommandPaletteOpen}
        onClose={closeCommandPalette}
        commands={commands}
      />

      {/* Location Presets Modal */}
      <LocationPresetsModal
        isOpen={state.isPresetsOpen}
        onClose={closePresets}
        onSelectPreset={handleSelectPreset}
        currentBbox={bbox}
        currentColors={{
          landColor: layerStyles.land.fill,
          waterColor: layerStyles.water.fill,
        }}
        currentLayerStyles={layerStyles}
      />

      {/* Onboarding Tour */}
      <OnboardingTour
        isActive={state.isTourActive}
        currentStep={state.currentTourStep}
        onNext={nextTourStep}
        onPrev={prevTourStep}
        onSkip={skipTour}
      />
    </div>
  );
}

export function SvgMapTool() {
  return (
    <AppUIProvider>
      <SvgMapToolInner />
    </AppUIProvider>
  );
}
