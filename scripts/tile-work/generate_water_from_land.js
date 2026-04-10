/**
 * Generate dissolved water tiles from land tiles
 * water = bbox - land (single polygon per tile)
 *
 * Run with: node generate_water_from_land.js
 */

const fs = require('fs');
const path = require('path');

const polygonClipping = require('polygon-clipping');

const LAND_DIR = 'C:/Users/user/source/repos/clipmap/scripts/tile-work/land-tiles-new';
const WATER_OUT_DIR = 'C:/Users/user/source/repos/clipmap/scripts/tile-work/water-tiles-v3';

const LODS = [
  { name: '20deg', folder: 'land-tiles-20deg', size: 20 },
  { name: '10deg', folder: 'land-tiles-10deg', size: 10 },
  { name: '5deg', folder: 'land-tiles-5deg', size: 5 },
  { name: '2.5deg', folder: 'land-tiles-2.5deg', size: 2.5 },
  { name: '1deg', folder: 'land-tiles-1deg', size: 1 },
];

// Filter LODs via command line: --only=20deg,10deg or --skip=1deg
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const skipArg = process.argv.find(a => a.startsWith('--skip='));
const onlyLods = onlyArg ? onlyArg.replace('--only=', '').split(',') : null;
const skipLods = skipArg ? skipArg.replace('--skip=', '').split(',') : [];

function parseCoords(filename, tileSize) {
  const stem = filename.replace('.geojson', '');
  const parts = stem.split('_');

  if (tileSize === 2.5 && parts.length === 4) {
    const lon = parseFloat(parts[0]) + (parts[1] === '5' ? 0.5 : 0);
    const lat = parseFloat(parts[2]) + (parts[3] === '5' ? 0.5 : 0);
    return { lon, lat };
  } else if (parts.length === 2) {
    return { lon: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
  }
  return null;
}

function createBboxPolygon(lon, lat, size) {
  return [[
    [lon, lat],
    [lon + size, lat],
    [lon + size, lat + size],
    [lon, lat + size],
    [lon, lat]
  ]];
}

function geojsonToMultiPolygon(geojson) {
  const result = [];
  if (!geojson.features || geojson.features.length === 0) {
    return result;
  }

  for (const feature of geojson.features) {
    const geom = feature.geometry;
    if (!geom) continue;

    if (geom.type === 'Polygon') {
      result.push(geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (const poly of geom.coordinates) {
        result.push(poly);
      }
    }
  }

  return result;
}

function multiPolygonToGeoJSON(multiPoly) {
  if (!multiPoly || multiPoly.length === 0) {
    return null;
  }

  const validPolys = multiPoly.filter(poly => {
    if (!poly || poly.length === 0) return false;
    const outer = poly[0];
    if (!outer || outer.length < 4) return false;
    return true;
  });

  if (validPolys.length === 0) return null;

  if (validPolys.length === 1) {
    return {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: validPolys[0]
        }
      }]
    };
  }

  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: validPolys
      }
    }]
  };
}

function processTile(landPath, waterPath, tileSize) {
  const filename = path.basename(landPath);
  const coords = parseCoords(filename, tileSize);
  if (!coords) return 'parse_error';

  // Create bbox polygon
  const bbox = createBboxPolygon(coords.lon, coords.lat, tileSize);

  // Load land geojson
  let landGeojson;
  try {
    const content = fs.readFileSync(landPath, 'utf8');
    landGeojson = JSON.parse(content);
  } catch (e) {
    return `read_error:${e.message.slice(0, 30)}`;
  }

  // Convert to multipolygon format
  const landPolys = geojsonToMultiPolygon(landGeojson);

  if (landPolys.length === 0) {
    // No land = full water (entire bbox is water)
    const waterGeojson = multiPolygonToGeoJSON([bbox]);
    if (waterGeojson) {
      fs.writeFileSync(waterPath, JSON.stringify(waterGeojson));
      return 'full_water';
    }
    return 'empty';
  }

  try {
    // Compute water = bbox - land
    const waterPolys = polygonClipping.difference([bbox], ...landPolys);

    if (!waterPolys || waterPolys.length === 0) {
      return 'full_land'; // No water in this tile
    }

    const waterGeojson = multiPolygonToGeoJSON(waterPolys);
    if (waterGeojson) {
      fs.writeFileSync(waterPath, JSON.stringify(waterGeojson));
      return 'created';
    }
    return 'empty';
  } catch (e) {
    return `diff_error:${e.message.slice(0, 30)}`;
  }
}

function processLOD(lod) {
  const landDir = path.join(LAND_DIR, lod.folder);
  const waterDir = path.join(WATER_OUT_DIR, `water-tiles-${lod.name}`);

  fs.mkdirSync(waterDir, { recursive: true });

  let landFiles;
  try {
    landFiles = fs.readdirSync(landDir).filter(f => f.endsWith('.geojson'));
  } catch {
    console.log(`  No land directory: ${landDir}`);
    return;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOD: ${lod.name} | Land Tiles: ${landFiles.length}`);
  console.log(`${'='.repeat(60)}`);

  const stats = { created: 0, full_water: 0, full_land: 0, skipped: 0, errors: 0 };
  const startTime = Date.now();

  for (let i = 0; i < landFiles.length; i++) {
    const filename = landFiles[i];
    const landPath = path.join(landDir, filename);
    const waterPath = path.join(waterDir, filename);

    // Progress every 50 tiles
    if (i % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = i / elapsed || 1;
      const remaining = (landFiles.length - i) / rate;
      console.log(`  [${i}/${landFiles.length}] ${elapsed.toFixed(0)}s | ~${remaining.toFixed(0)}s left`);
    }

    // Skip existing
    if (fs.existsSync(waterPath)) {
      stats.skipped++;
      continue;
    }

    const result = processTile(landPath, waterPath, lod.size);

    if (result === 'created') stats.created++;
    else if (result === 'full_water') stats.full_water++;
    else if (result === 'full_land') stats.full_land++;
    else {
      stats.errors++;
      if (i % 100 === 0) console.log(`    ERROR: ${result} - ${filename}`);
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nDone in ${elapsed.toFixed(0)}s:`, stats);
}

async function main() {
  console.log('Water Tile Generator (from land tiles)');
  console.log('======================================');
  console.log('Creates dissolved single-polygon water tiles');
  if (onlyLods) console.log(`Only: ${onlyLods.join(', ')}`);
  if (skipLods.length) console.log(`Skip: ${skipLods.join(', ')}`);
  console.log('');

  const start = Date.now();

  for (const lod of LODS) {
    if (onlyLods && !onlyLods.includes(lod.name)) continue;
    if (skipLods.includes(lod.name)) continue;
    processLOD(lod);
  }

  console.log(`\nALL DONE in ${((Date.now() - start) / 60000).toFixed(1)} minutes`);
}

main().catch(console.error);
