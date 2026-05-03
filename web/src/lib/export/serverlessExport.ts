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
import { LayerStyle, OutputMode, GradientFill, LinearGradient, RadialGradient } from '@/types/makerPresets';
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
 * Generate SVG gradient definition with absolute coordinates (userSpaceOnUse)
 */
function generateGradientDef(
  id: string,
  gradient: GradientFill,
  viewBox: { width: number; height: number }
): string {
  if (gradient.type === 'linear') {
    const lg = gradient as LinearGradient;
    // Convert angle to SVG coordinates (0deg = left-to-right, 90deg = top-to-bottom)
    const angleRad = (lg.angle - 90) * (Math.PI / 180);
    // Use absolute coordinates based on viewBox
    const cx = viewBox.width / 2;
    const cy = viewBox.height / 2;
    const radius = Math.max(viewBox.width, viewBox.height) / 2;
    const x1 = cx - Math.cos(angleRad) * radius;
    const y1 = cy - Math.sin(angleRad) * radius;
    const x2 = cx + Math.cos(angleRad) * radius;
    const y2 = cy + Math.sin(angleRad) * radius;

    const stops = lg.stops.map(s =>
      `<stop offset="${s.offset}%" stop-color="${s.color}"/>`
    ).join('');

    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}">${stops}</linearGradient>`;
  } else {
    const rg = gradient as RadialGradient;
    const cx = (rg.cx ?? 50) / 100 * viewBox.width;
    const cy = (rg.cy ?? 50) / 100 * viewBox.height;
    const r = Math.max(viewBox.width, viewBox.height) / 2;

    const stops = rg.stops.map(s =>
      `<stop offset="${s.offset}%" stop-color="${s.color}"/>`
    ).join('');

    return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}">${stops}</radialGradient>`;
  }
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
  let gradientDef = '';

  if (outputMode === 'stroke-only') {
    fill = 'none';
  } else if (outputMode === 'filled') {
    stroke = 'none';
  }

  // Check for gradient fill (only when not stroke-only mode)
  if (style.fillGradient && outputMode !== 'stroke-only') {
    const gradientId = `${layerId}-gradient`;
    gradientDef = generateGradientDef(gradientId, style.fillGradient, { width, height });
    fill = `url(#${gradientId})`;
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

  // Build defs section if gradient present
  const defsSection = gradientDef ? `\n  <defs>\n    ${gradientDef}\n  </defs>` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}"
     width="${width.toFixed(2)}"
     height="${height.toFixed(2)}">${defsSection}
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

/**
 * Create a combined/flattened SVG from all layers
 */
export function createCombinedSvg(layers: ExportedLayer[]): string {
  if (layers.length === 0) return '';

  const { width, height } = layers[0];

  // Collect all gradient definitions
  const gradientDefs: string[] = [];
  const layerGroups: string[] = [];

  for (const layer of layers) {
    // Extract defs section if present
    const defsMatch = layer.svg.match(/<defs>([\s\S]*?)<\/defs>/);
    if (defsMatch) {
      gradientDefs.push(defsMatch[1]);
    }

    // Extract the g element content
    const gMatch = layer.svg.match(/<g[^>]*>([\s\S]*?)<\/g>/);
    if (gMatch) {
      // Get the full g tag with attributes
      const fullGMatch = layer.svg.match(/<g[^>]*>[\s\S]*?<\/g>/);
      if (fullGMatch) {
        layerGroups.push(fullGMatch[0]);
      }
    }
  }

  const defsSection = gradientDefs.length > 0
    ? `\n  <defs>\n    ${gradientDefs.join('\n    ')}\n  </defs>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${width.toFixed(2)} ${height.toFixed(2)}"
     width="${width.toFixed(2)}"
     height="${height.toFixed(2)}">${defsSection}
  ${layerGroups.join('\n  ')}
</svg>`;
}

/**
 * Render SVG to PNG blob
 */
export async function svgToPng(
  svgString: string,
  width: number,
  height: number,
  scale: number = 2 // Default 2x for retina
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    // Scale canvas for higher resolution
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create PNG blob'));
        }
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG for PNG conversion'));
    };

    img.src = url;
  });
}

/**
 * Export as flattened PNG
 */
export async function exportAsPng(
  options: ExportOptions & { scale?: number },
  callbacks: ExportCallbacks = {}
): Promise<void> {
  const layers = await exportServerless(options, callbacks);

  if (layers.length === 0) {
    throw new Error('No layers to export');
  }

  const combinedSvg = createCombinedSvg(layers);
  const { width, height } = layers[0];
  const scale = options.scale || 2;

  const pngBlob = await svgToPng(combinedSvg, width, height, scale);
  const timestamp = new Date().toISOString().slice(0, 10);
  downloadBlob(pngBlob, `map-export-${timestamp}.png`);
}
