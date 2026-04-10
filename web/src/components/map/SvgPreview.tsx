'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BBox, LayerName } from '@/types';
import { LayerStyle } from '@/types/makerPresets';
import { loadWaterTiles } from '@/lib/tiles/waterTiles';
import { loadLandTiles } from '@/lib/tiles/landTiles';
import { loadRoads, loadBoundaries } from '@/lib/overpass';
import { projectPoint, toSvgCoords } from '@/lib/geo/project';

interface SvgPreviewProps {
  bbox: BBox | null;
  layerStyles: Record<LayerName, LayerStyle>;
  enabled?: boolean;
}

type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];
type LineString = Coordinate[];
type MultiLineString = LineString[];

// Simple path data generation - no clipping, just transform coords
function multiPolygonToPathData(
  mp: MultiPolygon,
  viewport: { minX: number; maxY: number; scale: number }
): string {
  const parts: string[] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = ring[i];
        const [sx, sy] = toSvgCoords(x, y, viewport);
        parts.push(i === 0 ? `M${sx.toFixed(0)},${sy.toFixed(0)}` : `L${sx.toFixed(0)},${sy.toFixed(0)}`);
      }
      parts.push('Z');
    }
  }
  return parts.join('');
}

// Line path data generation for roads/boundaries
function multiLineStringToPathData(
  mls: MultiLineString,
  viewport: { minX: number; maxY: number; scale: number }
): string {
  const parts: string[] = [];
  for (const line of mls) {
    if (line.length < 2) continue;
    for (let i = 0; i < line.length; i++) {
      const [x, y] = line[i];
      const [sx, sy] = toSvgCoords(x, y, viewport);
      parts.push(i === 0 ? `M${sx.toFixed(0)},${sy.toFixed(0)}` : `L${sx.toFixed(0)},${sy.toFixed(0)}`);
    }
    // Don't close lines (no 'Z')
  }
  return parts.join('');
}

export function SvgPreview({
  bbox,
  layerStyles,
  enabled = true,
}: SvgPreviewProps) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pathData, setPathData] = useState<{ water: string; land: string; roads: string; boundaries: string }>({ water: '', land: '', roads: '', boundaries: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isMapMoving, setIsMapMoving] = useState(false);
  const isMapMovingRef = useRef(false); // Ref for immediate checks (no async delay)
  const lastBboxRef = useRef<string | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create container
  useEffect(() => {
    if (!map) return;

    const container = L.DomUtil.create('div', 'svg-preview');
    container.style.position = 'absolute';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '400';
    container.style.overflow = 'hidden';
    containerRef.current = container;

    map.getPane('overlayPane')?.appendChild(container);

    return () => {
      if (container.parentNode) container.parentNode.removeChild(container);
      containerRef.current = null;
    };
  }, [map]);

  // Track map pan/zoom state to hide preview during movement
  useEffect(() => {
    if (!map) return;

    const handleMoveStart = () => {
      // Set ref immediately for synchronous checks in updatePosition
      isMapMovingRef.current = true;
      // Immediately hide container to prevent jitter (don't wait for React state)
      if (containerRef.current) {
        containerRef.current.style.display = 'none';
      }
      setIsMapMoving(true);
    };
    const handleMoveEnd = () => {
      isMapMovingRef.current = false;
      setIsMapMoving(false);
    };

    map.on('movestart', handleMoveStart);
    map.on('zoomstart', handleMoveStart);
    map.on('moveend', handleMoveEnd);
    map.on('zoomend', handleMoveEnd);

    return () => {
      map.off('movestart', handleMoveStart);
      map.off('zoomstart', handleMoveStart);
      map.off('moveend', handleMoveEnd);
      map.off('zoomend', handleMoveEnd);
    };
  }, [map]);

  // Hide container when disabled or map is moving
  useEffect(() => {
    const container = containerRef.current;
    if (container && (!enabled || isMapMoving)) {
      container.style.display = 'none';
    }
  }, [enabled, isMapMoving]);

  // Load tiles when bbox changes (debounced)
  useEffect(() => {
    if (!bbox || !enabled) {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
      return;
    }

    const bboxKey = `${bbox.minLon.toFixed(3)},${bbox.minLat.toFixed(3)},${bbox.maxLon.toFixed(3)},${bbox.maxLat.toFixed(3)}`;
    if (bboxKey === lastBboxRef.current) return;

    // Debounce tile loading by 150ms
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
    }

    loadTimeoutRef.current = setTimeout(() => {
      lastBboxRef.current = bboxKey;

      const load = async () => {
        setIsLoading(true);
        try {
          // Calculate viewport for coordinate transform
          const [minX] = projectPoint(bbox.minLon, bbox.minLat);
          const [maxX, maxY] = projectPoint(bbox.maxLon, bbox.maxLat);
          const projWidth = maxX - minX;
          const scale = 1000 / projWidth;
          const viewport = { minX, maxY, scale };

          // Load tiles in parallel - no clipping for preview speed
          // TODO: Roads/boundaries temporarily disabled until tiles are generated
          const [waterMp, landMp] = await Promise.all([
            layerStyles.water?.visible ? loadWaterTiles(bbox) : Promise.resolve([]),
            layerStyles.land?.visible ? loadLandTiles(bbox) : Promise.resolve([]),
          ]);

          setPathData({
            water: multiPolygonToPathData(waterMp, viewport),
            land: multiPolygonToPathData(landMp, viewport),
            roads: '', // Disabled until tiles ready
            boundaries: '', // Disabled until tiles ready
          });
        } catch (err) {
          console.error('Preview error:', err);
        } finally {
          setIsLoading(false);
        }
      };

      load();
    }, 150);

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [bbox, enabled, layerStyles.water?.visible, layerStyles.land?.visible, layerStyles.roads?.visible, layerStyles.boundaries?.visible]);

  // Position overlay on map
  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    // Use ref for immediate check (avoids async state delay during pan/zoom start)
    if (!container || !map || !bbox || !enabled || isMapMovingRef.current) {
      if (container) container.style.display = 'none';
      return;
    }

    // Check if path data matches current bbox (avoid showing stale/stretched preview)
    const bboxKey = `${bbox.minLon.toFixed(3)},${bbox.minLat.toFixed(3)},${bbox.maxLon.toFixed(3)},${bbox.maxLat.toFixed(3)}`;
    if (bboxKey !== lastBboxRef.current) {
      container.style.display = 'none';
      return;
    }

    const sw = map.latLngToLayerPoint(L.latLng(bbox.minLat, bbox.minLon));
    const ne = map.latLngToLayerPoint(L.latLng(bbox.maxLat, bbox.maxLon));

    const left = Math.min(sw.x, ne.x);
    const top = Math.min(sw.y, ne.y);
    const width = Math.abs(ne.x - sw.x);
    const height = Math.abs(ne.y - sw.y);

    if (width < 5 || height < 5) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;

    // Calculate viewBox from projected coords
    const [minX, minY] = projectPoint(bbox.minLon, bbox.minLat);
    const [maxX, maxY] = projectPoint(bbox.maxLon, bbox.maxLat);
    const projWidth = maxX - minX;
    const projHeight = maxY - minY;
    const scale = 1000 / projWidth;
    const vbWidth = 1000;
    const vbHeight = projHeight * scale;

    const landFill = layerStyles.land?.visible ? layerStyles.land.fill : 'none';
    const waterFill = layerStyles.water?.visible ? layerStyles.water.fill : 'none';
    const roadsStroke = layerStyles.roads?.visible ? layerStyles.roads.stroke : 'none';
    const boundariesStroke = layerStyles.boundaries?.visible ? layerStyles.boundaries.stroke : 'none';

    container.innerHTML = `<svg viewBox="0 0 ${vbWidth} ${vbHeight}" width="100%" height="100%" preserveAspectRatio="none" style="display:block">
      ${pathData.land ? `<path d="${pathData.land}" fill="${landFill}" fill-rule="evenodd"/>` : ''}
      ${pathData.water ? `<path d="${pathData.water}" fill="${waterFill}" fill-rule="evenodd"/>` : ''}
      ${pathData.roads ? `<path d="${pathData.roads}" fill="none" stroke="${roadsStroke}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      ${pathData.boundaries ? `<path d="${pathData.boundaries}" fill="none" stroke="${boundariesStroke}" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    </svg>`;
  }, [map, bbox, pathData, layerStyles, enabled, isMapMoving]);

  // Update on map events
  useEffect(() => {
    if (!map) return;
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    map.on('viewreset', updatePosition);
    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
      map.off('viewreset', updatePosition);
    };
  }, [map, updatePosition]);

  useEffect(() => {
    updatePosition();
  }, [updatePosition]);

  if (isLoading && bbox) {
    return (
      <div className="absolute z-[500] bg-white/90 rounded px-2 py-1 shadow text-xs" style={{ top: 8, left: 60 }}>
        Loading...
      </div>
    );
  }

  return null;
}
