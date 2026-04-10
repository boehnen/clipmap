/**
 * Fill Missing Tiles with Empty GeoJSON
 *
 * Creates empty FeatureCollection for any missing coordinates
 * to ensure 100% coverage with no 404s
 *
 * Run with: node fill_empty_tiles.js
 */

const fs = require('fs');
const path = require('path');

const BASE_DIR = 'C:/Users/user/source/repos/clipmap/scripts/tile-work';
const WATER_V2_DIR = path.join(BASE_DIR, 'water-tiles-v2');
const LAND_DIR = path.join(BASE_DIR, 'land-tiles');

const EMPTY_GEOJSON = JSON.stringify({ type: "FeatureCollection", features: [] });

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
    if (frac >= 0.25 && frac < 0.75) return `${intPart}_5`;
    else if (frac >= 0.75) return `${intPart + 1}_0`;
    else return `${intPart}_0`;
  }
  return String(Math.floor(val));
}

function getAllCoordinates(size) {
  const coords = [];
  for (let lon = -180; lon < 180; lon += size) {
    for (let lat = -90; lat < 90; lat += size) {
      const lonStr = formatCoord(lon, size);
      const latStr = formatCoord(lat, size);
      coords.push({ filename: `${lonStr}_${latStr}.geojson` });
    }
  }
  return coords;
}

function processLOD(lod) {
  const waterFolder = path.join(WATER_V2_DIR, `water-tiles-${lod.name}`);
  const landFolder = path.join(LAND_DIR, `land-tiles-${lod.name}`);

  const allCoords = getAllCoordinates(lod.size);
  const expected = allCoords.length;

  const existingWater = new Set(fs.existsSync(waterFolder)
    ? fs.readdirSync(waterFolder).filter(f => f.endsWith('.geojson'))
    : []);
  const existingLand = new Set(fs.existsSync(landFolder)
    ? fs.readdirSync(landFolder).filter(f => f.endsWith('.geojson'))
    : []);

  console.log(`\n${lod.name}: Expected ${expected} | Water: ${existingWater.size} | Land: ${existingLand.size}`);

  let waterFilled = 0;
  let landFilled = 0;

  for (const { filename } of allCoords) {
    // Fill missing water tiles
    if (!existingWater.has(filename)) {
      const waterPath = path.join(waterFolder, filename);
      fs.writeFileSync(waterPath, EMPTY_GEOJSON);
      waterFilled++;
    }

    // Fill missing land tiles
    if (!existingLand.has(filename)) {
      const landPath = path.join(landFolder, filename);
      fs.writeFileSync(landPath, EMPTY_GEOJSON);
      landFilled++;
    }
  }

  console.log(`  Filled: Water +${waterFilled} | Land +${landFilled}`);

  const finalWater = fs.readdirSync(waterFolder).filter(f => f.endsWith('.geojson')).length;
  const finalLand = fs.readdirSync(landFolder).filter(f => f.endsWith('.geojson')).length;
  console.log(`  Final: Water ${finalWater} | Land ${finalLand}`);
}

console.log('Fill Empty Tiles');
console.log('=================');

const start = Date.now();
for (const lod of LODS) {
  processLOD(lod);
}

console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(0)}s`);
