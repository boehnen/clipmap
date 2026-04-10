/**
 * Parallel 1deg land tile generator using LOCAL water tiles
 * Spawns multiple workers for different longitude ranges
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WATER_DIR = path.join(__dirname, 'water-tiles', 'water-tiles-1deg');
const OUTPUT_DIR = path.join(__dirname, 'land-tiles-new', 'land-tiles-1deg');
const NUM_WORKERS = Math.min(os.cpus().length, 8); // Max 8 workers

if (isMainThread) {
  // Main thread - spawn workers
  main();
} else {
  // Worker thread - process tiles
  workerProcess();
}

async function main() {
  console.log('Parallel 1deg Land Tile Generator');
  console.log('==================================');
  console.log(`Workers: ${NUM_WORKERS}`);
  console.log(`Water dir: ${WATER_DIR}`);
  console.log(`Output dir: ${OUTPUT_DIR}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Check water tiles
  if (!fs.existsSync(WATER_DIR)) {
    console.error('Water directory not found!');
    process.exit(1);
  }

  const waterCount = fs.readdirSync(WATER_DIR).filter(f => f.endsWith('.geojson')).length;
  console.log(`Water tiles: ${waterCount}`);

  const existingCount = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.geojson')).length;
  console.log(`Existing land tiles: ${existingCount}`);
  console.log(`Total target: 64,800\n`);

  // Split longitude ranges among workers
  const lonPerWorker = Math.ceil(360 / NUM_WORKERS);
  const workers = [];
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < NUM_WORKERS; i++) {
    const lonStart = -180 + (i * lonPerWorker);
    const lonEnd = Math.min(lonStart + lonPerWorker, 180);

    const worker = new Worker(__filename, {
      workerData: { lonStart, lonEnd, workerId: i }
    });

    workers.push(new Promise((resolve, reject) => {
      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          process.stdout.write(`\rW${msg.workerId}: ${msg.progress} | `);
        } else if (msg.type === 'done') {
          results.push(msg.stats);
          resolve();
        }
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker ${i} exited with code ${code}`));
      });
    }));

    console.log(`Started worker ${i}: lon ${lonStart} to ${lonEnd}`);
  }

  // Wait for all workers
  await Promise.all(workers);

  // Aggregate results
  const totalStats = { created: 0, full_land: 0, full_water: 0, skipped: 0, errors: 0 };
  for (const r of results) {
    totalStats.created += r.created;
    totalStats.full_land += r.full_land;
    totalStats.full_water += r.full_water;
    totalStats.skipped += r.skipped;
    totalStats.errors += r.errors;
  }

  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n\n==================================');
  console.log(`DONE in ${(elapsed / 60).toFixed(1)} minutes`);
  console.log('Total stats:', totalStats);

  // Verify
  const finalCount = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.geojson')).length;
  console.log(`Final tile count: ${finalCount}/64800`);
}

function workerProcess() {
  const polygonClipping = require('polygon-clipping');
  const { lonStart, lonEnd, workerId } = workerData;

  function createBboxPolygon(lon, lat, size) {
    return [[
      [lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]
    ]];
  }

  function geojsonToMultiPolygon(geojson) {
    const result = [];
    if (!geojson.features) return result;
    for (const feat of geojson.features) {
      const geom = feat.geometry;
      if (!geom) continue;
      if (geom.type === 'Polygon') result.push(geom.coordinates);
      else if (geom.type === 'MultiPolygon') result.push(...geom.coordinates);
    }
    return result;
  }

  function multiPolygonToGeoJSON(multiPoly) {
    if (!multiPoly || multiPoly.length === 0) {
      return { type: 'FeatureCollection', features: [] };
    }
    const validPolys = multiPoly.filter(p => p && p[0] && p[0].length >= 4);
    if (validPolys.length === 0) return { type: 'FeatureCollection', features: [] };
    if (validPolys.length === 1) {
      return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: validPolys[0] } }]
      };
    }
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: validPolys } }]
    };
  }

  const stats = { created: 0, full_land: 0, full_water: 0, skipped: 0, errors: 0 };
  let processed = 0;
  const total = (lonEnd - lonStart) * 180;

  for (let lon = lonStart; lon < lonEnd; lon++) {
    for (let lat = -90; lat < 90; lat++) {
      const filename = `${lon}_${lat}.geojson`;
      const waterPath = path.join(WATER_DIR, filename);
      const landPath = path.join(OUTPUT_DIR, filename);

      // Skip existing
      if (fs.existsSync(landPath)) {
        stats.skipped++;
        processed++;
        continue;
      }

      const bbox = createBboxPolygon(lon, lat, 1);

      if (!fs.existsSync(waterPath)) {
        // No water = full land
        fs.writeFileSync(landPath, JSON.stringify(multiPolygonToGeoJSON([bbox])));
        stats.full_land++;
      } else {
        try {
          const content = fs.readFileSync(waterPath, 'utf8');
          const data = JSON.parse(content);
          const waterPolys = geojsonToMultiPolygon(data);

          if (waterPolys.length === 0) {
            fs.writeFileSync(landPath, JSON.stringify(multiPolygonToGeoJSON([bbox])));
            stats.full_land++;
          } else {
            const landPolys = polygonClipping.difference([bbox], ...waterPolys);
            if (!landPolys || landPolys.length === 0) {
              fs.writeFileSync(landPath, JSON.stringify({ type: 'FeatureCollection', features: [] }));
              stats.full_water++;
            } else {
              fs.writeFileSync(landPath, JSON.stringify(multiPolygonToGeoJSON(landPolys)));
              stats.created++;
            }
          }
        } catch (e) {
          fs.writeFileSync(landPath, JSON.stringify(multiPolygonToGeoJSON([bbox])));
          stats.errors++;
        }
      }

      processed++;

      // Report progress every 100 tiles
      if (processed % 100 === 0) {
        parentPort.postMessage({
          type: 'progress',
          workerId,
          progress: `${processed}/${total}`
        });
      }
    }
  }

  parentPort.postMessage({ type: 'done', stats });
}
