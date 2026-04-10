/**
 * Find tiles that are likely solid rectangles (full land bbox without water cutouts)
 * These are typically very small files (~180-300 bytes) that should have water
 */
const fs = require('fs');
const path = require('path');

const BASE_DIR = path.join(__dirname, 'land-tiles-new');

// Parse command line args
const args = process.argv.slice(2);
const lodArg = args.find(a => a.startsWith('--lod='));
const LOD = lodArg ? lodArg.replace('--lod=', '') : '10deg';

const TILES_DIR = path.join(BASE_DIR, `land-tiles-${LOD}`);

// Tiles under this size are suspicious (likely solid bbox)
const SUSPICIOUS_SIZE = 500; // bytes

function main() {
  console.log(`Finding solid rectangle tiles in ${LOD}`);
  console.log('='.repeat(50));

  const files = fs.readdirSync(TILES_DIR).filter(f => f.endsWith('.geojson'));

  const suspicious = [];

  for (const file of files) {
    const filePath = path.join(TILES_DIR, file);
    const size = fs.statSync(filePath).size;

    if (size < SUSPICIOUS_SIZE) {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // Check if it's a simple rectangle (single polygon with 5 coords)
      let isRectangle = false;
      if (data.features && data.features.length === 1) {
        const geom = data.features[0].geometry;
        if (geom.type === 'Polygon' && geom.coordinates[0].length === 5) {
          isRectangle = true;
        }
      }

      if (isRectangle) {
        const tileId = file.replace('.geojson', '');
        suspicious.push({ tileId, size });
      }
    }
  }

  if (suspicious.length === 0) {
    console.log('No suspicious solid rectangle tiles found!');
    return;
  }

  console.log(`Found ${suspicious.length} solid rectangle tiles:\n`);
  suspicious.sort((a, b) => a.tileId.localeCompare(b.tileId));

  for (const { tileId, size } of suspicious) {
    console.log(`  ${tileId} (${size} bytes)`);
  }

  console.log('\nThese tiles should be checked - they may need water cutouts.');
}

main();
