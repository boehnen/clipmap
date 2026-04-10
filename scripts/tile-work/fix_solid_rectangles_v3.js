/**
 * Fix solid rectangle tiles by regenerating them with water properly cut out
 * Uses matching LOD water tiles (same folder naming/format)
 */

const fs = require('fs');
const path = require('path');
const polygonClipping = require('polygon-clipping');

const BASE_DIR = path.join(__dirname);
const LAND_DIR = path.join(BASE_DIR, 'land-tiles-new');
const WATER_DIR = path.join(BASE_DIR, 'water-tiles');

// Load solid rectangles from find script output
const solidFile = path.join(__dirname, 'solid_rectangles.json');
if (!fs.existsSync(solidFile)) {
  console.error('Run find_solid_rectangles.js first!');
  process.exit(1);
}
const solidData = JSON.parse(fs.readFileSync(solidFile, 'utf8'));

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
  if (!geojson.features || geojson.features.length === 0) return result;

  for (const feat of geojson.features) {
    const geom = feat.geometry;
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
    return { type: 'FeatureCollection', features: [] };
  }

  const validPolys = multiPoly.filter(poly => {
    if (!poly || poly.length === 0) return false;
    const outer = poly[0];
    return outer && outer.length >= 4;
  });

  if (validPolys.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  if (validPolys.length === 1) {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: validPolys[0] }
      }]
    };
  }

  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: validPolys }
    }]
  };
}

// Map LOD to water directory
const LOD_CONFIG = {
  '10deg': { waterFolder: 'water-tiles-10deg', size: 10 },
  '5deg': { waterFolder: 'water-tiles-5deg', size: 5 },
  '2.5deg': { waterFolder: 'water-tiles-2.5deg', size: 2.5 },
};

// Get water tile filename (same format as land tiles for each LOD)
function getWaterTileFilename(lod, lon, lat) {
  if (lod === '2.5deg') {
    // 2.5deg uses complex format: lonInt_lonDec_latInt_latDec.geojson
    const lonAbs = Math.abs(lon);
    const lonInt = Math.floor(lonAbs);
    const lonDec = Math.round((lonAbs - lonInt) * 10);

    const latAbs = Math.abs(lat);
    const latInt = Math.floor(latAbs);
    const latDec = Math.round((latAbs - latInt) * 10);

    const lonSign = lon < 0 ? '-' : '';
    const latSign = lat < 0 ? '-' : '';

    return `${lonSign}${lonInt}_${lonDec}_${latSign}${latInt}_${latDec}.geojson`;
  }

  // 10deg and 5deg use simple format: lon_lat.geojson
  return `${lon}_${lat}.geojson`;
}

function fixTile(lod, tileInfo) {
  const { file, lon, lat } = tileInfo;
  const config = LOD_CONFIG[lod];
  const landDir = path.join(LAND_DIR, `land-tiles-${lod}`);
  const waterDir = path.join(WATER_DIR, config.waterFolder);
  const landPath = path.join(landDir, file);

  // Get matching water tile
  const waterFilename = getWaterTileFilename(lod, lon, lat);
  const waterPath = path.join(waterDir, waterFilename);

  if (!fs.existsSync(waterPath)) {
    return 'no_water_tile';
  }

  // Load water data
  let waterPolys = [];
  try {
    const content = fs.readFileSync(waterPath, 'utf8');
    const data = JSON.parse(content);
    waterPolys = geojsonToMultiPolygon(data);
  } catch (e) {
    return `read_error:${e.message.slice(0, 20)}`;
  }

  if (waterPolys.length === 0) {
    // Water tile exists but has no polygons = full land (the current solid rect is correct)
    return 'valid_full_land';
  }

  // Create bbox polygon
  const bbox = createBboxPolygon(lon, lat, config.size);

  try {
    // Compute land = bbox - water
    const landPolys = polygonClipping.difference([bbox], ...waterPolys);

    if (!landPolys || landPolys.length === 0) {
      // Full water = empty land
      fs.writeFileSync(landPath, JSON.stringify({ type: 'FeatureCollection', features: [] }));
      return 'full_water';
    }

    const landGeoJSON = multiPolygonToGeoJSON(landPolys);
    fs.writeFileSync(landPath, JSON.stringify(landGeoJSON));
    return 'fixed';
  } catch (e) {
    return `diff_error:${e.message.slice(0, 20)}`;
  }
}

async function main() {
  console.log('Fixing Solid Rectangle Tiles (v3)');
  console.log('==================================\n');

  // Check water tile directories
  console.log('Water tile directories:');
  for (const lod of Object.keys(LOD_CONFIG)) {
    const dir = path.join(WATER_DIR, LOD_CONFIG[lod].waterFolder);
    if (fs.existsSync(dir)) {
      const count = fs.readdirSync(dir).filter(f => f.endsWith('.geojson')).length;
      console.log(`  ${lod}: ${count} water tiles`);
    } else {
      console.log(`  ${lod}: NOT FOUND`);
    }
  }
  console.log('');

  const stats = { fixed: 0, full_water: 0, valid_full_land: 0, no_water_tile: 0, errors: 0 };

  for (const lod of ['10deg', '5deg', '2.5deg']) {
    const tiles = solidData[lod] || [];
    if (tiles.length === 0) continue;

    console.log(`\nFixing ${lod}: ${tiles.length} tiles`);

    for (let i = 0; i < tiles.length; i++) {
      const result = fixTile(lod, tiles[i]);

      if (result === 'fixed') stats.fixed++;
      else if (result === 'full_water') stats.full_water++;
      else if (result === 'valid_full_land') stats.valid_full_land++;
      else if (result === 'no_water_tile') stats.no_water_tile++;
      else {
        stats.errors++;
        if (stats.errors <= 10) {
          console.log(`  Error on ${tiles[i].file}: ${result}`);
        }
      }

      if ((i + 1) % 50 === 0 || i === tiles.length - 1) {
        console.log(`  [${i + 1}/${tiles.length}] fixed: ${stats.fixed}, water: ${stats.full_water}, valid: ${stats.valid_full_land}, missing: ${stats.no_water_tile}`);
      }
    }
  }

  console.log('\n==================================');
  console.log('RESULTS');
  console.log('==================================');
  console.log(`Fixed (water cut out): ${stats.fixed}`);
  console.log(`Full water (now empty): ${stats.full_water}`);
  console.log(`Valid full land (no water in tile): ${stats.valid_full_land}`);
  console.log(`Missing water tiles: ${stats.no_water_tile}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
