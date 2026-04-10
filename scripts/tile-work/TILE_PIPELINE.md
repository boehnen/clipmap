# ClipMap Tile Pipeline

## Overview

ClipMap uses a multi-LOD (Level of Detail) tile system for water and land polygons. Tiles are stored in Cloudflare R2 and served via CDN.

## Tile Structure

### LOD Levels
| LOD | Tile Size | Grid | Total Tiles |
|-----|-----------|------|-------------|
| 20deg | 20° × 20° | 18 × 9 | 162 |
| 10deg | 10° × 10° | 36 × 18 | 648 |
| 5deg | 5° × 5° | 72 × 36 | 2,592 |
| 2.5deg | 2.5° × 2.5° | 144 × 72 | 10,368 |
| 1deg | 1° × 1° | 360 × 180 | 64,800 |

### File Naming
- Standard: `{lon}_{lat}.geojson` (e.g., `0_50.geojson`, `-80_30.geojson`)
- 2.5deg: `{lon}_{lat}.geojson` where decimals use underscore (e.g., `12_5_47_5.geojson` for 12.5°, 47.5°)
- World: `world.geojson` (combined all-tiles view)

### URL Structure (CDN)
```
https://cdn.clipmap.io/water-tiles-{lod}/{lon}_{lat}.geojson
https://cdn.clipmap.io/land-tiles-{lod}/{lon}_{lat}.geojson
```

## Data Sources

### Water Polygons
Source: OpenStreetMap water polygons from osmdata.openstreetmap.de

Pre-processed GPKG files in `lod-sources-clean/`:
- `water_source_world.gpkg` - Full detail world water
- `water_source_20deg.gpkg` - Simplified for 20° tiles
- `water_source_10deg.gpkg` - Simplified for 10° tiles
- `water_source_5deg.gpkg` - Simplified for 5° tiles
- `water_source_2.5deg.gpkg` - Simplified for 2.5° tiles
- `water_source_0.25deg.gpkg` - Full detail for 1° tiles

### Simplification
Large tiles (>10MB) are simplified using Douglas-Peucker algorithm via `@turf/simplify`:
- 20deg: 0.01° tolerance (~1.1km)
- 10deg: 0.005° tolerance (~550m)
- 5deg: 0.002° tolerance (~220m)
- 2.5deg: 0.001° tolerance (~110m)
- 1deg: 0.0005° tolerance (~55m)

## Tile Generation Pipeline

### Step 1: Water Tiles (from GPKG)
Water tiles are generated from source GPKG files, clipped to tile boundaries.

```
Source: lod-sources-clean/water_source_{lod}.gpkg
Output: water-tiles-{lod}/
```

### Step 2: Land Tiles (from Water)
Land is computed as the inverse of water within each tile:
```
land = tile_bbox - water
```

**Recommended Script:** `generate_land_mapshaper.js` (uses mapshaper, much faster)
- Downloads water tiles from CDN
- Uses mapshaper `-dissolve2` + `-erase` for fast polygon operations
- Handles complex coastal tiles with 1000+ polygons efficiently
- Outputs to `land-tiles-new/`

**Alternative:** `generate_land_from_cdn_water.js` (uses polygon-clipping, slower for complex tiles)

### Step 3: Dissolved Water (from Land)
For cleaner rendering, water is recomputed from land:
```
water_dissolved = tile_bbox - land
```

This produces single-polygon water tiles instead of multi-polygon.

### Step 4: World Tiles
World tiles combine all 20deg tiles into a single file:
1. Union all 20deg land tiles
2. Filter small islands to target ~10MB file size
3. Compute world water = world_bbox - world_land

## Scripts

### Generation
| Script | Purpose |
|--------|---------|
| `generate_land_mapshaper.js` | Generate land tiles using mapshaper (fast, recommended) |
| `generate_land_all_lods.js` | Generate all LODs with `--only=` and `--skip=` options |
| `generate_land_from_cdn_water.js` | Generate land using polygon-clipping (slower) |
| `simplify_large_tiles.js` | Simplify tiles >10MB |
| `fill_empty_tiles.js` | Ensure 100% coordinate coverage |

### Upload
| Script | Purpose |
|--------|---------|
| `upload_new_land_tiles.js` | Upload land tiles to R2 with direct paths |
| `upload_all_to_r2.js` | Upload all tiles to R2 (legacy)

### Validation
Check tiles with:
```bash
# Verify tile exists
curl -I https://cdn.clipmap.io/water-tiles-5deg/0_50.geojson

# Check content
curl -s https://cdn.clipmap.io/water-tiles-5deg/0_50.geojson | head -c 200
```

## R2 Bucket Structure

Bucket: `clipmap-tiles`
Custom Domain: `cdn.clipmap.io`

```
clipmap-tiles/
├── water-tiles-20deg/
│   ├── -180_-90.geojson
│   ├── ...
│   └── world.geojson
├── water-tiles-10deg/
├── water-tiles-5deg/
├── water-tiles-2.5deg/
├── water-tiles-1deg/
├── land-tiles-20deg/
├── land-tiles-10deg/
├── land-tiles-5deg/
├── land-tiles-2.5deg/
└── land-tiles-1deg/
```

## Common Issues

### Solid Water Tiles (No Land Cutouts)
**Cause:** Land tile generation failed or source water data missing.
**Fix:** Regenerate land from correct water source, then regenerate dissolved water.

### Empty Land Tiles (Full Water)
**Cause:** Area is entirely ocean (e.g., mid-Pacific).
**Status:** Expected behavior - empty FeatureCollection is correct.

### QGIS Import Failures
**Cause:** Empty FeatureCollections may show as "invalid" in some GIS tools.
**Fix:** These are valid GeoJSON - ignore QGIS warning or add dummy geometry.

### Large File Sizes (>10MB)
**Cause:** Complex coastlines (Norway, Indonesia, etc.)
**Fix:** Run `simplify_large_tiles.js` with appropriate tolerance.

---

## Known Pitfalls & Solutions (April 2026)

### 1. Solid Rectangle Land Tiles (No Coastline)

**Symptom:** Land tiles appear as perfect rectangles covering the entire tile bbox, even in coastal areas that should have water cut out.

**Root Cause:** The polygon difference operation (`land = bbox - water`) failed silently. This happened when:
- Water tile was missing or empty for that coordinate
- Water tile filename format didn't match expected format
- Water polygons didn't overlap with the tile bbox (coordinate mismatch)

**Detection Script:** `find_solid_rectangles.js`
- Scans land tiles for single Polygon features with exactly 5 points matching tile corners
- **Important:** Must also check `geom.coordinates.length === 1` (no holes) - tiles with inland lakes have 5-point outer rings but ARE valid

**Fix Script:** `fix_solid_rectangles_v3.js`
- Uses matching LOD water tiles (not cross-LOD fallback)
- Regenerates `land = bbox - water` for flagged tiles

**Prevention:**
1. Always validate water tiles exist before running land generation
2. Use consistent filename formats across all LODs
3. After generation, run `find_solid_rectangles.js` as QA check
4. Expected solid rectangles: Antarctica, Greenland, Sahara (no water to cut)

### 2. Filename Format Mismatch Between LODs

**Problem:** Different LODs use different filename formats:
- 10deg, 5deg, 20deg: `{lon}_{lat}.geojson` (e.g., `-100_50.geojson`)
- 2.5deg: `{lon}_{lat}.geojson` with decimals (e.g., `-102.5_47.5.geojson`)
- 2.5deg water (legacy): `{lonInt}_{lonDec}_{latInt}_{latDec}.geojson` (e.g., `-102_5_47_5.geojson`)

**Impact:** Scripts looking up matching water tiles may generate wrong filenames.

**Prevention:**
1. Standardize on decimal format for 2.5deg: `-102.5_47.5.geojson`
2. Document format in this file and keep it consistent
3. When writing tile lookup code, handle both formats or migrate to single format

### 3. 20deg Latitude Grid Offset

**Problem:** 20deg tiles use latitude values: -90, -70, -50, -30, -10, 10, 30, 50, 70 (offset by 10° from expected 0, 20, 40...).

**Root Cause:** Natural Earth data alignment or original processing decision.

**Impact:** Tile lookup code calculating `floor(lat/20)*20` returns wrong values.

**Fix in code:**
```javascript
function tileStart(value, tileSize, isLatitude = false) {
  if (tileSize === 20 && isLatitude) {
    return Math.floor((value - 10) / 20) * 20 + 10;
  }
  return Math.floor(value / tileSize) * tileSize;
}
```

### 4. Tiles with Inland Water (Lakes) vs Solid Rectangles

**Problem:** `find_solid_rectangles.js` was flagging tiles with inland lakes as "solid rectangles" because it only checked outer ring point count.

**Root Cause:** Polygon with lakes has 5-point outer ring BUT has holes for the lakes. The check was:
```javascript
// WRONG: Only checks outer ring
if (ring.length !== 5) return false;
```

**Fix:**
```javascript
// CORRECT: Also check for holes
if (geom.coordinates.length > 1) return false; // Has holes = not solid
if (ring.length !== 5) return false;
```

### 5. R2 Bucket Legacy Data

**Current state:** Bucket has both organized LOD folders AND flat legacy folders:
- ✅ `land-tiles-10deg/`, `water-tiles-5deg/`, etc. (organized)
- ⚠️ `land-tiles/`, `water-tiles/` (flat, ~160k files, 40GB - legacy)

**Recommendation:** After confirming all LOD folders are complete, consider deleting legacy flat folders to save storage and avoid confusion.

## Regeneration Workflow

To regenerate all tiles from scratch:

```bash
cd scripts/tile-work

# 1. Generate land tiles from CDN water using mapshaper (recommended, fastest)
node generate_land_all_lods.js --only=20deg
node generate_land_all_lods.js --only=10deg
node generate_land_all_lods.js --only=5deg
node generate_land_all_lods.js --only=2.5deg
node generate_land_all_lods.js --only=1deg

# Or generate specific LODs, skipping already done:
node generate_land_all_lods.js --skip=20deg,10deg

# 2. Simplify large tiles (optional)
node simplify_large_tiles.js

# 3. Upload to R2 (direct paths)
node upload_new_land_tiles.js --lod=20deg,10deg,5deg,2.5deg,1deg
```

### Generation Time Estimates
- 20deg (162 tiles): ~3 minutes
- 10deg (648 tiles): ~20 minutes
- 5deg (2592 tiles): ~85 minutes
- 2.5deg (10368 tiles): ~6 hours
- 1deg (64800 tiles): ~36 hours

## Frontend Integration

Water tiles: `web/src/lib/tiles/waterTiles.ts`
Land tiles: `web/src/lib/tiles/landTiles.ts`

URL pattern:
```typescript
const url = `${CDN_BASE}/${lod.folder}/${lon}_${lat}.geojson`;
// e.g., https://cdn.clipmap.io/water-tiles-5deg/0_50.geojson
```

LOD selection is based on bbox span - larger areas use coarser LODs.
