/**
 * Land Tile Generator for all LODs using mapshaper
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CDN_BASE = 'https://cdn.clipmap.io';
const OUTPUT_DIR = path.join(__dirname, 'land-tiles-new');
const TEMP_DIR = path.join(__dirname, 'temp');

// All LOD definitions
const LODS = [
  { name: '20deg', size: 20 },
  { name: '10deg', size: 10 },
  { name: '5deg', size: 5 },
  { name: '2.5deg', size: 2.5 },
  { name: '1deg', size: 1 }
];

// Skip LODs that are already done (pass --skip=20deg,10deg)
const skipLods = (process.argv.find(a => a.startsWith('--skip=')) || '').replace('--skip=', '').split(',').filter(Boolean);

// Only process specific LOD (pass --only=5deg)
const onlyLod = (process.argv.find(a => a.startsWith('--only=')) || '').replace('--only=', '');

function formatCoord(val) {
  // Handle decimal coordinates for smaller LODs
  if (val === Math.floor(val)) {
    return String(Math.floor(val));
  }
  return String(val);
}

function getAllTileCoords(size) {
  const coords = [];
  const precision = size < 1 ? 2 : (size === 2.5 ? 1 : 0);

  for (let lon = -180; lon < 180; lon += size) {
    for (let lat = -90; lat < 90; lat += size) {
      // Round to avoid floating point issues
      const roundedLon = Number(lon.toFixed(precision));
      const roundedLat = Number(lat.toFixed(precision));
      coords.push({ lon: roundedLon, lat: roundedLat });
    }
  }
  return coords;
}

function fetchWaterTile(lon, lat, lodName) {
  const url = `${CDN_BASE}/water-tiles-${lodName}/${formatCoord(lon)}_${formatCoord(lat)}.geojson`;
  try {
    const result = execSync(`curl -s --max-time 30 "${url}"`, {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024,
      windowsHide: true
    });
    if (!result || result.includes('<!DOCTYPE') || result.includes('NoSuchKey') || result.includes('AccessDenied')) {
      return null;
    }
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

function createBboxGeoJSON(lon, lat, size) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [lon, lat],
          [lon + size, lat],
          [lon + size, lat + size],
          [lon, lat + size],
          [lon, lat]
        ]]
      }
    }]
  };
}

function convertToFeatureCollection(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.type === 'FeatureCollection') return; // Already correct

    let result;
    if (data.type === 'GeometryCollection') {
      const allCoords = [];
      for (const geom of data.geometries || []) {
        if (geom.type === 'Polygon') {
          allCoords.push(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
          for (const poly of geom.coordinates) {
            allCoords.push(poly);
          }
        }
      }
      result = allCoords.length === 0
        ? { type: 'FeatureCollection', features: [] }
        : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: allCoords }}]};
    } else if (data.type === 'Polygon' || data.type === 'MultiPolygon') {
      result = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: data }]};
    } else {
      return;
    }
    fs.writeFileSync(filePath, JSON.stringify(result));
  } catch (e) {}
}

function processWithMapshaper(bboxPath, waterPath, outputPath) {
  try {
    // First filter to only polygon layers, then combine and dissolve
    const dissolvedPath = path.join(TEMP_DIR, 'dissolved_water.geojson');
    const dissolveCmd = `npx mapshaper "${waterPath}" -target type=polygon -merge-layers force -dissolve2 -o "${dissolvedPath}" format=geojson`;
    execSync(dissolveCmd, {
      encoding: 'utf8',
      maxBuffer: 200 * 1024 * 1024,
      windowsHide: true,
      timeout: 300000
    });

    // Use mapshaper to erase dissolved water from bbox
    const cmd = `npx mapshaper "${bboxPath}" -erase "${dissolvedPath}" -o "${outputPath}" format=geojson`;
    execSync(cmd, {
      encoding: 'utf8',
      maxBuffer: 200 * 1024 * 1024,
      windowsHide: true,
      timeout: 120000
    });

    // Convert output to FeatureCollection format
    convertToFeatureCollection(outputPath);

    // Cleanup
    try { fs.unlinkSync(dissolvedPath); } catch {}
    return true;
  } catch (e) {
    return false;
  }
}

async function processLod(lod) {
  const outDir = path.join(OUTPUT_DIR, `land-tiles-${lod.name}`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const tiles = getAllTileCoords(lod.size);
  const pending = tiles.filter(({ lon, lat }) => {
    const filename = `${formatCoord(lon)}_${formatCoord(lat)}.geojson`;
    return !fs.existsSync(path.join(outDir, filename));
  });

  console.log(`\n=== LOD ${lod.name} (${lod.size}°) ===`);
  console.log(`Total: ${tiles.length}, Pending: ${pending.length}`);

  if (pending.length === 0) {
    console.log('All tiles already generated!');
    return;
  }

  let done = 0;
  let land = 0;
  let water = 0;
  let errors = 0;
  const start = Date.now();

  for (const { lon, lat } of pending) {
    const filename = `${formatCoord(lon)}_${formatCoord(lat)}.geojson`;
    const bboxPath = path.join(TEMP_DIR, `bbox_${filename}`);
    const waterPath = path.join(TEMP_DIR, `water_${filename}`);
    const outputPath = path.join(outDir, filename);

    try {
      // Create bbox geojson
      const bbox = createBboxGeoJSON(lon, lat, lod.size);
      fs.writeFileSync(bboxPath, JSON.stringify(bbox));

      // Fetch water tile
      const waterGeoJSON = fetchWaterTile(lon, lat, lod.name);

      if (!waterGeoJSON || !waterGeoJSON.features || waterGeoJSON.features.length === 0) {
        // No water = all land
        fs.writeFileSync(outputPath, JSON.stringify(bbox));
        land++;
      } else {
        // Write water file for mapshaper
        fs.writeFileSync(waterPath, JSON.stringify(waterGeoJSON));

        // Use mapshaper to compute land = bbox - water
        if (processWithMapshaper(bboxPath, waterPath, outputPath)) {
          const result = fs.readFileSync(outputPath, 'utf8');
          if (result.length > 200) {
            land++;
          } else {
            water++;
          }
        } else {
          // Fallback: write empty
          fs.writeFileSync(outputPath, JSON.stringify({ type: 'FeatureCollection', features: [] }));
          water++;
          errors++;
        }
      }
    } catch (e) {
      fs.writeFileSync(outputPath, JSON.stringify({ type: 'FeatureCollection', features: [] }));
      water++;
      errors++;
    }

    // Cleanup temp files
    try { fs.unlinkSync(bboxPath); } catch {}
    try { fs.unlinkSync(waterPath); } catch {}

    done++;
    const elapsed = (Date.now() - start) / 1000;
    const rate = done / elapsed;
    const eta = (pending.length - done) / rate;

    // Progress every 10 tiles or at the end
    if (done % 10 === 0 || done === pending.length) {
      console.log(`[${done}/${pending.length}] ${rate.toFixed(2)}/s ETA:${(eta/60).toFixed(1)}m | L:${land} W:${water} E:${errors}`);
    }
  }

  console.log(`LOD ${lod.name} DONE in ${((Date.now() - start)/1000).toFixed(0)}s | Land: ${land}, Water: ${water}, Errors: ${errors}`);
}

async function main() {
  console.log('Land Tile Generator - All LODs');
  console.log('==============================');

  const lodsToProcess = LODS.filter(lod => {
    if (onlyLod && lod.name !== onlyLod) return false;
    if (skipLods.includes(lod.name)) return false;
    return true;
  });

  console.log(`Processing LODs: ${lodsToProcess.map(l => l.name).join(', ')}`);

  for (const lod of lodsToProcess) {
    await processLod(lod);
  }

  console.log('\n=== ALL DONE ===');
}

main().catch(console.error);
