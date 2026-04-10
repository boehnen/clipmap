/**
 * Generate vector tiles by querying Overpass API
 *
 * This is for testing/small regions. For production, use PBF-based generation.
 *
 * Usage:
 *   npx ts-node scripts/generate-tiles-overpass.ts --region=test --layer=roads
 *   npx ts-node scripts/generate-tiles-overpass.ts --region=test --all
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TILE_CONFIG,
  getTilesForBounds,
  getTileFilename,
  LAYER_FILTERS,
  LayerName,
  ZoomLevel,
} from './tile-config';

// Simple GeoJSON types
interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
    coordinates: any;
  };
  properties: Record<string, any>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

// Parse command line args
const args = process.argv.slice(2);
const regionArg = args.find(a => a.startsWith('--region='))?.split('=')[1] || 'test';
const layerArg = args.find(a => a.startsWith('--layer='))?.split('=')[1];
const allLayers = args.includes('--all');

if (!layerArg && !allLayers) {
  console.log('Usage: npx ts-node scripts/generate-tiles-overpass.ts --region=test --layer=roads');
  console.log('   or: npx ts-node scripts/generate-tiles-overpass.ts --region=test --all');
  console.log('');
  console.log('Regions:', Object.keys(TILE_CONFIG.bounds).join(', '));
  console.log('Layers:', TILE_CONFIG.layers.join(', '));
  process.exit(1);
}

const bounds = TILE_CONFIG.bounds[regionArg as keyof typeof TILE_CONFIG.bounds];
if (!bounds) {
  console.error(`Unknown region: ${regionArg}`);
  console.error('Available regions:', Object.keys(TILE_CONFIG.bounds).join(', '));
  process.exit(1);
}

const layersToGenerate: LayerName[] = allLayers
  ? [...TILE_CONFIG.layers]
  : [layerArg as LayerName];

/**
 * Build Overpass query for a tile
 */
function buildOverpassQuery(
  layer: LayerName,
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): string {
  const filters = LAYER_FILTERS[layer];
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;

  let expressions: string[] = [];

  for (const tagFilter of filters.tags) {
    const key = tagFilter.key;

    if ('value' in tagFilter) {
      // Single value
      for (const geomType of filters.geometryTypes) {
        expressions.push(`${geomType}["${key}"="${tagFilter.value}"](${bbox});`);
      }
    } else if ('values' in tagFilter) {
      // Multiple values
      const valueRegex = tagFilter.values.join('|');
      for (const geomType of filters.geometryTypes) {
        expressions.push(`${geomType}["${key}"~"^(${valueRegex})$"](${bbox});`);
      }
    }
  }

  return `
    [out:json][timeout:60];
    (
      ${expressions.join('\n      ')}
    );
    (._;>;);
    out body;
  `;
}

/**
 * Parse Overpass response to GeoJSON
 */
function parseOverpassToGeoJSON(data: any, layer: LayerName): GeoJSONFeatureCollection {
  const features: GeoJSONFeature[] = [];
  const nodes = new Map<number, [number, number]>();

  // First pass: collect all nodes
  for (const el of data.elements || []) {
    if (el.type === 'node') {
      nodes.set(el.id, [el.lon, el.lat]);
    }
  }

  // Second pass: process ways
  for (const el of data.elements || []) {
    if (el.type === 'way' && el.nodes) {
      const coords: [number, number][] = [];

      for (const nodeId of el.nodes) {
        const node = nodes.get(nodeId);
        if (node) {
          coords.push(node);
        }
      }

      if (coords.length < 2) continue;

      // Determine if this is a closed polygon or a line
      const isClosed = coords.length > 3 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      // Parks and water are polygons, roads and railways are lines
      const isPolygonLayer = layer === 'water' || layer === 'parks';

      if (isPolygonLayer && isClosed) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
          properties: el.tags || {},
        });
      } else {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
          properties: el.tags || {},
        });
      }
    }
  }

  // TODO: Handle relations (multipolygons) for water/parks

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Simplify GeoJSON using Douglas-Peucker
 * Simple implementation - for production, use @turf/simplify
 */
function simplifyGeoJSON(
  geojson: GeoJSONFeatureCollection,
  tolerance: number
): GeoJSONFeatureCollection {
  // For now, just return as-is
  // TODO: Implement simplification or use turf
  return geojson;
}

/**
 * Fetch with retry and delay
 */
async function fetchOverpass(query: string, retries = 3): Promise<any> {
  const endpoints = TILE_CONFIG.overpassEndpoints;

  for (let attempt = 0; attempt < retries; attempt++) {
    const endpoint = endpoints[attempt % endpoints.length];

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.log(`  Rate limited, waiting 10s...`);
          await sleep(10000);
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      console.log(`  Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt < retries - 1) {
        await sleep(2000);
      }
    }
  }

  throw new Error('All retries failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ensure directory exists
 */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate tiles for a layer
 */
async function generateLayerTiles(layer: LayerName) {
  console.log(`\n=== Generating ${layer} tiles ===`);

  const tiles = getTilesForBounds(bounds);
  console.log(`Region: ${regionArg} (${bounds.minLon},${bounds.minLat} to ${bounds.maxLon},${bounds.maxLat})`);
  console.log(`Tiles to generate: ${tiles.length}`);

  const outputBase = path.join(TILE_CONFIG.outputDir, layer);

  for (const zoom of TILE_CONFIG.zoomLevels) {
    ensureDir(path.join(outputBase, String(zoom)));
  }

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const tile of tiles) {
    const z0Path = path.join(outputBase, '0', `${tile.x}_${tile.y}.json`);

    // Skip if already exists
    if (fs.existsSync(z0Path)) {
      skipped++;
      continue;
    }

    const minLon = tile.x;
    const maxLon = tile.x + TILE_CONFIG.tileSize;
    const minLat = tile.y;
    const maxLat = tile.y + TILE_CONFIG.tileSize;

    console.log(`  Tile ${tile.x},${tile.y} (${completed + 1}/${tiles.length - skipped})...`);

    try {
      const query = buildOverpassQuery(layer, minLat, minLon, maxLat, maxLon);
      const data = await fetchOverpass(query);
      const geojson = parseOverpassToGeoJSON(data, layer);

      // Write z0 (full detail)
      fs.writeFileSync(z0Path, JSON.stringify(geojson));

      // Write z1 (simplified)
      const simplified = simplifyGeoJSON(geojson, TILE_CONFIG.simplifyTolerance[1]);
      const z1Path = path.join(outputBase, '1', `${tile.x}_${tile.y}.json`);
      fs.writeFileSync(z1Path, JSON.stringify(simplified));

      console.log(`    ✓ ${geojson.features.length} features`);
      completed++;

      // Delay between requests
      await sleep(TILE_CONFIG.overpassDelayMs);
    } catch (err: any) {
      console.log(`    ✗ Failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${layer} complete: ${completed} generated, ${skipped} skipped, ${failed} failed`);
}

/**
 * Main
 */
async function main() {
  console.log('=== Vector Tile Generator (Overpass) ===\n');

  ensureDir(TILE_CONFIG.outputDir);

  for (const layer of layersToGenerate) {
    if (!TILE_CONFIG.layers.includes(layer)) {
      console.error(`Unknown layer: ${layer}`);
      continue;
    }

    await generateLayerTiles(layer);
  }

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
