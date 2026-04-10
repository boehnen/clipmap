/**
 * Multi-LOD Tile Loader
 *
 * Fetches tiles from CDN with layer-specific LOD selection based on bbox extent.
 * Each layer has different LOD rules (filtering, simplification) defined in layerConfig.ts.
 */

import { BBox, LayerName } from '@/types';
import { computeBboxSpan, TileCoord } from './tileIndex';
import { getLayerConfig, selectLayerLOD, getAvailableLayers, LODConfig } from './layerConfig';

// GeoJSON types
export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: Record<string, any>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// In-memory tile cache
const tileCache = new Map<string, GeoJSONFeatureCollection>();

// Pending fetches to avoid duplicate requests
const pendingFetches = new Map<string, Promise<GeoJSONFeatureCollection>>();

// CDN base URL - configurable via env
const TILE_CDN_URL = process.env.NEXT_PUBLIC_TILE_CDN_URL || '/tiles';

/**
 * Get tile key for caching
 */
function getTileKey(layer: string, folder: string, coord: TileCoord): string {
  return `${layer}/${folder}/${coord.x}_${coord.y}`;
}

/**
 * Get tile URL
 */
function getTileUrl(layer: string, folder: string, coord: TileCoord, isWorld: boolean): string {
  if (isWorld) {
    return `${TILE_CDN_URL}/${layer}/world.json`;
  }
  return `${TILE_CDN_URL}/${layer}/${folder}/${coord.x}_${coord.y}.json`;
}

/**
 * Get tiles for a bbox at a specific tile size
 */
function getTilesForBbox(bbox: BBox, tileSize: number): TileCoord[] {
  const tiles: TileCoord[] = [];

  const tileStart = (value: number) => Math.floor(value / tileSize) * tileSize;

  const startX = tileStart(bbox.minLon);
  const endX = tileStart(bbox.maxLon - 1e-9);
  const startY = tileStart(bbox.minLat);
  const endY = tileStart(bbox.maxLat - 1e-9);

  for (let y = startY; y <= endY; y += tileSize) {
    for (let x = startX; x <= endX; x += tileSize) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}

/**
 * Fetch a single tile
 */
async function fetchTile(
  layer: string,
  folder: string,
  coord: TileCoord,
  isWorld: boolean = false
): Promise<GeoJSONFeatureCollection> {
  const key = isWorld ? `${layer}/world` : getTileKey(layer, folder, coord);

  // Check cache
  const cached = tileCache.get(key);
  if (cached) {
    return cached;
  }

  // Check if already fetching
  const pending = pendingFetches.get(key);
  if (pending) {
    return pending;
  }

  // Fetch from CDN
  const url = getTileUrl(layer, folder, coord, isWorld);

  const fetchPromise = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        if (response.status === 404) {
          // No data for this tile - return empty
          return { type: 'FeatureCollection' as const, features: [] };
        }
        throw new Error(`Failed to fetch tile: ${response.status}`);
      }
      return response.json() as Promise<GeoJSONFeatureCollection>;
    })
    .then((data) => {
      tileCache.set(key, data);
      pendingFetches.delete(key);
      return data;
    })
    .catch((err) => {
      pendingFetches.delete(key);
      console.warn(`Failed to load tile ${key}:`, err);
      // Return empty on error
      return { type: 'FeatureCollection' as const, features: [] };
    });

  pendingFetches.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * Load all tiles for a layer within a bounding box
 * Automatically selects appropriate LOD based on extent and layer type
 */
export async function loadLayerTiles(
  layer: LayerName,
  bbox: BBox
): Promise<GeoJSONFeatureCollection> {
  const config = getLayerConfig(layer);
  if (!config) {
    console.warn(`Layer ${layer} not configured`);
    return { type: 'FeatureCollection', features: [] };
  }

  const bboxSpan = computeBboxSpan(bbox);
  const lodOrWorld = selectLayerLOD(layer, bboxSpan);

  if (!lodOrWorld) {
    console.warn(`No LOD available for ${layer} at span ${bboxSpan.toFixed(1)}°`);
    return { type: 'FeatureCollection', features: [] };
  }

  // Handle world file
  if (lodOrWorld === 'world') {
    console.log(`Loading ${layer}: world file`);
    return fetchTile(layer, 'world', { x: 0, y: 0 }, true);
  }

  const lod = lodOrWorld as LODConfig;
  const tiles = getTilesForBbox(bbox, lod.tileSize);

  console.log(`Loading ${layer}: ${tiles.length} tiles @ ${lod.folder} (span: ${bboxSpan.toFixed(1)}°)`);

  // Fetch all tiles in parallel
  const tilePromises = tiles.map(coord =>
    fetchTile(layer, lod.folder, coord, false)
  );

  const tileData = await Promise.all(tilePromises);

  // Merge all features
  const allFeatures: GeoJSONFeature[] = [];
  for (const tile of tileData) {
    allFeatures.push(...tile.features);
  }

  return {
    type: 'FeatureCollection',
    features: allFeatures,
  };
}

/**
 * Load all layers for a bounding box
 */
export async function loadAllLayers(
  layers: LayerName[],
  bbox: BBox
): Promise<Map<LayerName, GeoJSONFeatureCollection>> {
  const result = new Map<LayerName, GeoJSONFeatureCollection>();

  // Fetch all layers in parallel
  const layerPromises = layers.map(async (layer) => {
    const data = await loadLayerTiles(layer, bbox);
    return { layer, data };
  });

  const layerData = await Promise.all(layerPromises);

  for (const { layer, data } of layerData) {
    result.set(layer, data);
  }

  return result;
}

/**
 * Preload tiles for a bounding box
 */
export async function preloadTiles(
  layers: LayerName[],
  bbox: BBox
): Promise<void> {
  await loadAllLayers(layers, bbox);
}

/**
 * Clear tile cache
 */
export function clearTileCache(): void {
  tileCache.clear();
}

/**
 * Get cache stats
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: tileCache.size,
    keys: Array.from(tileCache.keys()),
  };
}

/**
 * Get all available layers
 */
export { getAvailableLayers };
