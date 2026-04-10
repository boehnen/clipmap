/**
 * Elevation Index - Client-side elevation lookup using pre-computed index
 *
 * Eliminates dependency on external OpenTopoData API by using
 * a pre-generated index of min/max elevation per 1° tile.
 */

import { BBox } from '@/types';

export interface ElevationTileData {
  min: number;
  max: number;
}

export interface ElevationIndex {
  version: number;
  resolution: number;
  bounds: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  tiles: Record<string, ElevationTileData>;
}

export interface ElevationRange {
  min: number;
  max: number;
}

// CDN URL for elevation index
const TILE_CDN_URL = process.env.NEXT_PUBLIC_TILE_CDN_URL || '/tiles';
const INDEX_URL = `${TILE_CDN_URL}/elevation-index.json`;

// Cached index
let cachedIndex: ElevationIndex | null = null;
let indexPromise: Promise<ElevationIndex | null> | null = null;

/**
 * Load the elevation index (cached after first load)
 */
export async function loadElevationIndex(): Promise<ElevationIndex | null> {
  // Return cached
  if (cachedIndex) {
    return cachedIndex;
  }

  // Return pending promise if already loading
  if (indexPromise) {
    return indexPromise;
  }

  // Fetch and cache
  indexPromise = fetch(INDEX_URL)
    .then(async (response) => {
      if (!response.ok) {
        console.warn(`Elevation index not found: ${response.status}`);
        return null;
      }
      const data = await response.json();
      cachedIndex = data;
      return data;
    })
    .catch((error) => {
      console.warn('Failed to load elevation index:', error);
      return null;
    })
    .finally(() => {
      indexPromise = null;
    });

  return indexPromise;
}

/**
 * Get tile key for a coordinate
 */
function getTileKey(lon: number, lat: number): string {
  const tileLon = Math.floor(lon);
  const tileLat = Math.floor(lat);
  return `${tileLon}_${tileLat}`;
}

/**
 * Get all tile keys that intersect a bounding box
 */
function getTileKeysForBbox(bbox: BBox): string[] {
  const keys: string[] = [];

  const minLon = Math.floor(bbox.minLon);
  const maxLon = Math.floor(bbox.maxLon);
  const minLat = Math.floor(bbox.minLat);
  const maxLat = Math.floor(bbox.maxLat);

  for (let lon = minLon; lon <= maxLon; lon++) {
    for (let lat = minLat; lat <= maxLat; lat++) {
      keys.push(getTileKey(lon, lat));
    }
  }

  return keys;
}

/**
 * Get elevation range for a bounding box using the pre-computed index
 *
 * Returns null if index is not available or no data for the area.
 */
export async function getElevationRangeFromIndex(
  bbox: BBox
): Promise<ElevationRange | null> {
  const index = await loadElevationIndex();

  if (!index) {
    return null;
  }

  const tileKeys = getTileKeysForBbox(bbox);

  let globalMin = Infinity;
  let globalMax = -Infinity;
  let hasData = false;

  for (const key of tileKeys) {
    const tileData = index.tiles[key];
    if (tileData) {
      hasData = true;
      globalMin = Math.min(globalMin, tileData.min);
      globalMax = Math.max(globalMax, tileData.max);
    }
  }

  if (!hasData) {
    return null;
  }

  return {
    min: globalMin,
    max: globalMax,
  };
}

/**
 * Get elevation range with fallback to API
 *
 * Tries index first, falls back to OpenTopoData API if index unavailable.
 */
export async function getElevationRange(
  bbox: BBox
): Promise<ElevationRange> {
  // Try index first
  const indexResult = await getElevationRangeFromIndex(bbox);
  if (indexResult) {
    return indexResult;
  }

  // Fallback to API
  console.warn('Elevation index unavailable, falling back to API');
  const { getElevationRangeFromAPI } = await import('./elevationBands');

  try {
    return await getElevationRangeFromAPI(bbox);
  } catch (error) {
    // Final fallback: return reasonable defaults
    console.warn('Elevation API failed, using defaults');
    return { min: 0, max: 500 };
  }
}

/**
 * Preload the elevation index (call early to warm cache)
 */
export function preloadElevationIndex(): void {
  loadElevationIndex();
}

/**
 * Check if elevation index is loaded
 */
export function isElevationIndexLoaded(): boolean {
  return cachedIndex !== null;
}

/**
 * Get stats about the loaded index
 */
export function getElevationIndexStats(): {
  loaded: boolean;
  tileCount: number;
  bounds: ElevationIndex['bounds'] | null;
} | null {
  if (!cachedIndex) {
    return null;
  }

  return {
    loaded: true,
    tileCount: Object.keys(cachedIndex.tiles).length,
    bounds: cachedIndex.bounds,
  };
}
