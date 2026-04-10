/**
 * Generate Complete Water and Land Tilesets
 *
 * Creates 100% coverage for both water and land:
 * - Water v2 (dissolved): bbox - land for each coordinate
 * - Land: bbox - water for each coordinate
 *
 * For full-water coords: water = full bbox, no land tile
 * For full-land coords: land = full bbox, no water tile
 * For coastlines: both have actual geometry
 *
 * Run with: node generate_complete_tileset.js
 */

const fs = require('fs');
const path = require('path');
const polygonClipping = require('polygon-clipping');

const BASE_DIR = 'C:/Users/user/source/repos/clipmap/scripts/tile-work';
const WATER_DIR = path.join(BASE_DIR, 'water-tiles');      // Original water tiles
const LAND_DIR = path.join(BASE_DIR, 'land-tiles');        // Generated land tiles
const WATER_V2_DIR = path.join(BASE_DIR, 'water-tiles-v2'); // Dissolved water output

const LODS = [
  { name: '20deg', size: 20 },
  { name: '10deg', size: 10 },
  { name: '5deg', size: 5 },
  { name: '2.5deg', size: 2.5 },
  { name: '1deg', size: 1 },
];

function formatCoord(val, size) {
  if (size === 2.5) {
    const intPart = Math.floor(val);
    const frac = val - intPart;
    if (frac >= 0.25 && frac < 0.75) {
      return `${intPart}_5`;
    } else if (frac >= 0.75) {
      return `${intPart + 1}_0`;
    } else {
      return `${intPart}_0`;
    }
  }
  return String(Math.floor(val));
}

function getAllCoordinates(size) {
  const coords = [];
  for (let lon = -180; lon < 180; lon += size) {
    for (let lat = -90; lat < 90; lat += size) {
      const lonStr = formatCoord(lon, size);
      const latStr = formatCoord(lat, size);
      coords.push({ lon, lat, filename: `${lonStr}_${latStr}.geojson` });
    }
  }
  return coords;
}

function createBboxPolygon(lon, lat, size) {
  return [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]];
}

function multiPolygonToGeoJSON(multiPoly) {
  if (!multiPoly || multiPoly.length === 0) return null;
  const validPolys = multiPoly.filter(p => p && p.length > 0 && p[0] && p[0].length >= 4);
  if (validPolys.length === 0) return null;

  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: validPolys.length === 1
        ? { type: "Polygon", coordinates: validPolys[0] }
        : { type: "MultiPolygon", coordinates: validPolys }
    }]
  };
}

function geojsonToMultiPolygon(geojson) {
  const result = [];
  if (!geojson.features) return result;
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === 'Polygon') result.push(geom.coordinates);
    else if (geom.type === 'MultiPolygon') result.push(...geom.coordinates);
  }
  return result;
}

function processLOD(lod) {
  const waterFolder = path.join(WATER_DIR, `water-tiles-${lod.name}`);
  const landFolder = path.join(LAND_DIR, `land-tiles-${lod.name}`);
  const waterV2Folder = path.join(WATER_V2_DIR, `water-tiles-${lod.name}`);

  fs.mkdirSync(waterV2Folder, { recursive: true });

  const allCoords = getAllCoordinates(lod.size);

  // Get existing files
  const existingWater = new Set(fs.existsSync(waterFolder)
    ? fs.readdirSync(waterFolder).filter(f => f.endsWith('.geojson'))
    : []);
  const existingLand = new Set(fs.existsSync(landFolder)
    ? fs.readdirSync(landFolder).filter(f => f.endsWith('.geojson'))
    : []);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOD: ${lod.name} | Coords: ${allCoords.length}`);
  console.log(`Existing: Water=${existingWater.size} Land=${existingLand.size}`);
  console.log(`${'='.repeat(60)}`);

  const stats = {
    waterV2Created: 0,
    fullWaterCreated: 0,
    noWater: 0,
    skipped: 0,
    errors: 0
  };
  const startTime = Date.now();

  for (let i = 0; i < allCoords.length; i++) {
    const { lon, lat, filename } = allCoords[i];
    const landPath = path.join(landFolder, filename);
    const waterV2Path = path.join(waterV2Folder, filename);

    if (i % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`  [${i}/${allCoords.length}] ${elapsed.toFixed(0)}s`);
    }

    // Skip if water v2 already exists
    if (fs.existsSync(waterV2Path)) {
      stats.skipped++;
      continue;
    }

    const hasLand = existingLand.has(filename);
    const bbox = createBboxPolygon(lon, lat, lod.size);

    if (!hasLand) {
      // No land tile = full water (create full bbox water tile)
      const waterGeojson = multiPolygonToGeoJSON([bbox]);
      if (waterGeojson) {
        fs.writeFileSync(waterV2Path, JSON.stringify(waterGeojson));
        stats.fullWaterCreated++;
      }
      continue;
    }

    // Has land - compute water = bbox - land
    try {
      const landContent = fs.readFileSync(landPath, 'utf8');
      const landGeojson = JSON.parse(landContent);
      const landPolys = geojsonToMultiPolygon(landGeojson);

      if (landPolys.length === 0) {
        // Empty land file = full water
        const waterGeojson = multiPolygonToGeoJSON([bbox]);
        if (waterGeojson) {
          fs.writeFileSync(waterV2Path, JSON.stringify(waterGeojson));
          stats.fullWaterCreated++;
        }
        continue;
      }

      const waterPolys = polygonClipping.difference([bbox], ...landPolys);

      if (!waterPolys || waterPolys.length === 0) {
        // Full land, no water
        stats.noWater++;
        continue;
      }

      const waterGeojson = multiPolygonToGeoJSON(waterPolys);
      if (waterGeojson) {
        fs.writeFileSync(waterV2Path, JSON.stringify(waterGeojson));
        stats.waterV2Created++;
      }
    } catch (e) {
      stats.errors++;
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nDone in ${elapsed.toFixed(0)}s:`, stats);

  const finalCount = fs.readdirSync(waterV2Folder).filter(f => f.endsWith('.geojson')).length;
  console.log(`Water v2 tiles: ${finalCount}`);
}

async function main() {
  console.log('Generate Complete Tileset');
  console.log('=========================');
  console.log('Creates dissolved water tiles (water = bbox - land)');
  console.log('');

  const start = Date.now();

  for (const lod of LODS) {
    processLOD(lod);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ALL DONE in ${((Date.now() - start) / 60000).toFixed(1)} minutes`);
}

main().catch(console.error);
