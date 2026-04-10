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
import { clipToBbox, BBoxMercator } from '../geo/polygonOps';
import { projectPoint, getViewportDimensions, toSvgCoords } from '../geo/project';

// Types
type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

export interface ExportCallbacks {
  onProgress?: (layer: LayerName, status: 'fetching' | 'rendering') => void;
  onLayer?: (layer: LayerName, svg: string) => void;
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
        callbacks.onLayer?.('water', svg);
      }
    } catch (err) {
      console.error('Water layer error:', err);
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
        callbacks.onLayer?.('land', svg);
      }
    } catch (err) {
      console.error('Land layer error:', err);
      callbacks.onError?.(String(err), 'land');
    }
  }

  // TODO: Add other layers (roads, parks, etc.) once we have them on R2
  // For now, water and land are the key polygon layers
  // Other layers would follow the same pattern:
  // 1. Fetch tiles from R2
  // 2. Clip to bbox
  // 3. Render to SVG

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
