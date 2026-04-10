/**
 * Serverless Export
 *
 * Handles map export entirely in the browser:
 * 1. Fetches water/land tiles from R2 CDN
 * 2. Renders layers to SVG
 * 3. Creates ZIP for download
 *
 * No backend required - infinite scalability, zero server costs.
 */

import { BBox, LayerName } from '@/types';
import { LayerStyle, OutputMode } from '@/types/makerPresets';
import { loadWaterTiles } from '../tiles/waterTiles';
import { loadLandTiles } from '../tiles/landTiles';
import { loadRoads, loadBoundaries } from '../overpass';
import { clipToBbox, BBoxMercator } from '../geo/polygonOps';
import { projectPoint, getViewportDimensions, toSvgCoords } from '../geo/project';

// Types
type Coordinate = [number, number];
type Ring = Coordinate[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];
type LineString = Coordinate[];
type MultiLineString = LineString[];

export interface ExportCallbacks {
  onProgress?: (layer: LayerName, status: 'fetching' | 'rendering') => void;
  onLayer?: (layer: LayerName, svg: string, width: number, height: number) => void;
  onComplete?: () => void;
  onError?: (error: string, layer?: LayerName) => void;
}

export interface ExportedLayer {
  name: LayerName;
  svg: string;
  width: number;
  height: number;
}

export interface ExportOptions {
  bbox: BBox;
  layers: LayerName[];
  styles: Record<string, LayerStyle>;
  outputMode: OutputMode;
  targetWidth?: number;
}

/**
 * Convert bbox to mercator format
 */
function bboxToMercator(bbox: BBox): BBoxMercator {
  const [minx, miny] = projectPoint(bbox.minLon, bbox.minLat);
  const [maxx, maxy] = projectPoint(bbox.maxLon, bbox.maxLat);
  return { minx, miny, maxx, maxy };
}

/**
 * Render a MultiPolygon to SVG path data
 */
function multiPolygonToPathData(
  mp: MultiPolygon,
  viewport: { minX: number; maxY: number; scale: number },
  precision: number = 2
): string {
  const parts: string[] = [];

  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;

      for (let i = 0; i < ring.length; i++) {
        const [x, y] = ring[i];
        const [sx, sy] = toSvgCoords(x, y, viewport);
        const rx = sx.toFixed(precision);
        const ry = sy.toFixed(precision);
        parts.push(i === 0 ? `M${rx},${ry}` : `L${rx},${ry}`);
      }
      parts.push('Z');
    }
  }

  return parts.join('');
}

/**
 * Render a MultiLineString to SVG path data
 */
function multiLineStringToPathData(
  mls: MultiLineString,
  viewport: { minX: number; maxY: number; scale: number },
  precision: number = 2
): string {
  const parts: string[] = [];

  for (const line of mls) {
    if (line.length < 2) continue;

    for (let i = 0; i < line.length; i++) {
      const [x, y] = line[i];
      const [sx, sy] = toSvgCoords(x, y, viewport);
      const rx = sx.toFixed(precision);
      const ry = sy.toFixed(precision);
      parts.push(i === 0 ? `M${rx},${ry}` : `L${rx},${ry}`);
    }
    // Don't close lines (no 'Z')
  }

  return parts.join('');
}

/**
 * Render a line layer to SVG
 */
function renderLineLayerSvg(
  pathData: string,
  viewport: { width: number; height: number },
  style: LayerStyle,
  outputMode: OutputMode,
  layerId: string
): string {
  if (!pathData) return '';

  const { width, height } = viewport;

  // Lines are always strokes
  const stroke = style.stroke !== 'none' ? style.stroke : style.fill;
  const strokeWidth = style.strokeWidth || 1;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}"
     width="${width.toFixed(2)}"
     height="${height.toFixed(2)}">
  <g id="${layerId}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${style.opacity < 1 ? ` opacity="${style.opacity}"` : ''}>
    <path d="${pathData}"/>
  </g>
</svg>`;
}

/**
 * Render a layer to SVG
 */
function renderLayerSvg(
  pathData: string,
  viewport: { width: number; height: number },
  style: LayerStyle,
  outputMode: OutputMode,
  layerId: string
): string {
  if (!pathData) return '';

  const { width, height } = viewport;

  // Apply output mode
  let fill = style.fill;
  let stroke = style.stroke;

  if (outputMode === 'stroke-only') {
    fill = 'none';
  } else if (outputMode === 'filled') {
    stroke = 'none';
  }

  // Build style attributes
  const styleAttrs: string[] = [];
  styleAttrs.push(`fill="${fill}"`);
  styleAttrs.push(`stroke="${stroke}"`);

  if (stroke !== 'none') {
    styleAttrs.push(`stroke-width="${style.strokeWidth}"`);
    styleAttrs.push('stroke-linecap="round"');
    styleAttrs.push('stroke-linejoin="round"');
  }

  if (fill !== 'none') {
    styleAttrs.push('fill-rule="evenodd"');
  }

  if (style.opacity < 1) {
    styleAttrs.push(`opacity="${style.opacity}"`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}"
     width="${width.toFixed(2)}"
     height="${height.toFixed(2)}">
  <g id="${layerId}" ${styleAttrs.join(' ')}>
    <path d="${pathData}"/>
  </g>
</svg>`;
}

/**
 * Export map layers entirely in the browser
 */
export async function exportServerless(
  options: ExportOptions,
  callbacks: ExportCallbacks = {}
): Promise<ExportedLayer[]> {
  const { bbox, layers, styles, outputMode, targetWidth = 800 } = options;
  const results: ExportedLayer[] = [];

  // Calculate viewport
  const dims = getViewportDimensions(
    bbox.minLon,
    bbox.minLat,
    bbox.maxLon,
    bbox.maxLat,
    targetWidth
  );

  const viewport = {
    minX: dims.minX,
    maxY: dims.maxY,
    scale: dims.scale,
    width: dims.width,
    height: dims.height,
  };

  console.log(`[export] ${Math.round(viewport.width)}x${Math.round(viewport.height)}px`);

  const bboxMerc = bboxToMercator(bbox);

  // Process water layer
  if (layers.includes('water')) {
    try {
      callbacks.onProgress?.('water', 'fetching');
      const waterMp = await loadWaterTiles(bbox);

      callbacks.onProgress?.('water', 'rendering');
      const clipped = clipToBbox(waterMp, bboxMerc);
      const pathData = multiPolygonToPathData(clipped, viewport);

      const style = styles['water'] || {
        visible: true,
        fill: '#b3d9ff',
        stroke: 'none',
        strokeWidth: 1,
        opacity: 1,
      };

      if (style.visible && pathData) {
        const svg = renderLayerSvg(pathData, viewport, style, outputMode, 'water');
        results.push({
          name: 'water',
          svg,
          width: viewport.width,
          height: viewport.height,
        });
        callbacks.onLayer?.('water', svg, viewport.width, viewport.height);
      }
    } catch (err) {
      callbacks.onError?.(String(err), 'water');
    }
  }

  // Process land layer
  if (layers.includes('land')) {
    try {
      callbacks.onProgress?.('land', 'fetching');
      const landMp = await loadLandTiles(bbox);

      callbacks.onProgress?.('land', 'rendering');
      const clipped = clipToBbox(landMp, bboxMerc);
      const pathData = multiPolygonToPathData(clipped, viewport);

      const style = styles['land'] || {
        visible: true,
        fill: '#f5f3ef',
        stroke: 'none',
        strokeWidth: 1,
        opacity: 1,
      };

      if (style.visible && pathData) {
        const svg = renderLayerSvg(pathData, viewport, style, outputMode, 'land');
        results.push({
          name: 'land',
          svg,
          width: viewport.width,
          height: viewport.height,
        });
        callbacks.onLayer?.('land', svg, viewport.width, viewport.height);
      }
    } catch (err) {
      callbacks.onError?.(String(err), 'land');
    }
  }

  // Process roads layer (from Overpass API)
  if (layers.includes('roads')) {
    try {
      callbacks.onProgress?.('roads', 'fetching');
      const roads = await loadRoads(bbox);

      callbacks.onProgress?.('roads', 'rendering');
      const pathData = multiLineStringToPathData(roads, viewport);

      const style = styles['roads'] || {
        visible: true,
        fill: 'none',
        stroke: '#333333',
        strokeWidth: 1,
        opacity: 1,
      };

      if (style.visible && pathData) {
        const svg = renderLineLayerSvg(pathData, viewport, style, outputMode, 'roads');
        results.push({
          name: 'roads',
          svg,
          width: viewport.width,
          height: viewport.height,
        });
        callbacks.onLayer?.('roads', svg, viewport.width, viewport.height);
      }
    } catch (err) {
      callbacks.onError?.(String(err), 'roads');
    }
  }

  // Process boundaries layer (from Overpass API)
  if (layers.includes('boundaries')) {
    try {
      callbacks.onProgress?.('boundaries', 'fetching');
      const boundaries = await loadBoundaries(bbox);

      callbacks.onProgress?.('boundaries', 'rendering');
      // Boundaries are primarily lines
      const pathData = multiLineStringToPathData(boundaries.lines, viewport);

      const style = styles['boundaries'] || {
        visible: true,
        fill: 'none',
        stroke: '#666666',
        strokeWidth: 0.5,
        opacity: 1,
      };

      if (style.visible && pathData) {
        const svg = renderLineLayerSvg(pathData, viewport, style, outputMode, 'boundaries');
        results.push({
          name: 'boundaries',
          svg,
          width: viewport.width,
          height: viewport.height,
        });
        callbacks.onLayer?.('boundaries', svg, viewport.width, viewport.height);
      }
    } catch (err) {
      callbacks.onError?.(String(err), 'boundaries');
    }
  }

  callbacks.onComplete?.();
  return results;
}

/**
 * Create a ZIP file from exported layers
 */
export async function createExportZip(layers: ExportedLayer[]): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (const layer of layers) {
    zip.file(`${layer.name}.svg`, layer.svg);
  }

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Download a blob as a file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Full export pipeline: fetch → render → zip → download
 */
export async function exportAndDownload(
  options: ExportOptions,
  callbacks: ExportCallbacks = {}
): Promise<void> {
  const layers = await exportServerless(options, callbacks);

  if (layers.length === 0) {
    throw new Error('No layers to export');
  }

  const zip = await createExportZip(layers);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(zip, `map-export-${timestamp}.zip`);
}
