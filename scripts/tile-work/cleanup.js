/**
 * Cleanup tile-work directory
 * Removes intermediate files, old versions, and unused data
 */

const fs = require('fs');
const path = require('path');

const BASE = __dirname;

// Directories to DELETE (intermediate/old/unused)
const DELETE_DIRS = [
  'boundaries',           // intermediate
  'inland',               // intermediate
  'roads',                // not used
  'water-nonsplit',       // intermediate
  'water-polygons-split-4326',  // source (can redownload)
  'pbf',                  // unused
  'planet',               // unused
  'lod-sources',          // replaced by lod-sources-clean
  'lod-temp',             // temporary
  'temp',                 // temporary
  'tiles-clean',          // intermediate
  'land-tiles',           // old version, replaced by land-tiles-new
  'water-tiles-dissolved', // old version
  'water-tiles-v2',       // replaced by water-tiles-v3
];

// Large files to DELETE (raw/intermediate data)
const DELETE_FILES = [
  // Huge GPKG files (>130GB total!)
  'all_water.gpkg',
  'boundaries_merged.gpkg',
  'inland_merged.gpkg',
  'roads_merged.gpkg',
  'land_polygons.gpkg',
  'water_polygons.gpkg',

  // Shapefile sets (raw/intermediate)
  'all_water.dbf', 'all_water.prj', 'all_water.shp', 'all_water.shx',

  // Boundary shapefiles
  'boundaries_antarctica.dbf', 'boundaries_antarctica.prj', 'boundaries_antarctica.shp', 'boundaries_antarctica.shx',
  'boundaries_asia.dbf', 'boundaries_asia.prj', 'boundaries_asia.shp', 'boundaries_asia.shx',
  'boundaries_australia-oceania.dbf', 'boundaries_australia-oceania.prj', 'boundaries_australia-oceania.shp', 'boundaries_australia-oceania.shx',
  'boundaries_central-america.dbf', 'boundaries_central-america.prj', 'boundaries_central-america.shp', 'boundaries_central-america.shx',
  'boundaries_europe.dbf', 'boundaries_europe.prj', 'boundaries_europe.shp', 'boundaries_europe.shx',
  'boundaries_merged.dbf', 'boundaries_merged.prj', 'boundaries_merged.shp', 'boundaries_merged.shx',
  'boundaries_north-america.dbf', 'boundaries_north-america.prj', 'boundaries_north-america.shp', 'boundaries_north-america.shx',
  'boundaries_source_10deg.dbf', 'boundaries_source_10deg.prj', 'boundaries_source_10deg.shp', 'boundaries_source_10deg.shx',
  'boundaries_source_1deg.dbf', 'boundaries_source_1deg.prj', 'boundaries_source_1deg.shp', 'boundaries_source_1deg.shx',
  'boundaries_source_20deg.dbf', 'boundaries_source_20deg.prj', 'boundaries_source_20deg.shp', 'boundaries_source_20deg.shx',
  'boundaries_source_5deg.dbf', 'boundaries_source_5deg.prj', 'boundaries_source_5deg.shp', 'boundaries_source_5deg.shx',
  'boundaries_south-america.dbf', 'boundaries_south-america.prj', 'boundaries_south-america.shp', 'boundaries_south-america.shx',

  // Inland water shapefiles
  'inland_antarctica.dbf', 'inland_antarctica.prj', 'inland_antarctica.shp', 'inland_antarctica.shx',
  'inland_australia-oceania.dbf', 'inland_australia-oceania.prj', 'inland_australia-oceania.shp', 'inland_australia-oceania.shx',
  'inland_central-america.dbf', 'inland_central-america.prj', 'inland_central-america.shp', 'inland_central-america.shx',
  'inland_south-america.dbf', 'inland_south-america.prj', 'inland_south-america.shp', 'inland_south-america.shx',
  'inland_water_merged.dbf', 'inland_water_merged.prj', 'inland_water_merged.shp', 'inland_water_merged.shx',

  // Roads shapefiles (huge, unused)
  'roads_antarctica.dbf', 'roads_antarctica.prj', 'roads_antarctica.shp', 'roads_antarctica.shx',
  'roads_asia.dbf', 'roads_asia.prj', 'roads_asia.shp', 'roads_asia.shx',
  'roads_central-america.dbf', 'roads_central-america.prj', 'roads_central-america.shp', 'roads_central-america.shx',
  'roads_europe.dbf', 'roads_europe.prj', 'roads_europe.shp', 'roads_europe.shx',

  // Water source shapefiles (have GPKG versions in lod-sources-clean)
  'water_source_10deg.dbf', 'water_source_10deg.prj', 'water_source_10deg.shp', 'water_source_10deg.shx',
  'water_source_1deg.dbf', 'water_source_1deg.prj', 'water_source_1deg.shp', 'water_source_1deg.shx',
  'water_source_20deg.dbf', 'water_source_20deg.prj', 'water_source_20deg.shp', 'water_source_20deg.shx',
  'water_source_5deg.dbf', 'water_source_5deg.prj', 'water_source_5deg.shp', 'water_source_5deg.shx',

  // Source ZIP files
  'water-polygons-split-4326.zip',
  'water-polygons-complete-4326.zip',

  // Old/superseded scripts
  'add_land_to_gpkg.ps1',
  'add_nesting_depth.ps1',
  'analyze_area_distribution.py',
  'analyze_duplicates.py',
  'analyze_more_dupes.py',
  'check_fids.py',
  'check_spatial_index.ps1',
  'compute_bulk_nesting.ps1',
  'compute_nesting_depth.py',
  'compute_nesting_ogrinfo.ps1',
  'compute_nesting_qgis.py',
  'compute_nesting_qgis_v2.py',
  'compute_nesting_qgis_v3.py',
  'compute_nesting_rtree.ps1',
  'convert_land.ps1',
  'convert_water.ps1',
  'find_attrs.ps1',
  'find_islands.ps1',
  'fix_duplicates.py',
  'fix_hole_areas.py',
  'fix_missing_holes.py',
  'fix_missing_holes_v2.py',
  'fix_missing_holes_v3.py',
  'fix_solid_rectangles.js',      // superseded by v3
  'fix_solid_rectangles_v2.js',   // superseded by v3
  'generate_land_curl.js',        // superseded
  'generate_land_fast.js',        // superseded by parallel
  'generate_land_from_cdn_water.js', // superseded
  'generate_land_mapshaper.js',   // superseded
  'generate_land_simple.js',      // superseded
  'generate_land_tiles.py',       // superseded
  'generate_land_tiles_fast.py',  // superseded
  'generate_land_turf.js',        // superseded
  'generate_tiles_from_gpkg.js',  // superseded
  'generate_water_lods.ps1',      // superseded
  'generate_water_lods_qgis.py',  // superseded
  'generate_water_lods_v2.py',    // superseded
  'list_columns.ps1',
  'list_ellis_features.ps1',
  'merge_water_layers.py',
  'query_fids.ps1',
  'query_islands.ps1',
  'query_not_water.ps1',
  'test_containment.ps1',
  'test_hole_fix.py',
  'test_hole_fix_pairs.py',
  'test_islands.ps1',
  'test_islands_v2.ps1',
  'test_land_containment.ps1',
  'test_lod_generation.py',
  'test_nesting_optimized.ps1',
  'test_nesting_sample.ps1',
  'test_point_nesting.ps1',
  'test_rtree_all.ps1',
  'test_rtree_query.ps1',
  'tile_water_sources.py',        // superseded
  'tile_water_sources_v2.py',     // superseded
  'upload_25deg_water.js',        // one-off
  'upload_all_land_tiles.js',     // superseded
  'upload_all_to_r2.js',          // superseded
  'upload_fixed_10deg.js',        // one-off
  'upload_fixed_tiles.js',        // one-off
  'upload_to_r2.js',              // superseded
  'upload_world_tiles.js',        // one-off
  'verify_fixes.py',
  'fix_alaska_tiles.js',          // one-off
  'fix_all_20deg_tiles.js',       // one-off
  'fix_all_lods_format.js',       // one-off
  'fix_problem_tiles.js',         // one-off
  'fix_problem_tiles_25deg.js',   // one-off
  'fix_world_tiles.js',           // one-off
  'TILE_CLEANUP_PLAN.md',         // outdated
  'solid_rectangles.json',        // temporary output
  'generate_land_1deg_fast.js',   // superseded by parallel
];

// Files to KEEP (essential)
const KEEP_FILES = [
  // Documentation
  'TILE_PIPELINE.md',

  // Current scripts
  'generate_land_1deg_parallel.js',
  'generate_land_all_lods.js',
  'generate_water_from_land.js',
  'upload_new_land_tiles.js',
  'upload_new_tiles_v3.js',

  // Validation/utility
  'find_solid_rectangles.js',
  'fix_solid_rectangles_v3.js',
  'simplify_large_tiles.js',
  'simplify_all_lods.js',
  'list_r2_bucket.js',
  'cleanup_r2.js',
  'check_water_tiles.js',
  'count_tiles.js',
  'ensure_complete_coverage.js',
  'fill_empty_tiles.js',
  'find_solid_tiles.js',
  'validate_tiles.js',
  'generate_complete_tileset.js',
  'generate_world_tiles.js',

  // Node
  'package.json',
  'package-lock.json',

  // This script
  'cleanup.js',
];

// Directories to KEEP
const KEEP_DIRS = [
  'node_modules',
  'land-tiles-new',     // Final land tiles
  'water-tiles-v3',     // Final water tiles
  'water-tiles',        // Source water tiles (1deg)
  'lod-sources-clean',  // Clean GPKG sources
  'world-tiles',        // World tiles
];

function rmSync(p) {
  try {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
    return true;
  } catch (e) {
    return false;
  }
}

function formatSize(bytes) {
  if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + 'GB';
  if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + 'MB';
  if (bytes > 1e3) return (bytes / 1e3).toFixed(1) + 'KB';
  return bytes + 'B';
}

console.log('Tile-work Cleanup');
console.log('=================\n');

let totalFreed = 0;
let deletedCount = 0;

// Delete directories
console.log('Deleting directories...');
for (const dir of DELETE_DIRS) {
  const p = path.join(BASE, dir);
  if (fs.existsSync(p)) {
    let size = 0;
    try {
      // Estimate size (won't be accurate for large dirs but gives indication)
      const files = fs.readdirSync(p);
      size = files.length * 50000; // rough estimate
    } catch {}

    if (rmSync(p)) {
      console.log(`  Deleted: ${dir}/`);
      deletedCount++;
      totalFreed += size;
    } else {
      console.log(`  FAILED: ${dir}/`);
    }
  }
}

// Delete files
console.log('\nDeleting files...');
for (const file of DELETE_FILES) {
  const p = path.join(BASE, file);
  if (fs.existsSync(p)) {
    let size = 0;
    try {
      size = fs.statSync(p).size;
    } catch {}

    if (rmSync(p)) {
      console.log(`  Deleted: ${file} (${formatSize(size)})`);
      deletedCount++;
      totalFreed += size;
    } else {
      console.log(`  FAILED: ${file}`);
    }
  }
}

console.log('\n=================');
console.log(`Deleted: ${deletedCount} items`);
console.log(`Space freed: ~${formatSize(totalFreed)}`);

// List remaining files
console.log('\nRemaining files:');
const remaining = fs.readdirSync(BASE).filter(f => {
  if (f === 'node_modules') return false;
  return true;
});
for (const f of remaining) {
  const p = path.join(BASE, f);
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    console.log(`  ${f}/`);
  } else {
    console.log(`  ${f}`);
  }
}
