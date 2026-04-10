/**
 * Simplify large water tiles across all LODs
 * Only processes tiles > SIZE_THRESHOLD_MB
 *
 * Run with: node simplify_large_tiles.js
 */

const fs = require('fs');
const path = require('path');
const simplify = require('@turf/simplify').default;

const WATER_DIR = 'C:/Users/user/source/repos/clipmap/scripts/tile-work/water-tiles';
const SIZE_THRESHOLD_MB = 10; // Only simplify tiles larger than this
const SIZE_THRESHOLD_BYTES = SIZE_THRESHOLD_MB * 1024 * 1024;

// Simplification tolerance per LOD (in degrees)
// Larger tiles = more aggressive simplification
const SIMPLIFY_TOLERANCE = {
  '20deg': 0.01,    // ~1.1km
  '10deg': 0.005,   // ~550m
  '5deg': 0.002,    // ~220m
  '2.5deg': 0.001,  // ~110m
  '1deg': 0.0005,   // ~55m
};

const LODS = [
  { name: '20deg', folder: 'water-tiles-20deg' },
  { name: '10deg', folder: 'water-tiles-10deg' },
  { name: '5deg', folder: 'water-tiles-5deg' },
  { name: '2.5deg', folder: 'water-tiles-2.5deg' },
  { name: '1deg', folder: 'water-tiles-1deg' },
];

function simplifyGeojson(geojson, tolerance) {
  const simplified = {
    type: "FeatureCollection",
    features: []
  };

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;

    try {
      const simplifiedFeature = simplify(feature, {
        tolerance: tolerance,
        highQuality: true,
        mutate: false
      });

      // Skip if geometry became empty/invalid
      if (simplifiedFeature.geometry &&
          simplifiedFeature.geometry.coordinates &&
          simplifiedFeature.geometry.coordinates.length > 0) {
        simplified.features.push(simplifiedFeature);
      }
    } catch (e) {
      // Keep original if simplification fails
      simplified.features.push(feature);
    }
  }

  return simplified;
}

function processLOD(lod) {
  const waterDir = path.join(WATER_DIR, lod.folder);
  const tolerance = SIMPLIFY_TOLERANCE[lod.name] || 0.001;

  if (!fs.existsSync(waterDir)) {
    console.log(`  Skipping ${lod.name}: directory not found`);
    return { processed: 0, skipped: 0, errors: 0 };
  }

  const files = fs.readdirSync(waterDir).filter(f => f.endsWith('.geojson'));

  // Find large files
  const largeFiles = [];
  for (const file of files) {
    const filePath = path.join(waterDir, file);
    const stats = fs.statSync(filePath);
    if (stats.size > SIZE_THRESHOLD_BYTES) {
      largeFiles.push({ name: file, path: filePath, size: stats.size });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`LOD: ${lod.name} | Total: ${files.length} | Large (>${SIZE_THRESHOLD_MB}MB): ${largeFiles.length}`);
  console.log(`Tolerance: ${tolerance}° (~${(tolerance * 111).toFixed(0)}m)`);
  console.log(`${'='.repeat(60)}`);

  if (largeFiles.length === 0) {
    console.log('  No large tiles to process');
    return { processed: 0, skipped: files.length, errors: 0 };
  }

  const stats = { processed: 0, errors: 0 };

  for (let i = 0; i < largeFiles.length; i++) {
    const file = largeFiles[i];
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    console.log(`  [${i + 1}/${largeFiles.length}] ${file.name} (${sizeMB}MB)`);

    try {
      // Read and parse
      const content = fs.readFileSync(file.path, 'utf8');
      const geojson = JSON.parse(content);

      const originalFeatures = geojson.features.length;

      // Simplify
      const simplified = simplifyGeojson(geojson, tolerance);

      // Write back
      const newContent = JSON.stringify(simplified);
      fs.writeFileSync(file.path, newContent);

      const newSize = fs.statSync(file.path).size;
      const newSizeMB = (newSize / 1024 / 1024).toFixed(1);
      const reduction = ((1 - newSize / file.size) * 100).toFixed(0);

      console.log(`    ${sizeMB}MB → ${newSizeMB}MB (${reduction}% reduction) | Features: ${originalFeatures} → ${simplified.features.length}`);
      stats.processed++;
    } catch (e) {
      console.log(`    ERROR: ${e.message.slice(0, 50)}`);
      stats.errors++;
    }
  }

  return stats;
}

async function main() {
  console.log('Large Tile Simplifier');
  console.log('=====================');
  console.log(`Threshold: >${SIZE_THRESHOLD_MB}MB`);

  const start = Date.now();
  let totalProcessed = 0;
  let totalErrors = 0;

  for (const lod of LODS) {
    const stats = processLOD(lod);
    totalProcessed += stats.processed;
    totalErrors += stats.errors;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`DONE in ${((Date.now() - start) / 1000).toFixed(0)}s`);
  console.log(`Processed: ${totalProcessed} | Errors: ${totalErrors}`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
