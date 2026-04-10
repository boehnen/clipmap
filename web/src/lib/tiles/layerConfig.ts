/**
 * Layer-specific LOD Configuration
 *
 * Each layer has different characteristics:
 * - Water: Complex polygons, needs aggressive simplification at coarse LODs
 * - Roads: Dense lines, needs filtering by road class at coarse LODs
 * - Parks: Medium polygons, needs size filtering
 * - Railways: Sparse lines, minimal LOD needed
 * - Boundaries: Sparse lines, admin level filtering
 * - Places: Points, population filtering
 */

import { LayerName } from '@/types';

export interface LODConfig {
  folder: string;           // Tile folder name
  tileSize: number;         // Tile size in degrees
  maxSpan: number;          // Max bbox span for this LOD
  simplifyTolerance?: number; // Douglas-Peucker tolerance in degrees
  filter?: string;          // Feature filter expression
}

export interface LayerLODConfig {
  name: LayerName;
  geometryType: 'Polygon' | 'LineString' | 'Point';
  lods: LODConfig[];
  worldFile?: string;       // Optional world-scale file
}

/**
 * Simplification tolerances (proven values from existing water tiles)
 * These are in degrees (EPSG:4326)
 * At equator: 0.00008° ≈ 9m, 0.0002° ≈ 22m, 0.0005° ≈ 55m
 */
const SIMPLIFY = {
  '1deg': 0,         // Full detail
  '5deg': 0.00008,   // Light simplification (~9m at equator)
  '10deg': 0.0002,   // Medium simplification (~22m at equator)
  '20deg': 0.0005,   // Heavy simplification (~55m at equator)
  'world': 0.001,    // World file (~111m at equator)
};

/**
 * LOD configuration for each layer
 */
export const LAYER_CONFIGS: LayerLODConfig[] = [
  // Water: Complex coastlines need multiple LODs with simplification
  {
    name: 'water',
    geometryType: 'Polygon',
    worldFile: 'world.json',
    lods: [
      { folder: '20deg', tileSize: 20, maxSpan: 90, simplifyTolerance: SIMPLIFY['20deg'] },
      { folder: '10deg', tileSize: 10, maxSpan: 40, simplifyTolerance: SIMPLIFY['10deg'] },
      { folder: '5deg', tileSize: 5, maxSpan: 15, simplifyTolerance: SIMPLIFY['5deg'] },
      { folder: '1deg', tileSize: 1, maxSpan: 3, simplifyTolerance: SIMPLIFY['1deg'] },
    ],
  },

  // Roads: Dense network needs class filtering at coarse LODs
  {
    name: 'roads',
    geometryType: 'LineString',
    lods: [
      // No world-scale roads (too dense, not useful)
      { folder: '10deg', tileSize: 10, maxSpan: 40, filter: 'highway IN (motorway, trunk)' },
      { folder: '5deg', tileSize: 5, maxSpan: 15, filter: 'highway IN (motorway, trunk, primary)' },
      { folder: '1deg', tileSize: 1, maxSpan: 3 }, // All roads
    ],
  },

  // Parks: Size-based filtering
  {
    name: 'parks',
    geometryType: 'Polygon',
    lods: [
      { folder: '10deg', tileSize: 10, maxSpan: 40, filter: 'area > 100000000' }, // >100 km²
      { folder: '5deg', tileSize: 5, maxSpan: 15, filter: 'area > 10000000' },   // >10 km²
      { folder: '1deg', tileSize: 1, maxSpan: 3 }, // All parks
    ],
  },

  // Railways: Type filtering
  {
    name: 'railways',
    geometryType: 'LineString',
    lods: [
      { folder: '10deg', tileSize: 10, maxSpan: 40, filter: 'railway = rail' },
      { folder: '5deg', tileSize: 5, maxSpan: 15, filter: 'railway IN (rail, subway)' },
      { folder: '1deg', tileSize: 1, maxSpan: 3 }, // All railways
    ],
  },

  // Ferries: Sparse, single LOD is fine
  {
    name: 'ferries',
    geometryType: 'LineString',
    lods: [
      { folder: '5deg', tileSize: 5, maxSpan: 40 },
      { folder: '1deg', tileSize: 1, maxSpan: 3 },
    ],
  },

  // Boundaries: Admin level filtering
  {
    name: 'boundaries',
    geometryType: 'LineString',
    worldFile: 'world.json', // Country borders
    lods: [
      { folder: '10deg', tileSize: 10, maxSpan: 40, filter: 'admin_level <= 4' }, // Countries, states
      { folder: '5deg', tileSize: 5, maxSpan: 15, filter: 'admin_level <= 6' },   // + Counties
      { folder: '1deg', tileSize: 1, maxSpan: 3 }, // All boundaries
    ],
  },

  // Places/Labels: Removed for now
  // Population-based filtering is difficult with only 5 LODs
  // Would need collision detection for proper label placement
  // TODO: Revisit if needed

  // Contours: Only useful at local scale
  {
    name: 'contours',
    geometryType: 'LineString',
    lods: [
      { folder: '5deg', tileSize: 5, maxSpan: 15, filter: 'elevation % 500 = 0' }, // 500m intervals
      { folder: '1deg', tileSize: 1, maxSpan: 3, filter: 'elevation % 100 = 0' },  // 100m intervals
    ],
  },

  // Elevation bands: Only useful at local scale for physical maps
  {
    name: 'elevation',
    geometryType: 'Polygon',
    lods: [
      { folder: '5deg', tileSize: 5, maxSpan: 15 },
      { folder: '1deg', tileSize: 1, maxSpan: 3 },
    ],
  },
];

/**
 * Get LOD config for a layer
 */
export function getLayerConfig(layer: LayerName): LayerLODConfig | undefined {
  return LAYER_CONFIGS.find(c => c.name === layer);
}

/**
 * Select appropriate LOD for a layer given bbox span
 */
export function selectLayerLOD(layer: LayerName, bboxSpan: number): LODConfig | 'world' | null {
  const config = getLayerConfig(layer);
  if (!config) return null;

  // Check if world file is appropriate
  if (config.worldFile && bboxSpan > 90) {
    return 'world';
  }

  // Find appropriate LOD
  for (const lod of config.lods) {
    if (bboxSpan <= lod.maxSpan) {
      return lod;
    }
  }

  // Use coarsest available LOD
  return config.lods[0] || null;
}

/**
 * Get all available layers
 */
export function getAvailableLayers(): LayerName[] {
  return LAYER_CONFIGS.map(c => c.name);
}
