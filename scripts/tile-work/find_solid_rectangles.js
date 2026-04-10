/**
 * Find all solid rectangle land tiles that should have water cut out
 * These are tiles that were incorrectly generated as full land rectangles
 */

const fs = require('fs');
const path = require('path');

const LAND_DIR = path.join(__dirname, 'land-tiles-new');

const LODS = [
  { name: '10deg', folder: 'land-tiles-10deg', size: 10 },
  { name: '5deg', folder: 'land-tiles-5deg', size: 5 },
  { name: '2.5deg', folder: 'land-tiles-2.5deg', size: 2.5 },
];

function parseCoords(filename, tileSize) {
  const stem = filename.replace('.geojson', '');
  const parts = stem.split('_');

  if (tileSize === 2.5) {
    // Format: -15_57.5 or 102.5_10
    return { lon: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
  }
  // Format: -70_-10
  return { lon: parseFloat(parts[0]), lat: parseFloat(parts[1]) };
}

function isNearlyEqual(a, b, epsilon = 0.01) {
  return Math.abs(a - b) < epsilon;
}

function isSolidRectangle(data, lon, lat, size) {
  if (!data.features || data.features.length === 0) return false;
  if (data.features.length > 1) return false;

  const feat = data.features[0];
  const geom = feat.geometry;

  // Must be a simple polygon
  if (geom.type !== 'Polygon') return false;

  // A solid rectangle has no holes (water bodies)
  if (geom.coordinates.length > 1) return false;

  const ring = geom.coordinates[0];

  // A solid rectangle has exactly 5 points (4 corners + closing point)
  if (ring.length !== 5) return false;

  // Check if all 4 corners match the tile bounds
  const corners = [
    [lon, lat],
    [lon + size, lat],
    [lon + size, lat + size],
    [lon, lat + size],
  ];

  let matchedCorners = 0;
  for (const corner of corners) {
    for (const point of ring) {
      if (isNearlyEqual(point[0], corner[0]) && isNearlyEqual(point[1], corner[1])) {
        matchedCorners++;
        break;
      }
    }
  }

  return matchedCorners === 4;
}

function processLOD(lod) {
  const dir = path.join(LAND_DIR, lod.folder);

  if (!fs.existsSync(dir)) {
    console.log(`  Directory not found: ${dir}`);
    return [];
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.geojson'));
  const solidTiles = [];

  for (const file of files) {
    const coords = parseCoords(file, lod.size);
    if (!coords) continue;

    // Skip Antarctica (lat -90 area) - those are expected to be solid
    if (coords.lat <= -90 + lod.size) continue;

    try {
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const data = JSON.parse(content);

      if (isSolidRectangle(data, coords.lon, coords.lat, lod.size)) {
        solidTiles.push({
          file,
          lon: coords.lon,
          lat: coords.lat,
        });
      }
    } catch (e) {
      // Skip files that can't be parsed
    }
  }

  return solidTiles;
}

console.log('Finding Solid Rectangle Tiles');
console.log('=============================\n');

const allSolid = {};

for (const lod of LODS) {
  console.log(`Checking ${lod.name}...`);
  const solid = processLOD(lod);
  allSolid[lod.name] = solid;

  if (solid.length > 0) {
    console.log(`  Found ${solid.length} solid rectangle tiles:`);
    for (const t of solid.slice(0, 10)) {
      console.log(`    ${t.file} (${t.lon}, ${t.lat})`);
    }
    if (solid.length > 10) {
      console.log(`    ... and ${solid.length - 10} more`);
    }
  } else {
    console.log(`  No solid rectangles found`);
  }
  console.log('');
}

// Summary
console.log('='.repeat(50));
console.log('SUMMARY');
console.log('='.repeat(50));

let totalSolid = 0;
for (const lod of LODS) {
  const count = allSolid[lod.name].length;
  totalSolid += count;
  console.log(`${lod.name}: ${count} solid rectangles`);
}
console.log(`\nTotal: ${totalSolid} tiles need regeneration`);

// Output JSON for regeneration script
const outputPath = path.join(__dirname, 'solid_rectangles.json');
fs.writeFileSync(outputPath, JSON.stringify(allSolid, null, 2));
console.log(`\nSaved to: ${outputPath}`);
