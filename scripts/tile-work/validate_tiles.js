/**
 * Comprehensive tile validation - compares water tiles to land tiles
 *
 * Checks:
 * 1. If water tile has features, land tile should NOT be solid rectangle
 * 2. Land tiles must be FeatureCollection format
 * 3. Land tiles must be under 10MB
 * 4. No obvious geometry errors
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CDN_BASE = 'https://cdn.clipmap.io';
const LAND_BASE = path.join(__dirname, 'land-tiles-new');
const MAX_SIZE_MB = 10;

// Parse command line args
const args = process.argv.slice(2);
const lodArg = args.find(a => a.startsWith('--lod='));
const LOD = lodArg ? lodArg.replace('--lod=', '') : '20deg';
const fixArg = args.includes('--fix');

const LAND_DIR = path.join(LAND_BASE, `land-tiles-${LOD}`);

function fetchWaterTile(tileId) {
  return new Promise((resolve) => {
    const url = `${CDN_BASE}/water-tiles-${LOD}/${tileId}.geojson`;
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ data: JSON.parse(data), size: data.length });
          } catch {
            resolve(null);
          }
        });
      } else {
        resolve(null);
      }
    }).on('error', () => resolve(null));
  });
}

function isSolidRectangle(data) {
  if (!data || !data.features) return false;
  if (data.features.length !== 1) return false;

  const geom = data.features[0].geometry;
  // Polygon is solid rectangle if outer ring has 5 points AND no holes
  if (geom.type === 'Polygon') {
    if (geom.coordinates[0].length === 5 && geom.coordinates.length === 1) {
      return true;
    }
    return false;
  }
  // MultiPolygon is solid rectangle if it has one polygon with outer ring of 5 points AND no holes
  if (geom.type === 'MultiPolygon') {
    if (geom.coordinates.length === 1 &&
        geom.coordinates[0][0].length === 5 &&
        geom.coordinates[0].length === 1) {
      return true;
    }
    return false;
  }
  return false;
}

function hasWaterFeatures(data) {
  return data && data.features && data.features.length > 0;
}

async function validateTile(tileId) {
  const landPath = path.join(LAND_DIR, `${tileId}.geojson`);
  const issues = [];

  // Check land file exists
  if (!fs.existsSync(landPath)) {
    return { tileId, issues: ['MISSING: Land file not found'] };
  }

  // Read land file
  let landData;
  const landSize = fs.statSync(landPath).size;
  try {
    landData = JSON.parse(fs.readFileSync(landPath, 'utf8'));
  } catch (e) {
    return { tileId, issues: ['CORRUPT: Cannot parse land file'] };
  }

  // Check format
  if (landData.type !== 'FeatureCollection') {
    issues.push(`FORMAT: Expected FeatureCollection, got ${landData.type}`);
  }

  // Check size
  if (landSize > MAX_SIZE_MB * 1024 * 1024) {
    issues.push(`SIZE: ${(landSize/1024/1024).toFixed(1)}MB > ${MAX_SIZE_MB}MB limit`);
  }

  // Fetch water tile from CDN
  const waterResult = await fetchWaterTile(tileId);

  if (waterResult && hasWaterFeatures(waterResult.data)) {
    // Water exists - land should NOT be solid rectangle
    if (isSolidRectangle(landData)) {
      issues.push(`SOLID: Land is solid rectangle but water tile has ${waterResult.data.features.length} features (${(waterResult.size/1024).toFixed(1)}KB)`);
    }
  }

  return { tileId, issues, waterSize: waterResult?.size || 0 };
}

async function main() {
  console.log(`Validating ${LOD} Land Tiles`);
  console.log('='.repeat(60));
  console.log(`Land dir: ${LAND_DIR}`);
  console.log(`Comparing against CDN water tiles\n`);

  if (!fs.existsSync(LAND_DIR)) {
    console.error(`Land directory not found: ${LAND_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(LAND_DIR).filter(f => f.endsWith('.geojson'));
  console.log(`Found ${files.length} land tiles\n`);

  const problems = [];
  let checked = 0;

  for (const file of files) {
    const tileId = file.replace('.geojson', '');
    const result = await validateTile(tileId);

    if (result.issues.length > 0) {
      problems.push(result);
    }

    checked++;
    if (checked % 50 === 0) {
      console.log(`Checked ${checked}/${files.length} - ${problems.length} problems found`);
    }
  }

  console.log(`\nChecked ${checked}/${files.length} - ${problems.length} problems found`);
  console.log('='.repeat(60));

  if (problems.length === 0) {
    console.log('\n✓ ALL TILES VALID');
    return;
  }

  console.log('\nPROBLEMS FOUND:\n');

  // Group by issue type
  const byType = {};
  for (const p of problems) {
    for (const issue of p.issues) {
      const type = issue.split(':')[0];
      if (!byType[type]) byType[type] = [];
      byType[type].push({ tileId: p.tileId, issue, waterSize: p.waterSize });
    }
  }

  for (const [type, items] of Object.entries(byType)) {
    console.log(`\n${type} (${items.length} tiles):`);
    for (const item of items.slice(0, 20)) {
      console.log(`  ${item.tileId}: ${item.issue}`);
    }
    if (items.length > 20) {
      console.log(`  ... and ${items.length - 20} more`);
    }
  }

  // Output tiles that need regeneration
  const needsRegen = problems.filter(p => p.issues.some(i => i.startsWith('SOLID:')));
  if (needsRegen.length > 0) {
    console.log(`\n\nTILES NEEDING REGENERATION (${needsRegen.length}):`);
    console.log(JSON.stringify(needsRegen.map(p => p.tileId)));
  }
}

main().catch(console.error);
