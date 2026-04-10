/**
 * Generate world.geojson tiles (combined land and water for entire world)
 *
 * Process:
 * 1. Merge all 20deg land tiles into single world_land.geojson
 * 2. Simplify iteratively until ~10MB
 * 3. Generate world_water = world_bbox - world_land
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LAND_TILES_DIR = path.join(__dirname, 'land-tiles-new', 'land-tiles-20deg');
const OUTPUT_DIR = path.join(__dirname, 'world-tiles');
const TEMP_DIR = path.join(__dirname, 'temp');

const TARGET_SIZE_MB = 10;

function getFileSizeMB(filePath) {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
}

function createWorldBbox() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
          [-180, -90]
        ]]
      }
    }]
  };
}

async function main() {
  console.log('Generate World Tiles');
  console.log('====================\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // Step 1: Get all land tiles
  console.log('Step 1: Finding land tiles...');
  const landFiles = fs.readdirSync(LAND_TILES_DIR)
    .filter(f => f.endsWith('.geojson'))
    .map(f => path.join(LAND_TILES_DIR, f));

  console.log(`  Found ${landFiles.length} land tiles`);

  // Step 2: Merge all land tiles
  console.log('\nStep 2: Merging all land tiles...');
  const mergedPath = path.join(TEMP_DIR, 'world_land_merged.geojson');

  // Create a file list for mapshaper
  const fileListPath = path.join(TEMP_DIR, 'land_files.txt');
  fs.writeFileSync(fileListPath, landFiles.join('\n'));

  // Merge using mapshaper - combine all files, merge layers, dissolve
  try {
    execSync(`npx mapshaper -i ${landFiles.map(f => `"${f}"`).join(' ')} combine-files -merge-layers force -dissolve2 -o "${mergedPath}" format=geojson`, {
      encoding: 'utf8',
      maxBuffer: 500 * 1024 * 1024,
      timeout: 600000,
      windowsHide: true
    });
  } catch (e) {
    console.error('  Merge failed, trying alternative approach...');
    // Alternative: merge in batches
    const batchSize = 20;
    let currentMerged = null;

    for (let i = 0; i < landFiles.length; i += batchSize) {
      const batch = landFiles.slice(i, i + batchSize);
      const batchPath = path.join(TEMP_DIR, `batch_${i}.geojson`);

      if (currentMerged) {
        batch.unshift(currentMerged);
      }

      execSync(`npx mapshaper -i ${batch.map(f => `"${f}"`).join(' ')} combine-files -merge-layers force -dissolve2 -o "${batchPath}" format=geojson`, {
        encoding: 'utf8',
        maxBuffer: 500 * 1024 * 1024,
        timeout: 300000,
        windowsHide: true
      });

      currentMerged = batchPath;
      console.log(`  Batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(landFiles.length/batchSize)} merged`);
    }

    fs.copyFileSync(currentMerged, mergedPath);
  }

  let currentSize = getFileSizeMB(mergedPath);
  console.log(`  Merged size: ${currentSize.toFixed(2)} MB`);

  // Step 3: Simplify if needed
  console.log('\nStep 3: Simplifying to target size...');
  let simplifiedPath = mergedPath;
  let simplifyPercent = 100;

  while (currentSize > TARGET_SIZE_MB && simplifyPercent > 1) {
    simplifyPercent = Math.max(1, simplifyPercent * (TARGET_SIZE_MB / currentSize) * 0.9);
    const newPath = path.join(TEMP_DIR, `world_land_simplified_${simplifyPercent.toFixed(1)}.geojson`);

    console.log(`  Simplifying to ${simplifyPercent.toFixed(1)}%...`);

    execSync(`npx mapshaper "${simplifiedPath}" -simplify ${simplifyPercent}% -o "${newPath}" format=geojson`, {
      encoding: 'utf8',
      maxBuffer: 500 * 1024 * 1024,
      timeout: 300000,
      windowsHide: true
    });

    simplifiedPath = newPath;
    currentSize = getFileSizeMB(simplifiedPath);
    console.log(`  New size: ${currentSize.toFixed(2)} MB`);
  }

  // Step 4: Copy final land to output
  console.log('\nStep 4: Writing final land file...');
  const finalLandPath = path.join(OUTPUT_DIR, 'world_land.geojson');
  fs.copyFileSync(simplifiedPath, finalLandPath);
  console.log(`  Saved: ${finalLandPath} (${getFileSizeMB(finalLandPath).toFixed(2)} MB)`);

  // Step 5: Generate water = world_bbox - land
  console.log('\nStep 5: Generating world water...');
  const bboxPath = path.join(TEMP_DIR, 'world_bbox.geojson');
  fs.writeFileSync(bboxPath, JSON.stringify(createWorldBbox()));

  const finalWaterPath = path.join(OUTPUT_DIR, 'world_water.geojson');

  execSync(`npx mapshaper "${bboxPath}" -erase "${finalLandPath}" -o "${finalWaterPath}" format=geojson`, {
    encoding: 'utf8',
    maxBuffer: 500 * 1024 * 1024,
    timeout: 300000,
    windowsHide: true
  });

  console.log(`  Saved: ${finalWaterPath} (${getFileSizeMB(finalWaterPath).toFixed(2)} MB)`);

  // Summary
  console.log('\n====================');
  console.log('DONE!');
  console.log(`  Land:  ${getFileSizeMB(finalLandPath).toFixed(2)} MB`);
  console.log(`  Water: ${getFileSizeMB(finalWaterPath).toFixed(2)} MB`);
  console.log('====================');
}

main().catch(console.error);
