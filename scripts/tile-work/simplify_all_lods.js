/**
 * Simplify large tiles across all LODs to under 10MB
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, 'land-tiles-new');
const TARGET_SIZE_MB = 10;

// Parse command line args
const args = process.argv.slice(2);
const onlyArg = args.find(a => a.startsWith('--only='));
const LODS = onlyArg
  ? onlyArg.replace('--only=', '').split(',')
  : ['20deg', '10deg', '5deg'];

function getFileSizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024);
}

function simplifyTile(tilePath) {
  const tileId = path.basename(tilePath, '.geojson');
  let currentSize = getFileSizeMB(tilePath);

  if (currentSize <= TARGET_SIZE_MB) {
    return false;
  }

  console.log(`  ${tileId}: ${currentSize.toFixed(1)} MB`);

  // Calculate initial simplification percentage
  let simplifyPercent = (TARGET_SIZE_MB / currentSize) * 100 * 0.85;

  const tempPath = tilePath.replace('.geojson', '_temp.geojson');

  let attempts = 0;
  while (currentSize > TARGET_SIZE_MB && simplifyPercent > 1 && attempts < 5) {
    attempts++;
    try {
      execSync(`npx mapshaper "${tilePath}" -simplify ${simplifyPercent}% -o "${tempPath}" format=geojson`, {
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
        windowsHide: true,
        timeout: 120000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const newSize = getFileSizeMB(tempPath);

      if (newSize <= TARGET_SIZE_MB) {
        // Convert to FeatureCollection if needed
        const data = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
        if (data.type === 'GeometryCollection') {
          const allCoords = [];
          for (const geom of data.geometries || []) {
            if (geom.type === 'Polygon') allCoords.push(geom.coordinates);
            else if (geom.type === 'MultiPolygon') allCoords.push(...geom.coordinates);
          }
          const fc = allCoords.length === 0
            ? { type: 'FeatureCollection', features: [] }
            : { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: allCoords }}]};
          fs.writeFileSync(tempPath, JSON.stringify(fc));
        }

        fs.copyFileSync(tempPath, tilePath);
        fs.unlinkSync(tempPath);
        console.log(`    -> ${newSize.toFixed(1)} MB (${simplifyPercent.toFixed(0)}%)`);
        return true;
      }

      // Need more simplification
      currentSize = newSize;
      simplifyPercent = simplifyPercent * (TARGET_SIZE_MB / newSize) * 0.9;
      fs.unlinkSync(tempPath);

    } catch (e) {
      try { fs.unlinkSync(tempPath); } catch {}
      console.log(`    Error: ${e.message.slice(0, 50)}`);
      return false;
    }
  }

  return false;
}

function processLod(lodName) {
  const tilesDir = path.join(BASE_DIR, `land-tiles-${lodName}`);

  if (!fs.existsSync(tilesDir)) {
    console.log(`Skipping ${lodName} - directory not found\n`);
    return { simplified: 0, total: 0 };
  }

  // Find all tiles over target size
  const files = fs.readdirSync(tilesDir)
    .filter(f => f.endsWith('.geojson') && !f.includes('_temp'))
    .map(f => path.join(tilesDir, f))
    .filter(f => getFileSizeMB(f) > TARGET_SIZE_MB)
    .sort((a, b) => getFileSizeMB(b) - getFileSizeMB(a));

  console.log(`${lodName}: ${files.length} tiles over ${TARGET_SIZE_MB} MB`);

  let simplified = 0;
  for (const file of files) {
    if (simplifyTile(file)) {
      simplified++;
    }
  }

  console.log(`  Simplified: ${simplified}/${files.length}\n`);
  return { simplified, total: files.length };
}

async function main() {
  console.log('Simplify Large Tiles - All LODs');
  console.log('================================');
  console.log(`Target: ${TARGET_SIZE_MB} MB`);
  console.log(`LODs: ${LODS.join(', ')}\n`);

  let totalSimplified = 0;
  let totalLarge = 0;

  for (const lod of LODS) {
    const result = processLod(lod);
    totalSimplified += result.simplified;
    totalLarge += result.total;
  }

  console.log('================================');
  console.log(`Total: ${totalSimplified}/${totalLarge} simplified`);
}

main().catch(console.error);
