/**
 * Multi-LOD Tile Index
 *
 * Matches backend baseTiles.ts logic:
 * - Select tile size based on bbox span
 * - Smaller extents = finer tiles (more detail)
 * - Larger extents = coarser tiles (faster loading)
 */

import { BBox } from '@/types';

// LOD configuration matching backend
export const TILE_LODS = [
  { maxSpan: 3, tileSize: 1, folder: '1deg' },
  { maxSpan: 15, tileSize: 5, folder: '5deg' },
  { maxSpan: 40, tileSize: 10, folder: '10deg' },
  { maxSpan: 90, tileSize: 20, folder: '20deg' },
  { maxSpan: Infinity, tileSize: 'world', folder: 'world' },
] as const;

export interface TileCoord {
  x: number;  // longitude of tile origin
  y: number;  // latitude of tile origin
}

export interface TileSet {
  tileSize: number | 'world';
  folder: string;
  tiles: TileCoord[];
}

/**
 * Compute normalized bbox span (accounts for latitude distortion)
 */
export function computeBboxSpan(bbox: BBox): number {
  const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
  const lonSpan = Math.abs(bbox.maxLon - bbox.minLon);
  const latMid = (bbox.maxLat + bbox.minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;
  return Math.max(latSpan, Math.abs(lonSpan * Math.cos(latMidRad)));
}

/**
 * Select appropriate LOD based on bbox extent
 */
export function selectLOD(bbox: BBox): typeof TILE_LODS[number] {
  const span = computeBboxSpan(bbox);
  for (const lod of TILE_LODS) {
    if (span <= lod.maxSpan) {
      return lod;
    }
  }
  return TILE_LODS[TILE_LODS.length - 1];
}

/**
 * Get tile start coordinate (snap to tile grid)
 */
function tileStart(value: number, tileSize: number): number {
  return Math.floor(value / tileSize) * tileSize;
}

/**
 * Get all tiles that intersect a bounding box at appropriate LOD
 */
export function getTilesForBbox(bbox: BBox): TileSet {
  const lod = selectLOD(bbox);

  if (lod.tileSize === 'world') {
    return {
      tileSize: 'world',
      folder: lod.folder,
      tiles: [{ x: 0, y: 0 }], // Single world tile
    };
  }

  const tileSize = lod.tileSize;
  const tiles: TileCoord[] = [];

  const startX = tileStart(bbox.minLon, tileSize);
  const endX = tileStart(bbox.maxLon - 1e-9, tileSize);
  const startY = tileStart(bbox.minLat, tileSize);
  const endY = tileStart(bbox.maxLat - 1e-9, tileSize);

  for (let y = startY; y <= endY; y += tileSize) {
    for (let x = startX; x <= endX; x += tileSize) {
      tiles.push({ x, y });
    }
  }

  return {
    tileSize,
    folder: lod.folder,
    tiles,
  };
}

/**
 * Get tile key for caching
 */
export function getTileKey(layer: string, folder: string, coord: TileCoord): string {
  return `${layer}/${folder}/${coord.x}_${coord.y}`;
}

/**
 * Get tile URL
 */
export function getTileUrl(
  baseUrl: string,
  layer: string,
  folder: string,
  coord: TileCoord,
  isWorld: boolean = false
): string {
  if (isWorld) {
    return `${baseUrl}/${layer}/world.json`;
  }
  return `${baseUrl}/${layer}/${folder}/${coord.x}_${coord.y}.json`;
}

/**
 * Get tile bounds
 */
export function getTileBounds(coord: TileCoord, tileSize: number): BBox {
  return {
    minLon: coord.x,
    maxLon: coord.x + tileSize,
    minLat: coord.y,
    maxLat: coord.y + tileSize,
  };
}
