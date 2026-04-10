/**
 * Generate vector tiles from OSM PBF data (pure Node.js)
 *
 * No external dependencies required - uses osm-pbf-parser
 *
 * Usage:
 *   npm install osm-pbf-parser through2
 *   npx ts-node scripts/generate-tiles-node.ts --input region.osm.pbf --output ./tiles
 *
 * Data sources:
 *   - Geofabrik: https://download.geofabrik.de/
 */

import * as fs from 'fs';
import * as path from 'path';

// We'll need to install these
// npm install osm-pbf-parser through2 @types/through2

const TILE_SIZE = 1.0;

interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface OSMWay {
  type: 'way';
  id: number;
  refs: number[];
  tags?: Record<string, string>;
}

interface OSMRelation {
  type: 'relation';
  id: number;
  members: { type: string; ref: number; role: string }[];
  tags?: Record<string, string>;
}

type OSMElement = OSMNode | OSMWay | OSMRelation;

// Tag matchers for each layer
const LAYER_MATCHERS: Record<string, (tags: Record<string, string>) => boolean> = {
  water: (tags) => {
    return (
      tags.natural === 'water' ||
      tags.water !== undefined ||
      tags.waterway === 'riverbank' ||
      tags.waterway === 'river' ||
      tags.waterway === 'stream' ||
      tags.waterway === 'canal' ||
      tags.landuse === 'reservoir' ||
      tags.landuse === 'basin' ||
      tags.natural === 'coastline'
    );
  },
  roads: (tags) => {
    const highways = [
      'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
      'residential', 'unclassified', 'service', 'living_street',
      'pedestrian', 'track', 'path', 'footway', 'cycleway'
    ];
    return highways.includes(tags.highway);
  },
  parks: (tags) => {
    return (
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.leisure === 'nature_reserve' ||
      tags.landuse === 'forest' ||
      tags.landuse === 'grass' ||
      tags.landuse === 'meadow' ||
      tags.landuse === 'recreation_ground' ||
      tags.natural === 'wood' ||
      tags.boundary === 'national_park'
    );
  },
  railways: (tags) => {
    const railways = ['rail', 'subway', 'light_rail', 'tram', 'monorail'];
    return railways.includes(tags.railway);
  },
};

interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: {
    type: string;
    coordinates: any;
  };
}

interface ProcessedData {
  nodes: Map<number, OSMNode>;
  ways: Map<number, { way: OSMWay; layer: string }>;
  relations: Map<number, { relation: OSMRelation; layer: string }>;
}

async function parseOSMPBF(inputPath: string): Promise<ProcessedData> {
  // Dynamic import for ES module
  const { default: parsePBF } = await import('osm-pbf-parser');
  const through2 = (await import('through2')).default;

  return new Promise((resolve, reject) => {
    const nodes = new Map<number, OSMNode>();
    const ways = new Map<number, { way: OSMWay; layer: string }>();
    const relations = new Map<number, { relation: OSMRelation; layer: string }>();

    let nodeCount = 0;
    let wayCount = 0;

    console.log('Parsing PBF file...');

    const parser = parsePBF();

    fs.createReadStream(inputPath)
      .pipe(parser)
      .pipe(through2.obj(function(items: OSMElement[], _enc: any, next: () => void) {
        for (const item of items) {
          if (item.type === 'node') {
            // Store all nodes (needed for way coordinates)
            nodes.set(item.id, item);
            nodeCount++;

            if (nodeCount % 1000000 === 0) {
              console.log(`  Processed ${(nodeCount / 1000000).toFixed(1)}M nodes...`);
            }
          } else if (item.type === 'way' && item.tags) {
            // Check which layer this way belongs to
            for (const [layer, matcher] of Object.entries(LAYER_MATCHERS)) {
              if (matcher(item.tags)) {
                ways.set(item.id, { way: item, layer });
                wayCount++;
                break;
              }
            }
          }
          // TODO: Handle relations for multipolygons
        }
        next();
      }))
      .on('finish', () => {
        console.log(`  Total: ${nodeCount} nodes, ${wayCount} matched ways`);
        resolve({ nodes, ways, relations });
      })
      .on('error', reject);
  });
}

function wayToGeoJSON(
  way: OSMWay,
  nodes: Map<number, OSMNode>,
  layer: string
): GeoJSONFeature | null {
  const coords: [number, number][] = [];

  for (const nodeId of way.refs) {
    const node = nodes.get(nodeId);
    if (node) {
      coords.push([node.lon, node.lat]);
    }
  }

  if (coords.length < 2) return null;

  // Determine if it's a polygon (closed way) or line
  const isPolygon = coords.length >= 4 &&
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1] &&
    (layer === 'water' || layer === 'parks');

  return {
    type: 'Feature',
    properties: {
      id: way.id,
      ...way.tags,
    },
    geometry: isPolygon
      ? { type: 'Polygon', coordinates: [coords] }
      : { type: 'LineString', coordinates: coords },
  };
}

function getBBox(feature: GeoJSONFeature): { minLon: number; minLat: number; maxLon: number; maxLat: number } | null {
  const coords = feature.geometry.coordinates;
  if (!coords) return null;

  let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;

  function process(c: any): void {
    if (typeof c[0] === 'number') {
      minLon = Math.min(minLon, c[0]);
      maxLon = Math.max(maxLon, c[0]);
      minLat = Math.min(minLat, c[1]);
      maxLat = Math.max(maxLat, c[1]);
    } else {
      for (const item of c) process(item);
    }
  }

  process(coords);
  return { minLon, minLat, maxLon, maxLat };
}

function featureIntersectsTile(
  feature: GeoJSONFeature,
  tileLon: number,
  tileLat: number
): boolean {
  const bbox = getBBox(feature);
  if (!bbox) return false;

  return !(
    bbox.maxLon < tileLon ||
    bbox.minLon > tileLon + TILE_SIZE ||
    bbox.maxLat < tileLat ||
    bbox.minLat > tileLat + TILE_SIZE
  );
}

async function generateTiles(
  data: ProcessedData,
  outputDir: string
): Promise<void> {
  const layers = ['water', 'roads', 'parks', 'railways'];

  // Group features by layer
  const featuresByLayer = new Map<string, GeoJSONFeature[]>();
  for (const layer of layers) {
    featuresByLayer.set(layer, []);
  }

  console.log('\nConverting ways to GeoJSON...');

  let converted = 0;
  for (const [_id, { way, layer }] of data.ways) {
    const feature = wayToGeoJSON(way, data.nodes, layer);
    if (feature) {
      featuresByLayer.get(layer)!.push(feature);
      converted++;

      if (converted % 100000 === 0) {
        console.log(`  Converted ${(converted / 1000).toFixed(0)}K features...`);
      }
    }
  }

  console.log(`  Total: ${converted} features`);

  // Process each layer
  for (const layer of layers) {
    const features = featuresByLayer.get(layer)!;
    if (features.length === 0) {
      console.log(`\nSkipping ${layer} (no features)`);
      continue;
    }

    console.log(`\nTiling ${layer} (${features.length} features)...`);

    // Find bounds
    let minLon = 180, minLat = 90, maxLon = -180, maxLat = -90;
    for (const f of features) {
      const bbox = getBBox(f);
      if (bbox) {
        minLon = Math.min(minLon, bbox.minLon);
        minLat = Math.min(minLat, bbox.minLat);
        maxLon = Math.max(maxLon, bbox.maxLon);
        maxLat = Math.max(maxLat, bbox.maxLat);
      }
    }

    const startLon = Math.floor(minLon);
    const startLat = Math.floor(minLat);
    const endLon = Math.ceil(maxLon);
    const endLat = Math.ceil(maxLat);

    const layerDir = path.join(outputDir, layer, '0');
    fs.mkdirSync(layerDir, { recursive: true });

    let tileCount = 0;
    let totalFeatures = 0;

    for (let lon = startLon; lon < endLon; lon += TILE_SIZE) {
      for (let lat = startLat; lat < endLat; lat += TILE_SIZE) {
        const tileFeatures = features.filter(f => featureIntersectsTile(f, lon, lat));

        if (tileFeatures.length > 0) {
          const tilePath = path.join(layerDir, `${lon}_${lat}.geojson`);
          const tileGeoJSON = {
            type: 'FeatureCollection',
            features: tileFeatures,
          };

          fs.writeFileSync(tilePath, JSON.stringify(tileGeoJSON));
          tileCount++;
          totalFeatures += tileFeatures.length;
        }
      }
    }

    console.log(`  Generated ${tileCount} tiles, ${totalFeatures} feature instances`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

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
OSM PBF Tile Generator (Node.js)

Usage:
  npm install osm-pbf-parser through2
  npx ts-node scripts/generate-tiles-node.ts --input <file.osm.pbf> --output <dir>

Download PBF data from:
  - Geofabrik: https://download.geofabrik.de/
  - Planet: https://planet.openstreetmap.org/

Example:
  # Download New York state
  curl -O https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf

  # Generate tiles
  npx ts-node scripts/generate-tiles-node.ts --input new-york-latest.osm.pbf --output ./tiles
`);
    process.exit(1);
  }

  if (!fs.existsSync(inputPbf)) {
    console.error(`Input file not found: ${inputPbf}`);
    process.exit(1);
  }

  console.log('=== OSM PBF Tile Generator (Node.js) ===\n');
  console.log(`Input: ${inputPbf}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Tile size: ${TILE_SIZE}°`);

  // Parse PBF
  const data = await parseOSMPBF(inputPbf);

  // Generate tiles
  await generateTiles(data, outputDir);

  console.log('\n=== Done! ===');
  console.log(`Tiles in: ${outputDir}`);
}

main().catch(console.error);
