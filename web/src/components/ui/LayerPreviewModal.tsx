'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { LayerData, createZipFromLayers, downloadBlob } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';
import { LayerName } from '@/types';
import { LayerStyle, OutputMode } from '@/types/makerPresets';
import { transformSvgForExport, extractSvgContent } from '@/lib/utils/svgTransform';

interface LayerPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  layers: LayerData[];
  isLoading: boolean;
  currentLayer?: string;
  currentStatus?: string;
  queuePosition?: number;
  error?: string;
  // New props for maker presets
  layerStyles?: Record<LayerName, LayerStyle>;
  outputMode?: OutputMode;
}

const DEFAULT_STYLES: Record<string, { stroke: string; fill: string }> = {
  land: { stroke: 'none', fill: '#f5f5f5' },
  water: { stroke: 'none', fill: '#b3d9ff' },
  parks: { stroke: 'none', fill: '#c8e6c9' },
  roads: { stroke: '#404040', fill: 'none' },
  railways: { stroke: '#666666', fill: 'none' },
  buildings: { stroke: '#888888', fill: '#e8e8e8' },
  places: { stroke: '#333333', fill: 'none' },
  boundaries: { stroke: '#9c27b0', fill: 'none' },
  transit: { stroke: '#ff9800', fill: 'none' },
};

const LAYER_ORDER = ['land', 'water', 'parks', 'buildings', 'roads', 'railways', 'transit', 'boundaries', 'places'];

export function LayerPreviewModal({
  isOpen,
  onClose,
  layers,
  isLoading,
  currentLayer,
  currentStatus,
  queuePosition,
  error,
  layerStyles,
  outputMode = 'combined',
}: LayerPreviewModalProps) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [localLayerStyles, setLocalLayerStyles] = useState<Record<string, { visible: boolean; stroke: string; fill: string; strokeWidth: number }>>({});
  const [editingLayer, setEditingLayer] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Debug logging
  useEffect(() => {
    console.log('[Preview] Layers:', layers.map(l => l.name));
  }, [layers]);

  // Initialize local styles from passed layerStyles or defaults
  useEffect(() => {
    const updates: Record<string, { visible: boolean; stroke: string; fill: string; strokeWidth: number }> = {};
    for (const layer of layers) {
      if (!localLayerStyles[layer.name]) {
        // Use passed layerStyles if available, otherwise use defaults
        if (layerStyles && layerStyles[layer.name as LayerName]) {
          const style = layerStyles[layer.name as LayerName];
          updates[layer.name] = {
            visible: style.visible,
            stroke: style.stroke,
            fill: style.fill,
            strokeWidth: style.strokeWidth,
          };
        } else {
          const defaults = DEFAULT_STYLES[layer.name] || { stroke: '#000', fill: 'none' };
          updates[layer.name] = { visible: true, stroke: defaults.stroke, fill: defaults.fill, strokeWidth: 1 };
        }
      }
    }
    if (Object.keys(updates).length > 0) {
      setLocalLayerStyles(prev => ({ ...prev, ...updates }));
    }
  }, [layers, layerStyles]);

  // Update local styles when layerStyles prop changes
  useEffect(() => {
    if (layerStyles) {
      const updates: Record<string, { visible: boolean; stroke: string; fill: string; strokeWidth: number }> = {};
      for (const layer of layers) {
        const style = layerStyles[layer.name as LayerName];
        if (style) {
          updates[layer.name] = {
            visible: style.visible,
            stroke: style.stroke,
            fill: style.fill,
            strokeWidth: style.strokeWidth,
          };
        }
      }
      if (Object.keys(updates).length > 0) {
        setLocalLayerStyles(prev => ({ ...prev, ...updates }));
      }
    }
  }, [layerStyles, layers]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTransform({ x: 0, y: 0, scale: 1 });
      setEditingLayer(null);
    }
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Zoom towards mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(10, transform.scale * zoomFactor));

    // Zoom towards mouse position
    const scaleChange = newScale / transform.scale;
    const newX = mouseX - (mouseX - transform.x) * scaleChange;
    const newY = mouseY - (mouseY - transform.y) * scaleChange;

    setTransform({ x: newX, y: newY, scale: newScale });
  }, [transform]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsPanning(true);
    setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setTransform(t => ({ ...t, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const resetView = useCallback(() => setTransform({ x: 0, y: 0, scale: 1 }), []);

  // Apply output mode to content rendering
  const getEffectiveStyle = useCallback((layerName: string) => {
    const style = localLayerStyles[layerName];
    if (!style) return { stroke: '#000', fill: 'none', strokeWidth: 1 };

    let effectiveStroke = style.stroke;
    let effectiveFill = style.fill;

    if (outputMode === 'stroke-only') {
      effectiveFill = 'none';
    } else if (outputMode === 'filled') {
      effectiveStroke = 'none';
    }

    return {
      stroke: effectiveStroke,
      fill: effectiveFill,
      strokeWidth: style.strokeWidth,
    };
  }, [localLayerStyles, outputMode]);

  const sortedLayers = useMemo(() => {
    return [...layers]
      .filter(l => localLayerStyles[l.name]?.visible !== false)
      .sort((a, b) => {
        const ai = LAYER_ORDER.indexOf(a.name);
        const bi = LAYER_ORDER.indexOf(b.name);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
  }, [layers, localLayerStyles]);

  const handleDownload = useCallback(async () => {
    setIsDownloading(true);
    try {
      // Apply styles to SVGs before creating ZIP
      const visibleLayers = layers.filter(l => localLayerStyles[l.name]?.visible !== false);
      const styledLayers = visibleLayers.map(layer => {
        const style = localLayerStyles[layer.name];
        if (!style) return layer;

        // Create a full LayerStyle object
        const fullStyle: LayerStyle = {
          visible: style.visible,
          stroke: style.stroke,
          fill: style.fill,
          strokeWidth: style.strokeWidth,
          opacity: 1,
        };

        // Transform the SVG with the styles
        const transformedSvg = transformSvgForExport(layer.svg, fullStyle, outputMode);

        return {
          ...layer,
          svg: transformedSvg,
        };
      });

      const blob = await createZipFromLayers(styledLayers);
      downloadBlob(blob, `map-${Date.now()}.zip`);
    } finally {
      setIsDownloading(false);
    }
  }, [layers, localLayerStyles, outputMode]);

  const toggleVisibility = useCallback((name: string) => {
    setLocalLayerStyles(prev => ({ ...prev, [name]: { ...prev[name], visible: !prev[name]?.visible } }));
  }, []);

  const updateStyle = useCallback((name: string, updates: Partial<{ visible: boolean; stroke: string; fill: string; strokeWidth: number }>) => {
    setLocalLayerStyles(prev => ({ ...prev, [name]: { ...prev[name], ...updates } }));
  }, []);

  if (!isOpen) return null;

  const canvasWidth = layers[0]?.width || 800;
  const canvasHeight = layers[0]?.height || 600;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/70"
      onClick={onClose}
    >
      <div
        className="relative flex bg-white rounded-xl shadow-2xl overflow-hidden"
        style={{ width: '90vw', maxWidth: '1200px', height: '80vh', maxHeight: '800px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Preview */}
        <div className="flex-1 flex flex-col bg-neutral-800 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/50 border-b border-neutral-700">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-white">Preview</span>
              {isLoading ? (
                <span className="text-xs text-neutral-400">
                  {queuePosition && queuePosition > 0
                    ? `Queue: ${queuePosition}`
                    : currentLayer
                      ? `${currentStatus === 'fetching' ? 'Fetching' : 'Rendering'} ${currentLayer}...`
                      : 'Starting...'}
                </span>
              ) : (
                <span className="text-xs text-neutral-500">{layers.length} layers</span>
              )}
              {/* Output mode indicator */}
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                outputMode === 'stroke-only'
                  ? 'bg-orange-500/20 text-orange-300'
                  : outputMode === 'filled'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-green-500/20 text-green-300'
              )}>
                {outputMode === 'stroke-only' ? 'Stroke' :
                 outputMode === 'filled' ? 'Fill' : 'Combined'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.1, t.scale / 1.5) }))} className="p-1.5 text-neutral-400 hover:text-white rounded">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
              </button>
              <button onClick={resetView} className="px-2 py-1 text-xs text-neutral-400 hover:text-white rounded min-w-[40px]">
                {Math.round(transform.scale * 100)}%
              </button>
              <button onClick={() => setTransform(t => ({ ...t, scale: Math.min(10, t.scale * 1.5) }))} className="p-1.5 text-neutral-400 hover:text-white rounded">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div
            ref={canvasRef}
            className={cn("flex-1 overflow-hidden", isPanning ? "cursor-grabbing" : "cursor-grab")}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {error ? (
              <div className="h-full flex items-center justify-center text-red-400 text-sm">{error}</div>
            ) : isLoading && layers.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-neutral-400">Loading layers...</span>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center p-4">
                <div
                  style={{
                    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                    transformOrigin: '0 0',
                    transition: isPanning ? 'none' : 'transform 0.05s ease-out',
                  }}
                >
                  <div className="rounded shadow-lg" style={{ background: '#fff' }}>
                    <svg
                      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                      style={{ width: 'auto', height: '45vh', maxWidth: '50vw', display: 'block' }}
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {sortedLayers.map((layer) => {
                        const style = getEffectiveStyle(layer.name);
                        return (
                          <g
                            key={layer.name}
                            stroke={style.stroke}
                            fill={style.fill}
                            strokeWidth={style.strokeWidth}
                            dangerouslySetInnerHTML={{ __html: extractSvgContent(layer.svg) }}
                          />
                        );
                      })}
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-2 text-xs text-neutral-500 bg-neutral-900/30">
            Scroll to zoom • Drag to pan
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-56 bg-neutral-50 flex flex-col border-l border-neutral-200">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200">
            <span className="text-sm font-medium text-neutral-800">Layers</span>
            <button onClick={onClose} className="p-1 text-neutral-400 hover:text-neutral-600 rounded">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {layers.length === 0 && isLoading ? (
              <div className="p-3 text-xs text-neutral-400 text-center">Loading...</div>
            ) : (
              [...layers]
                .sort((a, b) => LAYER_ORDER.indexOf(a.name) - LAYER_ORDER.indexOf(b.name))
                .map((layer) => {
                  const style = localLayerStyles[layer.name];
                  const isVisible = style?.visible !== false;
                  const isEditing = editingLayer === layer.name;
                  const effectiveStyle = getEffectiveStyle(layer.name);

                  return (
                    <div key={layer.name} className="px-2">
                      <div
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm",
                          isEditing ? "bg-white shadow-sm" : "hover:bg-white/50"
                        )}
                        onClick={() => setEditingLayer(isEditing ? null : layer.name)}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.name); }}
                          className={cn(
                            "w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0",
                            isVisible ? "bg-blue-500 border-blue-500" : "border-neutral-300"
                          )}
                        >
                          {isVisible && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </button>
                        <div
                          className="w-4 h-4 rounded-sm border flex-shrink-0"
                          style={{
                            backgroundColor: effectiveStyle.fill !== 'none' ? effectiveStyle.fill : 'transparent',
                            borderColor: effectiveStyle.stroke !== 'none' ? effectiveStyle.stroke : '#ccc',
                            borderWidth: effectiveStyle.stroke !== 'none' ? '2px' : '1px',
                          }}
                        />
                        <span className={cn("flex-1 capitalize truncate", !isVisible && "text-neutral-400")}>
                          {layer.name}
                        </span>
                      </div>

                      {isEditing && (
                        <div className="ml-6 mt-1 mb-2 p-2 bg-white rounded border border-neutral-200 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 w-10">Stroke</span>
                            <input
                              type="color"
                              value={style?.stroke === 'none' ? '#000000' : style?.stroke || '#000000'}
                              onChange={(e) => updateStyle(layer.name, { stroke: e.target.value })}
                              className="w-6 h-5 rounded cursor-pointer"
                              disabled={outputMode === 'filled'}
                            />
                            <button
                              onClick={() => updateStyle(layer.name, { stroke: style?.stroke === 'none' ? '#000000' : 'none' })}
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded",
                                style?.stroke === 'none' ? "bg-neutral-200" : "hover:bg-neutral-100",
                                outputMode === 'filled' && "opacity-50 cursor-not-allowed"
                              )}
                              disabled={outputMode === 'filled'}
                            >
                              {style?.stroke === 'none' ? 'Off' : 'None'}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 w-10">Fill</span>
                            <input
                              type="color"
                              value={style?.fill === 'none' ? '#ffffff' : style?.fill || '#ffffff'}
                              onChange={(e) => updateStyle(layer.name, { fill: e.target.value })}
                              className="w-6 h-5 rounded cursor-pointer"
                              disabled={outputMode === 'stroke-only'}
                            />
                            <button
                              onClick={() => updateStyle(layer.name, { fill: style?.fill === 'none' ? '#ffffff' : 'none' })}
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded",
                                style?.fill === 'none' ? "bg-neutral-200" : "hover:bg-neutral-100",
                                outputMode === 'stroke-only' && "opacity-50 cursor-not-allowed"
                              )}
                              disabled={outputMode === 'stroke-only'}
                            >
                              {style?.fill === 'none' ? 'Off' : 'None'}
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 w-10">Width</span>
                            <input
                              type="range"
                              min="0.1"
                              max="3"
                              step="0.1"
                              value={style?.strokeWidth || 1}
                              onChange={(e) => updateStyle(layer.name, { strokeWidth: parseFloat(e.target.value) })}
                              className="flex-1 h-1"
                              disabled={outputMode === 'filled'}
                            />
                            <span className="text-xs text-neutral-500 w-6">{(style?.strokeWidth || 1).toFixed(1)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
            {isLoading && layers.length > 0 && (
              <div className="px-4 py-2 text-xs text-neutral-400 flex items-center gap-2">
                <div className="w-3 h-3 border border-neutral-300 border-t-transparent rounded-full animate-spin" />
                Loading...
              </div>
            )}
          </div>

          <div className="p-3 border-t border-neutral-200 space-y-2">
            <button
              onClick={handleDownload}
              disabled={isLoading || layers.length === 0 || isDownloading}
              className={cn(
                "w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2",
                isLoading || layers.length === 0 || isDownloading
                  ? "bg-neutral-200 text-neutral-400"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {isDownloading ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Zipping...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Download</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
