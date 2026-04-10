/**
 * Shared configuration for tile generation
 */

export const TILE_CONFIG = {
  // Tile size in degrees
  tileSize: 1.0,

  // Layers to generate (no buildings)
  layers: ['water', 'roads', 'parks', 'railways'] as const,

  // Zoom levels
  // z0 = full detail, z1 = simplified for preview
  zoomLevels: [0, 1] as const,

  // Simplification tolerance (in degrees) per zoom level
  simplifyTolerance: {
    0: 0.0001,  // ~10m at equator
    1: 0.001,   // ~100m at equator
  } as Record<number, number>,

  // Output directory
  outputDir: './tiles',

  // Overpass endpoints for batch generation
  overpassEndpoints: [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],

  // Delay between Overpass requests (ms)
  overpassDelayMs: 2000,

  // Geographic bounds to generate (start small for testing)
  bounds: {
    // New York metro area for testing
    test: {
      minLon: -74.5,
      maxLon: -73.5,
      minLat: 40.4,
      maxLat: 41.0,
    },
    // North America
    northAmerica: {
      minLon: -170,
      maxLon: -50,
      minLat: 15,
      maxLat: 75,
    },
    // Europe
    europe: {
      minLon: -25,
      maxLon: 45,
      minLat: 35,
      maxLat: 72,
    },
    // World
    world: {
      minLon: -180,
      maxLon: 180,
      minLat: -85,
      maxLat: 85,
    },
  },
};

export type LayerName = typeof TILE_CONFIG.layers[number];
export type ZoomLevel = typeof TILE_CONFIG.zoomLevels[number];

/**
 * Get tile coordinates for a given lon/lat
 */
export function getTileCoords(lon: number, lat: number): { x: number; y: number } {
  const x = Math.floor(lon / TILE_CONFIG.tileSize) * TILE_CONFIG.tileSize;
  const y = Math.floor(lat / TILE_CONFIG.tileSize) * TILE_CONFIG.tileSize;
  return { x, y };
}

/**
 * Get tile filename
 */
export function getTileFilename(layer: LayerName, zoom: ZoomLevel, x: number, y: number): string {
  return `${layer}/${zoom}/${x}_${y}.json`;
}

/**
 * Get all tiles for a bounding box
 */
export function getTilesForBounds(bounds: {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}): Array<{ x: number; y: number }> {
  const tiles: Array<{ x: number; y: number }> = [];
  const size = TILE_CONFIG.tileSize;

  const startX = Math.floor(bounds.minLon / size) * size;
  const endX = Math.floor(bounds.maxLon / size) * size;
  const startY = Math.floor(bounds.minLat / size) * size;
  const endY = Math.floor(bounds.maxLat / size) * size;

  for (let y = startY; y <= endY; y += size) {
    for (let x = startX; x <= endX; x += size) {
      tiles.push({ x, y });
    }
  }

  return tiles;
}

/**
 * OSM tag filters for each layer
 */
export const LAYER_FILTERS = {
  water: {
    // Inland water features (ocean comes from separate tiles)
    tags: [
      { key: 'natural', value: 'water' },
      { key: 'waterway', value: 'riverbank' },
      { key: 'landuse', value: 'reservoir' },
      { key: 'landuse', value: 'basin' },
    ],
    geometryTypes: ['way', 'relation'],
  },
  roads: {
    tags: [
      { key: 'highway', values: [
        'motorway', 'motorway_link',
        'trunk', 'trunk_link',
        'primary', 'primary_link',
        'secondary', 'secondary_link',
        'tertiary', 'tertiary_link',
        'residential', 'unclassified',
      ]},
    ],
    geometryTypes: ['way'],
  },
  parks: {
    tags: [
      { key: 'leisure', value: 'park' },
      { key: 'leisure', value: 'garden' },
      { key: 'leisure', value: 'nature_reserve' },
      { key: 'landuse', value: 'forest' },
      { key: 'landuse', value: 'grass' },
      { key: 'landuse', value: 'meadow' },
      { key: 'natural', value: 'wood' },
    ],
    geometryTypes: ['way', 'relation'],
  },
  railways: {
    tags: [
      { key: 'railway', value: 'rail' },
      { key: 'railway', value: 'subway' },
      { key: 'railway', value: 'light_rail' },
      { key: 'railway', value: 'tram' },
    ],
    geometryTypes: ['way'],
  },
} as const;
