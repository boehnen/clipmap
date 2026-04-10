/**
 * SVG renderer for GeoJSON export
 */

import { GeoJSONFeature, GeoJSONFeatureCollection } from '../tiles/tileLoader';
import { projectPoint, toSvgCoords, getViewportDimensions } from '../geo/project';
import { LayerStyle, OutputMode } from '@/types/makerPresets';
import { BBox } from '@/types';

interface Viewport {
  minX: number;
  maxY: number;
  scale: number;
  width: number;
  height: number;
}

/**
 * Create viewport from bounding box
 */
export function createSvgViewport(bbox: BBox, targetWidth: number = 800): Viewport {
  const dims = getViewportDimensions(
    bbox.minLon,
    bbox.minLat,
    bbox.maxLon,
    bbox.maxLat,
    targetWidth
  );

  return {
    minX: dims.minX,
    maxY: dims.maxY,
    scale: dims.scale,
    width: dims.width,
    height: dims.height,
  };
}

/**
 * Convert coordinates to SVG path data
 */
function coordsToPathData(
  coords: [number, number][],
  viewport: Viewport,
  close: boolean = false
): string {
  if (coords.length === 0) return '';

  const parts: string[] = [];

  for (let i = 0; i < coords.length; i++) {
    const [lon, lat] = coords[i];
    const [x, y] = projectPoint(lon, lat);
    const [sx, sy] = toSvgCoords(x, y, viewport);

    // Round to 2 decimal places for smaller file size
    const rx = Math.round(sx * 100) / 100;
    const ry = Math.round(sy * 100) / 100;

    if (i === 0) {
      parts.push(`M${rx},${ry}`);
    } else {
      parts.push(`L${rx},${ry}`);
    }
  }

  if (close) {
    parts.push('Z');
  }

  return parts.join('');
}

/**
 * Get effective style based on output mode
 */
function getEffectiveStyle(
  style: LayerStyle,
  outputMode: OutputMode
): { stroke: string; fill: string; strokeWidth: number; opacity: number } {
  let stroke = style.stroke;
  let fill = style.fill;

  if (outputMode === 'stroke-only') {
    fill = 'none';
  } else if (outputMode === 'filled') {
    stroke = 'none';
  }

  return {
    stroke,
    fill,
    strokeWidth: style.strokeWidth,
    opacity: style.opacity,
  };
}

/**
 * Generate SVG path element for a feature
 */
function featureToSvgPath(
  feature: GeoJSONFeature,
  viewport: Viewport
): string {
  const geom = feature.geometry;
  let pathData = '';

  switch (geom.type) {
    case 'Point': {
      // Render as small circle
      const [lon, lat] = geom.coordinates;
      const [x, y] = projectPoint(lon, lat);
      const [sx, sy] = toSvgCoords(x, y, viewport);
      return `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="2"/>`;
    }

    case 'LineString':
      pathData = coordsToPathData(geom.coordinates, viewport, false);
      break;

    case 'MultiLineString':
      pathData = geom.coordinates
        .map((line: [number, number][]) => coordsToPathData(line, viewport, false))
        .join('');
      break;

    case 'Polygon':
      pathData = geom.coordinates
        .map((ring: [number, number][]) => coordsToPathData(ring, viewport, true))
        .join('');
      break;

    case 'MultiPolygon':
      pathData = geom.coordinates
        .flatMap((polygon: [number, number][][]) =>
          polygon.map((ring: [number, number][]) => coordsToPathData(ring, viewport, true))
        )
        .join('');
      break;

    default:
      return '';
  }

  if (!pathData) return '';
  return `<path d="${pathData}"/>`;
}

/**
 * Render a layer to SVG string
 */
export function renderLayerToSvg(
  featureCollection: GeoJSONFeatureCollection,
  bbox: BBox,
  style: LayerStyle,
  outputMode: OutputMode,
  targetWidth: number = 800
): string {
  if (!style.visible || featureCollection.features.length === 0) {
    return '';
  }

  const viewport = createSvgViewport(bbox, targetWidth);
  const effectiveStyle = getEffectiveStyle(style, outputMode);

  // Skip if nothing to draw
  if (effectiveStyle.stroke === 'none' && effectiveStyle.fill === 'none') {
    return '';
  }

  const paths: string[] = [];

  for (const feature of featureCollection.features) {
    const svg = featureToSvgPath(feature, viewport);
    if (svg) {
      paths.push(svg);
    }
  }

  if (paths.length === 0) return '';

  // Build style attributes
  const styleAttrs: string[] = [];
  styleAttrs.push(`stroke="${effectiveStyle.stroke}"`);
  styleAttrs.push(`fill="${effectiveStyle.fill}"`);

  if (effectiveStyle.stroke !== 'none') {
    styleAttrs.push(`stroke-width="${effectiveStyle.strokeWidth}"`);
    styleAttrs.push('stroke-linecap="round"');
    styleAttrs.push('stroke-linejoin="round"');
  }

  if (effectiveStyle.fill !== 'none') {
    styleAttrs.push('fill-rule="evenodd"');
  }

  if (effectiveStyle.opacity < 1) {
    styleAttrs.push(`opacity="${effectiveStyle.opacity}"`);
  }

  // Build complete SVG
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 ${viewport.width.toFixed(2)} ${viewport.height.toFixed(2)}"
     width="${viewport.width.toFixed(2)}"
     height="${viewport.height.toFixed(2)}">
  <g ${styleAttrs.join(' ')}>
    ${paths.join('\n    ')}
  </g>
</svg>`;

  return svgContent;
}

/**
 * Render all visible layers to separate SVG strings
 */
export function renderAllLayersToSvg(
  layers: Map<string, GeoJSONFeatureCollection>,
  bbox: BBox,
  styles: Record<string, LayerStyle>,
  outputMode: OutputMode,
  targetWidth: number = 800
): Map<string, string> {
  const result = new Map<string, string>();

  layers.forEach((fc, layerName) => {
    const style = styles[layerName];
    if (!style || !style.visible) return;

    const svg = renderLayerToSvg(fc, bbox, style, outputMode, targetWidth);
    if (svg) {
      result.set(layerName, svg);
    }
  });

  return result;
}

/**
 * Export layer data for download
 */
export interface ExportedLayer {
  name: string;
  svg: string;
  width: number;
  height: number;
}

export function prepareLayersForExport(
  layers: Map<string, GeoJSONFeatureCollection>,
  bbox: BBox,
  styles: Record<string, LayerStyle>,
  outputMode: OutputMode,
  targetWidth: number = 800
): ExportedLayer[] {
  const viewport = createSvgViewport(bbox, targetWidth);
  const svgLayers = renderAllLayersToSvg(layers, bbox, styles, outputMode, targetWidth);

  const exported: ExportedLayer[] = [];

  svgLayers.forEach((svg, name) => {
    exported.push({
      name,
      svg,
      width: viewport.width,
      height: viewport.height,
    });
  });

  return exported;
}
