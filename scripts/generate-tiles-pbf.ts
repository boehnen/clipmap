/**
 * Generate vector tiles from OSM PBF data
 *
 * Prerequisites:
 *   - osmium-tool: https://osmcode.org/osmium-tool/
 *   - GDAL (ogr2ogr): https://gdal.org/
 *
 * Data sources:
 *   - Geofabrik: https://download.geofabrik.de/
 *   - Planet: https://planet.openstreetmap.org/
 *
 * Usage:
 *   npx ts-node scripts/generate-tiles-pbf.ts --input north-america-latest.osm.pbf --output ./tiles
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const TILE_SIZE = 1.0; // 1 degree tiles
const LAYERS = ['water', 'roads', 'parks', 'railways'] as const;

// OSM tag filters for each layer
const LAYER_FILTERS: Record<typeof LAYERS[number], string[]> = {
  water: [
    'natural=water',
    'water=*',
    'waterway=riverbank',
    'waterway=river',
    'waterway=stream',
    'waterway=canal',
    'landuse=reservoir',
    'landuse=basin',
    'natural=coastline',
  ],
  roads: [
    'highway=motorway',
    'highway=trunk',
    'highway=primary',
    'highway=secondary',
    'highway=tertiary',
    'highway=residential',
    'highway=unclassified',
    'highway=service',
    'highway=living_street',
    'highway=pedestrian',
    'highway=track',
    'highway=path',
    'highway=footway',
    'highway=cycleway',
  ],
  parks: [
    'leisure=park',
    'leisure=garden',
    'leisure=nature_reserve',
    'landuse=forest',
    'landuse=grass',
    'landuse=meadow',
    'landuse=recreation_ground',
    'natural=wood',
    'boundary=national_park',
  ],
  railways: [
    'railway=rail',
    'railway=subway',
    'railway=light_rail',
    'railway=tram',
    'railway=monorail',
  ],
};

// Geometry types to extract for each layer
const LAYER_GEOMETRY: Record<typeof LAYERS[number], string[]> = {
  water: ['multipolygons', 'lines'], // coastlines are lines
  roads: ['lines'],
  parks: ['multipolygons'],
  railways: ['lines'],
};

interface TileCoord {
  lon: number;
  lat: number;
}

function getTileBounds(coord: TileCoord): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  return {
    minLon: coord.lon,
    minLat: coord.lat,
    maxLon: coord.lon + TILE_SIZE,
    maxLat: coord.lat + TILE_SIZE,
  };
}

function checkDependencies(): void {
  try {
    execSync('osmium --version', { stdio: 'pipe' });
    console.log('✓ osmium-tool found');
  } catch {
    console.error('✗ osmium-tool not found. Install from: https://osmcode.org/osmium-tool/');
    process.exit(1);
  }

  try {
    execSync('ogr2ogr --version', { stdio: 'pipe' });
    console.log('✓ GDAL (ogr2ogr) found');
  } catch {
    console.error('✗ GDAL not found. Install from: https://gdal.org/');
    process.exit(1);
  }
}

function extractLayer(
  inputPbf: string,
  layer: typeof LAYERS[number],
  outputDir: string
): string {
  const filters = LAYER_FILTERS[layer];
  const outputPbf = path.join(outputDir, `${layer}.osm.pbf`);

  console.log(`\nExtracting ${layer}...`);

  // Build osmium filter command
  const filterArgs = filters.join(' ');
  const cmd = `osmium tags-filter "${inputPbf}" ${filterArgs} -o "${outputPbf}" --overwrite`;

  console.log(`  Running: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });

  return outputPbf;
}

function pbfToGeoJSON(
  inputPbf: string,
  layer: typeof LAYERS[number],
  outputDir: string
): string[] {
  const geometryTypes = LAYER_GEOMETRY[layer];
  const outputs: string[] = [];

  for (const geomType of geometryTypes) {
    const outputJson = path.join(outputDir, `${layer}_${geomType}.geojson`);

    console.log(`  Converting ${layer} ${geomType} to GeoJSON...`);

    // ogr2ogr command to convert PBF to GeoJSON
    const cmd = `ogr2ogr -f GeoJSON "${outputJson}" "${inputPbf}" ${geomType} -skipfailures`;

    try {
      execSync(cmd, { stdio: 'pipe' });
      if (fs.existsSync(outputJson)) {
        outputs.push(outputJson);
      }
    } catch (err) {
      console.log(`    Warning: No ${geomType} found for ${layer}`);
    }
  }

  return outputs;
}

function tileGeoJSON(
  inputFiles: string[],
  layer: typeof LAYERS[number],
  outputDir: string,
  bounds?: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): void {
  console.log(`\nTiling ${layer}...`);

  // Read and merge all input files
  const allFeatures: any[] = [];

  for (const inputFile of inputFiles) {
    const content = fs.readFileSync(inputFile, 'utf-8');
    const geojson = JSON.parse(content);
    if (geojson.features) {
      allFeatures.push(...geojson.features);
    }
  }

  console.log(`  Total features: ${allFeatures.length}`);

  // Determine bounds from data if not specified
  if (!bounds) {
    let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;

    for (const feature of allFeatures) {
      const bbox = getBBox(feature.geometry);
      if (bbox) {
        minLon = Math.min(minLon, bbox.minLon);
        minLat = Math.min(minLat, bbox.minLat);
        maxLon = Math.max(maxLon, bbox.maxLon);
        maxLat = Math.max(maxLat, bbox.maxLat);
      }
    }

    bounds = { minLon, minLat, maxLon, maxLat };
  }

  console.log(`  Bounds: ${bounds.minLon},${bounds.minLat} to ${bounds.maxLon},${bounds.maxLat}`);

  // Create layer output directory
  const layerDir = path.join(outputDir, layer, '0');
  fs.mkdirSync(layerDir, { recursive: true });

  // Generate tiles
  const startLon = Math.floor(bounds.minLon);
  const startLat = Math.floor(bounds.minLat);
  const endLon = Math.ceil(bounds.maxLon);
  const endLat = Math.ceil(bounds.maxLat);

  let tileCount = 0;
  let featureCount = 0;

  for (let lon = startLon; lon < endLon; lon += TILE_SIZE) {
    for (let lat = startLat; lat < endLat; lat += TILE_SIZE) {
      const tileBounds = getTileBounds({ lon, lat });

      // Find features that intersect this tile
      const tileFeatures = allFeatures.filter(f =>
        featureIntersectsBBox(f.geometry, tileBounds)
      );

      if (tileFeatures.length > 0) {
        const tileGeoJSON = {
          type: 'FeatureCollection',
          features: tileFeatures,
        };

        const tilePath = path.join(layerDir, `${lon}_${lat}.geojson`);
        fs.writeFileSync(tilePath, JSON.stringify(tileGeoJSON));

        tileCount++;
        featureCount += tileFeatures.length;
      }
    }
  }

  console.log(`  Generated ${tileCount} tiles with ${featureCount} total features`);
}

function getBBox(geometry: any): { minLon: number; minLat: number; maxLon: number; maxLat: number } | null {
  if (!geometry || !geometry.coordinates) return null;

  let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;

  function processCoords(coords: any): void {
    if (typeof coords[0] === 'number') {
      // It's a point [lon, lat]
      minLon = Math.min(minLon, coords[0]);
      maxLon = Math.max(maxLon, coords[0]);
      minLat = Math.min(minLat, coords[1]);
      maxLat = Math.max(maxLat, coords[1]);
    } else {
      // It's an array of coordinates
      for (const c of coords) {
        processCoords(c);
      }
    }
  }

  processCoords(geometry.coordinates);
  return { minLon, minLat, maxLon, maxLat };
}

function featureIntersectsBBox(
  geometry: any,
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
): boolean {
  const geomBbox = getBBox(geometry);
  if (!geomBbox) return false;

  // Check if bounding boxes intersect
  return !(
    geomBbox.maxLon < bbox.minLon ||
    geomBbox.minLon > bbox.maxLon ||
    geomBbox.maxLat < bbox.minLat ||
    geomBbox.minLat > bbox.maxLat
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse arguments
  let inputPbf = '';
  let outputDir = './tiles';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      inputPbf = args[++i];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputDir = args[++i];
    }
  }

  if (!inputPbf) {
    console.log(`
Usage: npx ts-node scripts/generate-tiles-pbf.ts --input <file.osm.pbf> --output <dir>

Download PBF data from:
  - Geofabrik: https://download.geofabrik.de/
  - Planet: https://planet.openstreetmap.org/

Example:
  # Download a region
  wget https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf

  # Generate tiles
  npx ts-node scripts/generate-tiles-pbf.ts --input new-york-latest.osm.pbf --output ./tiles
`);
    process.exit(1);
  }

  if (!fs.existsSync(inputPbf)) {
    console.error(`Input file not found: ${inputPbf}`);
    process.exit(1);
  }

  console.log('=== OSM PBF Tile Generator ===\n');
  console.log(`Input: ${inputPbf}`);
  console.log(`Output: ${outputDir}`);

  // Check dependencies
  checkDependencies();

  // Create output directories
  const tempDir = path.join(outputDir, '.temp');
  fs.mkdirSync(tempDir, { recursive: true });

  // Process each layer
  for (const layer of LAYERS) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Processing layer: ${layer}`);
    console.log('='.repeat(50));

    // Extract layer from PBF
    const layerPbf = extractLayer(inputPbf, layer, tempDir);

    // Convert to GeoJSON
    const geojsonFiles = pbfToGeoJSON(layerPbf, layer, tempDir);

    if (geojsonFiles.length > 0) {
      // Tile the GeoJSON
      tileGeoJSON(geojsonFiles, layer, outputDir);
    } else {
      console.log(`  No features found for ${layer}`);
    }
  }

  // Cleanup temp files
  console.log('\nCleaning up temp files...');
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('\n=== Done! ===');
  console.log(`Tiles generated in: ${outputDir}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Upload to R2: npx wrangler r2 object put clipmap-tiles --file ${outputDir} --remote-path /`);
  console.log(`  2. Set NEXT_PUBLIC_TILE_CDN_URL in web/.env.local`);
}

main().catch(console.error);
