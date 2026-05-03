/**
 * Generate SVG previews for location preset cards
 * Uses a coarse LOD and caches results for performance
 */

import { BBox } from '@/types';
import { projectPoint, toSvgCoords } from '../geo/project';

const TILES_CDN = process.env.NEXT_PUBLIC_TILE_CDN_URL || 'https://cdn.clipmap.io';

// Use 1-degree tiles for accurate previews (finer than 5deg but still fast)
const PREVIEW_LOD = 'land-tiles-1deg';
const WATER_LOD = 'water-tiles-1deg';

export interface PreviewData {
  viewBox: string;
  landPath: string;
  waterPath: string;
  width: number;
  height: number;
}

// Cache previews in memory
const previewCache = new Map<string, PreviewData>();

// Tile data cache to avoid re-fetching
const tileCache = new Map<string, number[][][] | null>();

function getBboxKey(bbox: BBox): string {
  return `${bbox.minLon.toFixed(2)},${bbox.minLat.toFixed(2)},${bbox.maxLon.toFixed(2)},${bbox.maxLat.toFixed(2)}`;
}

export function getCachedPreview(bbox: BBox): PreviewData | null {
  return previewCache.get(getBboxKey(bbox)) || null;
}

async function fetchTile(url: string): Promise<number[][][] | null> {
  if (tileCache.has(url)) {
    return tileCache.get(url) || null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      tileCache.set(url, null);
      return null;
    }
    const data = await response.json();
    const polygons: number[][][] = [];

    for (const feat of data.features || []) {
      if (!feat.geometry) continue;
      const geom = feat.geometry;

      if (geom.type === 'Polygon') {
        polygons.push(geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          polygons.push(poly[0]);
        }
      }
    }

    tileCache.set(url, polygons);
    return polygons;
  } catch {
    tileCache.set(url, null);
    return null;
  }
}

function getTileIds(bbox: BBox, tileSize: number): string[] {
  const startLon = Math.floor(bbox.minLon / tileSize) * tileSize;
  const endLon = Math.floor((bbox.maxLon - 0.001) / tileSize) * tileSize;
  const startLat = Math.floor(bbox.minLat / tileSize) * tileSize;
  const endLat = Math.floor((bbox.maxLat - 0.001) / tileSize) * tileSize;

  const ids: string[] = [];
  for (let lat = startLat; lat <= endLat; lat += tileSize) {
    for (let lon = startLon; lon <= endLon; lon += tileSize) {
      ids.push(`${lon}_${lat}`);
    }
  }
  return ids;
}

function polygonsToPath(
  polygons: number[][][],
  viewport: { minX: number; maxY: number; scale: number },
  bbox: BBox
): string {
  const parts: string[] = [];

  // Expand bbox for filtering (generous padding to catch all relevant polygons)
  const pad = 1.0; // degrees - large enough to catch polygon edges
  const filterMinLon = bbox.minLon - pad;
  const filterMaxLon = bbox.maxLon + pad;
  const filterMinLat = bbox.minLat - pad;
  const filterMaxLat = bbox.maxLat + pad;

  for (const ring of polygons) {
    if (ring.length < 3) continue;

    // Calculate polygon bounding box and check intersection with filter bbox
    let polyMinLon = Infinity, polyMaxLon = -Infinity;
    let polyMinLat = Infinity, polyMaxLat = -Infinity;

    for (const [lon, lat] of ring) {
      polyMinLon = Math.min(polyMinLon, lon);
      polyMaxLon = Math.max(polyMaxLon, lon);
      polyMinLat = Math.min(polyMinLat, lat);
      polyMaxLat = Math.max(polyMaxLat, lat);
    }

    // Check if polygon bbox intersects filter bbox
    const intersects = !(
      polyMaxLon < filterMinLon ||
      polyMinLon > filterMaxLon ||
      polyMaxLat < filterMinLat ||
      polyMinLat > filterMaxLat
    );

    if (!intersects) continue;

    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      const [mx, my] = projectPoint(lon, lat);
      const [sx, sy] = toSvgCoords(mx, my, viewport);
      parts.push(i === 0 ? `M${sx.toFixed(1)},${sy.toFixed(1)}` : `L${sx.toFixed(1)},${sy.toFixed(1)}`);
    }
    parts.push('Z');
  }

  return parts.join('');
}

export async function generatePreview(bbox: BBox): Promise<PreviewData> {
  const key = getBboxKey(bbox);

  // Return cached if available
  if (previewCache.has(key)) {
    return previewCache.get(key)!;
  }

  // Calculate viewport - use fixed 4:3 aspect ratio to match card
  const [minX, minY] = projectPoint(bbox.minLon, bbox.minLat);
  const [maxX, maxY] = projectPoint(bbox.maxLon, bbox.maxLat);
  const projWidth = maxX - minX;
  const projHeight = maxY - minY;

  // Fixed card dimensions (4:3 aspect ratio)
  const cardWidth = 200;
  const cardHeight = 150; // 4:3 ratio

  // Calculate scale to fit bbox in card, then adjust viewport to fill card
  const bboxAspect = projWidth / projHeight;
  const cardAspect = cardWidth / cardHeight; // 4/3 = 1.333

  // Adjust viewport to match 4:3 aspect ratio while centering the bbox content
  let viewMinX: number;
  let viewMaxY: number;
  let viewWidth: number;

  if (bboxAspect > cardAspect) {
    // Bbox is wider than card - expand height to match aspect ratio
    viewWidth = projWidth;
    const viewHeight = projWidth / cardAspect;
    const heightDiff = (viewHeight - projHeight) / 2;
    viewMinX = minX;
    viewMaxY = maxY + heightDiff;
  } else {
    // Bbox is taller than card - expand width to match aspect ratio
    viewWidth = projHeight * cardAspect;
    const widthDiff = (viewWidth - projWidth) / 2;
    viewMinX = minX - widthDiff;
    viewMaxY = maxY;
  }

  const scale = cardWidth / viewWidth;
  const viewport = { minX: viewMinX, maxY: viewMaxY, scale };

  // Fetch tiles in parallel (1-degree tiles)
  const tileIds = getTileIds(bbox, 1);

  const [landResults, waterResults] = await Promise.all([
    Promise.all(tileIds.map(id => fetchTile(`${TILES_CDN}/${PREVIEW_LOD}/${id}.geojson`))),
    Promise.all(tileIds.map(id => fetchTile(`${TILES_CDN}/${WATER_LOD}/${id}.geojson`))),
  ]);

  // Combine polygons
  const landPolygons: number[][][] = [];
  const waterPolygons: number[][][] = [];

  for (const polys of landResults) {
    if (polys) landPolygons.push(...polys);
  }
  for (const polys of waterResults) {
    if (polys) waterPolygons.push(...polys);
  }

  // Generate paths (filtered to bbox area)
  const landPath = polygonsToPath(landPolygons, viewport, bbox);
  const waterPath = polygonsToPath(waterPolygons, viewport, bbox);

  const preview: PreviewData = {
    viewBox: `0 0 ${cardWidth} ${cardHeight}`,
    landPath,
    waterPath,
    width: cardWidth,
    height: cardHeight,
  };

  previewCache.set(key, preview);
  return preview;
}
