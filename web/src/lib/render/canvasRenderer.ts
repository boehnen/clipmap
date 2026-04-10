/**
 * Canvas renderer for GeoJSON preview
 */

import { GeoJSONFeature, GeoJSONFeatureCollection } from '../tiles/tileLoader';
import { projectPoint, toSvgCoords } from '../geo/project';
import { LayerStyle, OutputMode } from '@/types/makerPresets';

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
export function createViewport(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  canvasWidth: number
): Viewport {
  const [minX, minY] = projectPoint(minLon, minLat);
  const [maxX, maxY] = projectPoint(maxLon, maxLat);

  const projWidth = maxX - minX;
  const projHeight = maxY - minY;
  const scale = canvasWidth / projWidth;
  const height = projHeight * scale;

  return {
    minX,
    maxY,
    scale,
    width: canvasWidth,
    height,
  };
}

/**
 * Project and transform coordinates for canvas
 */
function transformCoords(
  coords: [number, number][],
  viewport: Viewport
): [number, number][] {
  return coords.map(([lon, lat]) => {
    const [x, y] = projectPoint(lon, lat);
    return toSvgCoords(x, y, viewport);
  });
}

/**
 * Get effective style based on output mode
 */
function getEffectiveStyle(
  style: LayerStyle,
  outputMode: OutputMode
): { stroke: string | null; fill: string | null; strokeWidth: number } {
  let stroke = style.stroke === 'none' ? null : style.stroke;
  let fill = style.fill === 'none' ? null : style.fill;

  if (outputMode === 'stroke-only') {
    fill = null;
  } else if (outputMode === 'filled') {
    stroke = null;
  }

  return { stroke, fill, strokeWidth: style.strokeWidth };
}

/**
 * Draw a LineString to canvas
 */
function drawLineString(
  ctx: CanvasRenderingContext2D,
  coords: [number, number][],
  viewport: Viewport
): void {
  if (coords.length < 2) return;

  const transformed = transformCoords(coords, viewport);

  ctx.beginPath();
  ctx.moveTo(transformed[0][0], transformed[0][1]);

  for (let i = 1; i < transformed.length; i++) {
    ctx.lineTo(transformed[i][0], transformed[i][1]);
  }

  ctx.stroke();
}

/**
 * Draw a Polygon to canvas
 */
function drawPolygon(
  ctx: CanvasRenderingContext2D,
  rings: [number, number][][],
  viewport: Viewport,
  doFill: boolean,
  doStroke: boolean
): void {
  if (rings.length === 0) return;

  ctx.beginPath();

  for (const ring of rings) {
    if (ring.length < 3) continue;

    const transformed = transformCoords(ring, viewport);

    ctx.moveTo(transformed[0][0], transformed[0][1]);
    for (let i = 1; i < transformed.length; i++) {
      ctx.lineTo(transformed[i][0], transformed[i][1]);
    }
    ctx.closePath();
  }

  if (doFill) {
    ctx.fill('evenodd');
  }
  if (doStroke) {
    ctx.stroke();
  }
}

/**
 * Draw a single feature to canvas
 */
function drawFeature(
  ctx: CanvasRenderingContext2D,
  feature: GeoJSONFeature,
  viewport: Viewport,
  effectiveStyle: { stroke: string | null; fill: string | null; strokeWidth: number }
): void {
  const geom = feature.geometry;
  const doStroke = !!effectiveStyle.stroke;
  const doFill = !!effectiveStyle.fill;

  if (doStroke) {
    ctx.strokeStyle = effectiveStyle.stroke!;
    ctx.lineWidth = effectiveStyle.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  if (doFill) {
    ctx.fillStyle = effectiveStyle.fill!;
  }

  switch (geom.type) {
    case 'Point':
      // Draw a small circle
      if (doFill || doStroke) {
        const [x, y] = projectPoint(geom.coordinates[0], geom.coordinates[1]);
        const [sx, sy] = toSvgCoords(x, y, viewport);
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        if (doFill) ctx.fill();
        if (doStroke) ctx.stroke();
      }
      break;

    case 'LineString':
      if (doStroke) {
        drawLineString(ctx, geom.coordinates, viewport);
      }
      break;

    case 'MultiLineString':
      if (doStroke) {
        for (const line of geom.coordinates) {
          drawLineString(ctx, line, viewport);
        }
      }
      break;

    case 'Polygon':
      drawPolygon(ctx, geom.coordinates, viewport, doFill, doStroke);
      break;

    case 'MultiPolygon':
      for (const polygon of geom.coordinates) {
        drawPolygon(ctx, polygon, viewport, doFill, doStroke);
      }
      break;
  }
}

/**
 * Render a layer to canvas
 */
export function renderLayerToCanvas(
  ctx: CanvasRenderingContext2D,
  featureCollection: GeoJSONFeatureCollection,
  viewport: Viewport,
  style: LayerStyle,
  outputMode: OutputMode
): void {
  if (!style.visible) return;

  const effectiveStyle = getEffectiveStyle(style, outputMode);

  // Skip if nothing to draw
  if (!effectiveStyle.stroke && !effectiveStyle.fill) return;

  // Set global alpha for opacity
  ctx.globalAlpha = style.opacity;

  for (const feature of featureCollection.features) {
    drawFeature(ctx, feature, viewport, effectiveStyle);
  }

  // Reset alpha
  ctx.globalAlpha = 1;
}

/**
 * Clear and prepare canvas
 */
export function prepareCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backgroundColor?: string
): void {
  // Set canvas size
  ctx.canvas.width = width;
  ctx.canvas.height = height;

  // Clear
  ctx.clearRect(0, 0, width, height);

  // Fill background if specified
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
  }
}

/**
 * Render all layers to canvas in correct order
 */
export function renderAllLayers(
  ctx: CanvasRenderingContext2D,
  layers: Map<string, GeoJSONFeatureCollection>,
  viewport: Viewport,
  styles: Record<string, LayerStyle>,
  outputMode: OutputMode,
  layerOrder: string[] = ['land', 'water', 'parks', 'roads', 'railways']
): void {
  for (const layerName of layerOrder) {
    const fc = layers.get(layerName);
    const style = styles[layerName];

    if (fc && style) {
      renderLayerToCanvas(ctx, fc, viewport, style, outputMode);
    }
  }
}
