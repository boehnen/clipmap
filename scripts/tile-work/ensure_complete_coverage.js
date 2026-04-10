/**
 * Ensure Complete Tile Coverage
 *
 * Creates full-coverage tiles for any missing coordinates:
 * - If water tile exists but no land tile: land = bbox - water (or skip if full water)
 * - If land tile exists but no water tile: water = bbox - land (or skip if full land)
 * - If neither exists: create full land tile (no water at this coordinate)
 *
 * Run with: node ensure_complete_coverage.js
 */

const fs = require('fs');
const path = require('path');
const polygonClipping = require('polygon-clipping');

const BASE_DIR = 'C:/Users/user/source/repos/clipmap/scripts/tile-work';
const WATER_DIR = path.join(BASE_DIR, 'water-tiles');
const LAND_DIR = path.join(BASE_DIR, 'land-tiles');

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
  const step = size;

  for (let lon = -180; lon < 180; lon += step) {
    for (let lat = -90; lat < 90; lat += step) {
      const lonStr = formatCoord(lon, size);
      const latStr = formatCoord(lat, size);
      coords.push({
        lon, lat,
        filename: `${lonStr}_${latStr}.geojson`
      });
    }
  }

  return coords;
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

function multiPolygonToGeoJSON(multiPoly) {
  if (!multiPoly || multiPoly.length === 0) return null;

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
        geometry: { type: "Polygon", coordinates: validPolys[0] }
      }]
    };
  }

  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: validPolys }
    }]
  };
}

function geojsonToMultiPolygon(geojson) {
  const result = [];
  if (!geojson.features || geojson.features.length === 0) return result;

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

function processLOD(lod) {
  const waterFolder = path.join(WATER_DIR, `water-tiles-${lod.name}`);
  const landFolder = path.join(LAND_DIR, `land-tiles-${lod.name}`);

  if (!fs.existsSync(waterFolder)) {
    console.log(`  Water folder not found: ${waterFolder}`);
    return;
  }

  fs.mkdirSync(landFolder, { recursive: true });

  const allCoords = getAllCoordinates(lod.size);
  const expectedTotal = allCoords.length;

  // Get existing files
  const existingWater = new Set(fs.readdirSync(waterFolder).filter(f => f.endsWith('.geojson')));
  const existingLand = new Set(fs.readdirSync(landFolder).filter(f => f.endsWith('.geojson')));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOD: ${lod.name} | Expected: ${expectedTotal} | Water: ${existingWater.size} | Land: ${existingLand.size}`);
  console.log(`${'='.repeat(60)}`);

  const stats = {
    waterExists: 0,
    landExists: 0,
    landCreatedFromWater: 0,
    waterCreatedFromLand: 0,
    fullLandCreated: 0,
    errors: 0
  };

  const startTime = Date.now();

  for (let i = 0; i < allCoords.length; i++) {
    const { lon, lat, filename } = allCoords[i];
    const waterPath = path.join(waterFolder, filename);
    const landPath = path.join(landFolder, filename);

    const hasWater = existingWater.has(filename);
    const hasLand = existingLand.has(filename);

    if (i % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      console.log(`  [${i}/${allCoords.length}] ${elapsed.toFixed(0)}s | W:${stats.waterExists} L:${stats.landExists}`);
    }

    if (hasWater) stats.waterExists++;
    if (hasLand) stats.landExists++;

    // Both exist - nothing to do
    if (hasWater && hasLand) continue;

    const bbox = createBboxPolygon(lon, lat, lod.size);

    // Has water but no land - create land tile
    if (hasWater && !hasLand) {
      try {
        const waterContent = fs.readFileSync(waterPath, 'utf8');
        const waterGeojson = JSON.parse(waterContent);
        const waterPolys = geojsonToMultiPolygon(waterGeojson);

        if (waterPolys.length > 0) {
          const landPolys = polygonClipping.difference([bbox], ...waterPolys);
          if (landPolys && landPolys.length > 0) {
            const landGeojson = multiPolygonToGeoJSON(landPolys);
            if (landGeojson) {
              fs.writeFileSync(landPath, JSON.stringify(landGeojson));
              stats.landCreatedFromWater++;
            }
          }
          // else: full water, no land tile needed
        }
      } catch (e) {
        stats.errors++;
      }
      continue;
    }

    // Has land but no water - create water tile (water = bbox - land)
    if (hasLand && !hasWater) {
      try {
        const landContent = fs.readFileSync(landPath, 'utf8');
        const landGeojson = JSON.parse(landContent);
        const landPolys = geojsonToMultiPolygon(landGeojson);

        if (landPolys.length > 0) {
          const waterPolys = polygonClipping.difference([bbox], ...landPolys);
          if (waterPolys && waterPolys.length > 0) {
            const waterGeojson = multiPolygonToGeoJSON(waterPolys);
            if (waterGeojson) {
              fs.writeFileSync(waterPath, JSON.stringify(waterGeojson));
              stats.waterCreatedFromLand++;
            }
          }
          // else: full land, no water tile needed
        }
      } catch (e) {
        stats.errors++;
      }
      continue;
    }

    // Neither exists - this is full land (no water bodies at this location)
    // Create a full land tile
    const landGeojson = multiPolygonToGeoJSON([bbox]);
    if (landGeojson) {
      fs.writeFileSync(landPath, JSON.stringify(landGeojson));
      stats.fullLandCreated++;
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`\nDone in ${elapsed.toFixed(0)}s:`, stats);

  // Final count
  const finalWater = fs.readdirSync(waterFolder).filter(f => f.endsWith('.geojson')).length;
  const finalLand = fs.readdirSync(landFolder).filter(f => f.endsWith('.geojson')).length;
  console.log(`Final: Water=${finalWater} Land=${finalLand} (Expected=${expectedTotal})`);
}

async function main() {
  console.log('Ensure Complete Coverage');
  console.log('========================');
  console.log('Creates missing tiles to ensure 100% coordinate coverage');
  console.log('');

  const start = Date.now();

  for (const lod of LODS) {
    processLOD(lod);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`ALL DONE in ${((Date.now() - start) / 60000).toFixed(1)} minutes`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
