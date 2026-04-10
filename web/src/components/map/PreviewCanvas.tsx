/**
 * PreviewCanvas - Canvas overlay for real-time styled map preview
 *
 * This component renders GeoJSON tiles on a canvas overlay within the Leaflet map,
 * allowing users to see styled preview before export.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BBox, LayerName } from '@/types';
import { LayerStyle, OutputMode } from '@/types/makerPresets';
import { loadAllLayers, GeoJSONFeatureCollection } from '@/lib/tiles/tileLoader';
import { clipFeatureCollection } from '@/lib/geo/clip';
import { createViewport, renderAllLayers, prepareCanvas } from '@/lib/render/canvasRenderer';

interface PreviewCanvasProps {
  bbox: BBox | null;
  layerStyles: Record<LayerName, LayerStyle>;
  outputMode: OutputMode;
  enabled?: boolean;
  opacity?: number;
}

// Layers we support for preview (matching tile generation)
const PREVIEW_LAYERS: LayerName[] = ['water', 'roads', 'parks', 'railways'];

// Layer render order (back to front)
const LAYER_ORDER: LayerName[] = ['water', 'parks', 'roads', 'railways'];

export function PreviewCanvas({
  bbox,
  layerStyles,
  outputMode,
  enabled = true,
  opacity = 0.9,
}: PreviewCanvasProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadedData, setLoadedData] = useState<Map<LayerName, GeoJSONFeatureCollection> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastBboxRef = useRef<string | null>(null);

  // Create canvas element and add to map
  useEffect(() => {
    if (!map) return;

    // Create container div
    const container = L.DomUtil.create('div', 'preview-canvas-container');
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '450'; // Above tiles, below markers
    containerRef.current = container;

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.display = 'none';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    // Add to map's overlay pane
    map.getPane('overlayPane')?.appendChild(container);

    return () => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      canvasRef.current = null;
      containerRef.current = null;
    };
  }, [map]);

  // Load tile data when bbox changes
  useEffect(() => {
    if (!bbox || !enabled) {
      setLoadedData(null);
      return;
    }

    const bboxKey = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
    if (bboxKey === lastBboxRef.current) {
      return; // No change
    }
    lastBboxRef.current = bboxKey;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Determine which layers to load based on visibility
        const layersToLoad = PREVIEW_LAYERS.filter(name => layerStyles[name]?.visible);

        if (layersToLoad.length === 0) {
          setLoadedData(new Map());
          setIsLoading(false);
          return;
        }

        const data = await loadAllLayers(layersToLoad, bbox);

        // Clip features to bbox
        const clippedData = new Map<LayerName, GeoJSONFeatureCollection>();
        data.forEach((fc, layerName) => {
          const clipped = clipFeatureCollection(fc, bbox);
          clippedData.set(layerName, clipped);
        });

        setLoadedData(clippedData);
      } catch (err) {
        console.error('Failed to load preview tiles:', err);
        setError(err instanceof Error ? err.message : 'Failed to load tiles');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [bbox, enabled, layerStyles]);

  // Position and render canvas
  const updateCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !map || !bbox || !loadedData || !enabled) {
      if (canvas) canvas.style.display = 'none';
      return;
    }

    // Get pixel bounds of the bbox on the map
    const sw = map.latLngToLayerPoint(L.latLng(bbox.minLat, bbox.minLon));
    const ne = map.latLngToLayerPoint(L.latLng(bbox.maxLat, bbox.maxLon));

    const left = Math.min(sw.x, ne.x);
    const top = Math.min(sw.y, ne.y);
    const width = Math.abs(ne.x - sw.x);
    const height = Math.abs(ne.y - sw.y);

    // Don't render if too small
    if (width < 10 || height < 10) {
      canvas.style.display = 'none';
      return;
    }

    // Position canvas
    canvas.style.display = 'block';
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;
    canvas.style.opacity = String(opacity);

    // Get context and prepare
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size (use device pixel ratio for crisp rendering)
    const dpr = window.devicePixelRatio || 1;
    const renderWidth = Math.ceil(width * dpr);
    const renderHeight = Math.ceil(height * dpr);

    canvas.width = renderWidth;
    canvas.height = renderHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Scale context for retina
    ctx.scale(dpr, dpr);

    // Clear canvas
    prepareCanvas(ctx, renderWidth, renderHeight);
    ctx.scale(dpr, dpr); // Re-apply scale after prepareCanvas resets it

    // Create viewport for rendering
    const viewport = createViewport(
      bbox.minLon,
      bbox.minLat,
      bbox.maxLon,
      bbox.maxLat,
      width
    );

    // Render all layers
    renderAllLayers(ctx, loadedData, viewport, layerStyles, outputMode, LAYER_ORDER);
  }, [map, bbox, loadedData, layerStyles, outputMode, enabled, opacity]);

  // Update canvas on map move/zoom
  useEffect(() => {
    if (!map) return;

    const handleUpdate = () => {
      updateCanvas();
    };

    map.on('move', handleUpdate);
    map.on('zoom', handleUpdate);
    map.on('viewreset', handleUpdate);

    return () => {
      map.off('move', handleUpdate);
      map.off('zoom', handleUpdate);
      map.off('viewreset', handleUpdate);
    };
  }, [map, updateCanvas]);

  // Re-render when data or styles change
  useEffect(() => {
    updateCanvas();
  }, [updateCanvas]);

  // Show loading indicator
  if (isLoading && bbox) {
    return (
      <div
        className="absolute z-[500] bg-white/80 rounded-lg px-3 py-2 shadow-sm"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          Loading preview...
        </div>
      </div>
    );
  }

  // Show error
  if (error) {
    return (
      <div
        className="absolute z-[500] bg-red-50 border border-red-200 rounded-lg px-3 py-2 shadow-sm"
        style={{
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        <div className="text-sm text-red-600">
          Preview unavailable
        </div>
      </div>
    );
  }

  return null;
}

export default PreviewCanvas;
