/**
 * Simplify large 20deg land tiles to under 10MB
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TILES_DIR = path.join(__dirname, 'land-tiles-new', 'land-tiles-20deg');
const TARGET_SIZE_MB = 10;

function getFileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024);
}

function simplifyTile(tilePath) {
  const tileId = path.basename(tilePath, '.geojson');
  let currentSize = getFileSizeMB(tilePath);

  if (currentSize <= TARGET_SIZE_MB) {
    return false;
  }

  console.log(`\n${tileId}: ${currentSize.toFixed(2)} MB`);

  // Calculate initial simplification percentage
  let simplifyPercent = (TARGET_SIZE_MB / currentSize) * 100 * 0.85; // 85% of target ratio

  const tempPath = path.join(TILES_DIR, `${tileId}_simplified.geojson`);

  while (currentSize > TARGET_SIZE_MB && simplifyPercent > 1) {
    console.log(`  Simplifying to ${simplifyPercent.toFixed(1)}%...`);

    try {
      execSync(`npx mapshaper "${tilePath}" -simplify ${simplifyPercent}% -o "${tempPath}" format=geojson`, {
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
        windowsHide: true,
        timeout: 120000
      });

      currentSize = getFileSizeMB(tempPath);
      console.log(`  Result: ${currentSize.toFixed(2)} MB`);

      if (currentSize <= TARGET_SIZE_MB) {
        // Replace original with simplified version
        fs.copyFileSync(tempPath, tilePath);
        fs.unlinkSync(tempPath);
        console.log(`  Done!`);
        return true;
      }

      // Need more simplification
      simplifyPercent = simplifyPercent * (TARGET_SIZE_MB / currentSize) * 0.9;
      fs.unlinkSync(tempPath);

    } catch (e) {
      console.error(`  Error: ${e.message}`);
      try { fs.unlinkSync(tempPath); } catch {}
      return false;
    }
  }

  return false;
}

async function main() {
  console.log('Simplify Large 20deg Land Tiles');
  console.log('================================');
  console.log(`Target: ${TARGET_SIZE_MB} MB\n`);

  // Find all tiles over target size
  const files = fs.readdirSync(TILES_DIR)
    .filter(f => f.endsWith('.geojson') && !f.includes('_simplified'))
    .map(f => path.join(TILES_DIR, f))
    .filter(f => getFileSizeMB(f) > TARGET_SIZE_MB)
    .sort((a, b) => getFileSizeMB(b) - getFileSizeMB(a));

  console.log(`Found ${files.length} tiles over ${TARGET_SIZE_MB} MB`);

  let simplified = 0;
  for (const file of files) {
    if (simplifyTile(file)) {
      simplified++;
    }
  }

  console.log(`\n================================`);
  console.log(`Simplified ${simplified}/${files.length} tiles`);
}

main().catch(console.error);
