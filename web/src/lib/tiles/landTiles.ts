/**
 * Land Tile Loader
 *
 * Fetches pre-computed land tiles from R2 CDN with multi-LOD support.
 * Land tiles are pre-computed as (tile_bbox - water).
 * If a land tile doesn't exist (404), it means full water coverage.
 */

import { BBox } from '@/types';
import { projectPoint } from '../geo/project';
import { GeoJSONFeatureCollection } from './tileLoader';

// R2 CDN URL for tiles
const TILES_CDN = process.env.NEXT_PUBLIC_TILE_CDN_URL ||
  'https://cdn.clipmap.io';

// LOD levels for land tiles (finest to coarsest)
// Selects based on normalized bbox span
// 20deg tiles use offset latitude grid (10, 30, 50... not 0, 20, 40...)
const LAND_LODS = [
  { folder: 'land-tiles-1deg', tileSize: 1, maxSpan: 2 },
  { folder: 'land-tiles-2.5deg', tileSize: 2.5, maxSpan: 6 },
  { folder: 'land-tiles-5deg', tileSize: 5, maxSpan: 15 },
  { folder: 'land-tiles-10deg', tileSize: 10, maxSpan: 35 },
  { folder: 'land-tiles-20deg', tileSize: 20, maxSpan: Infinity },
];

// In-memory tile cache (includes 404s as empty arrays)
const landTileCache = new Map<string, MultiPolygonMercator>();
const CACHE_MAX_SIZE = 500;

// Pending fetches to prevent duplicate requests
const pendingFetches = new Map<string, Promise<MultiPolygonMercator | null>>();

function cacheResult(url: string, mp: MultiPolygonMercator): void {
  if (landTileCache.size >= CACHE_MAX_SIZE) {
    const firstKey = landTileCache.keys().next().value;
    if (firstKey) landTileCache.delete(firstKey);
  }
  landTileCache.set(url, mp);
}

// Types
type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygonMercator = Polygon[];

interface GeoJSONGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
}

/**
 * Compute normalized bbox span (accounts for latitude distortion)
 */
function computeNormalizedSpan(bbox: BBox): number {
  const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
  const lonSpan = Math.abs(bbox.maxLon - bbox.minLon);
  const latMid = (bbox.maxLat + bbox.minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;
  return Math.max(latSpan, Math.abs(lonSpan * Math.cos(latMidRad)));
}

/**
 * Select appropriate tile size based on bbox span
 */
function selectTileSize(bboxSpan: number): number {
  for (const lod of LAND_LODS) {
    if (bboxSpan <= lod.maxSpan) {
      return lod.tileSize;
    }
  }
  return 20; // Default to coarsest
}

/**
 * Get tile start coordinate (snap to tile grid)
 * For 20deg tiles, latitude uses offset grid (10, 30, 50... not 0, 20, 40...)
 */
function tileStart(value: number, tileSize: number, isLatitude: boolean = false): number {
  if (tileSize === 20 && isLatitude) {
    // 20deg latitude tiles are offset by 10: -90, -70, -50, -30, -10, 10, 30, 50, 70
    return Math.floor((value - 10) / 20) * 20 + 10;
  }
  return Math.floor(value / tileSize) * tileSize;
}

/**
 * Format coordinate for tile filename
 * For 2.5deg tiles: uses decimal format like "12.5" or "12" for integers
 * For other tiles: uses integer format
 */
function formatCoord(val: number, tileSize: number): string {
  if (tileSize === 2.5) {
    // Round to nearest 0.5
    const rounded = Math.round(val * 2) / 2;
    // Use decimal format: -15 or 57.5
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
  return String(Math.floor(val));
}

/**
 * Get tile IDs for a bounding box
 */
function getTileIds(bbox: BBox, tileSize: number): string[] {
  const { minLat, minLon, maxLat, maxLon } = bbox;

  const startLon = tileStart(minLon, tileSize, false);
  const endLon = tileStart(maxLon - 1e-9, tileSize, false);
  const startLat = tileStart(minLat, tileSize, true);
  const endLat = tileStart(maxLat - 1e-9, tileSize, true);

  const ids: string[] = [];
  for (let lat = startLat; lat <= endLat; lat += tileSize) {
    for (let lon = startLon; lon <= endLon; lon += tileSize) {
      const lonStr = formatCoord(lon, tileSize);
      const latStr = formatCoord(lat, tileSize);
      ids.push(`${lonStr}_${latStr}`);
    }
  }
  return ids;
}

/**
 * Parse GeoJSON and convert to Web Mercator coordinates
 */
function parseGeoJSONToMercator(data: GeoJSONFeatureCollection): MultiPolygonMercator {
  const mp: MultiPolygonMercator = [];

  for (const feat of data.features) {
    if (!feat.geometry) continue;
    const geom = feat.geometry as unknown as GeoJSONGeometry;

    if (geom.type === 'Polygon') {
      const coords = geom.coordinates as number[][][];
      const poly: Polygon = coords.map((ring) =>
        ring.map(([lon, lat]) => projectPoint(lon, lat))
      );
      mp.push(poly);
    } else if (geom.type === 'MultiPolygon') {
      const coords = geom.coordinates as number[][][][];
      for (const polyCoords of coords) {
        const poly: Polygon = polyCoords.map((ring) =>
          ring.map(([lon, lat]) => projectPoint(lon, lat))
        );
        mp.push(poly);
      }
    }
  }

  return mp;
}

/**
 * Fetch a single land tile from R2
 */
async function fetchLandTile(url: string): Promise<MultiPolygonMercator | null> {
  // Check cache
  if (landTileCache.has(url)) {
    return landTileCache.get(url)!;
  }

  // Check pending
  if (pendingFetches.has(url)) {
    return pendingFetches.get(url)!;
  }

  const fetchPromise = (async (): Promise<MultiPolygonMercator | null> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404) {
          // Cache 404 as empty array to avoid re-fetching
          cacheResult(url, []);
          return null;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as GeoJSONFeatureCollection;
      const mp = parseGeoJSONToMercator(data);
      cacheResult(url, mp);

      return mp.length ? mp : null;
    } catch (err) {
      console.warn('Land tile fetch error:', url, err);
      return null;
    } finally {
      pendingFetches.delete(url);
    }
  })();

  pendingFetches.set(url, fetchPromise);
  return fetchPromise;
}

/**
 * Load land features for a bounding box from R2.
 * Returns MultiPolygon in Web Mercator coordinates.
 */
export async function loadLandTiles(bbox: BBox): Promise<MultiPolygonMercator> {
  const bboxSpan = computeNormalizedSpan(bbox);
  const tileSize = selectTileSize(bboxSpan);

  // Find matching LOD
  const lod = LAND_LODS.find(l => l.tileSize === tileSize);
  if (!lod) {
    console.error('Invalid tile size:', tileSize);
    return [];
  }

  const tileIds = getTileIds(bbox, tileSize);

  console.log(`[Land] Loading ${tileIds.length} tiles @ ${lod.folder} (span: ${bboxSpan.toFixed(3)}°, tiles: ${tileIds.join(', ')})`);

  // Fetch all tiles in parallel (direct paths to /land-tiles-{lod}/)
  const tileUrls = tileIds.map(id => `${TILES_CDN}/${lod.folder}/${id}.geojson`);
  const tileResults = await Promise.all(tileUrls.map(url => fetchLandTile(url)));

  // Combine all polygons
  const allPolygons: MultiPolygonMercator = [];
  for (const tileData of tileResults) {
    if (tileData) {
      allPolygons.push(...tileData);
    }
  }

  return allPolygons;
}

/**
 * Clear land tile cache
 */
export function clearLandTileCache(): void {
  landTileCache.clear();
  pendingFetches.clear();
}

/**
 * Get land tile cache stats
 */
export function getLandCacheStats(): { size: number; maxSize: number } {
  return {
    size: landTileCache.size,
    maxSize: CACHE_MAX_SIZE,
  };
}
