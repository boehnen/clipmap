# ClipMap Tile Generation Guide

This guide covers the multi-LOD tile generation system that supports map exports from city-scale to world-scale extents.

## Overview

ClipMap uses a **multi-LOD (Level of Detail) tile system** that automatically selects appropriate tile resolution based on the user's selected extent. This matches the backend's existing `baseTiles.ts` approach.

**Key principle:** Larger extents use coarser tiles with fewer, simplified features. Smaller extents use finer tiles with full detail.

## Quick Start

### Option A: Coastlines Only (Fast)

For quick setup with ocean/coastlines only (no lakes/rivers):

```powershell
# Windows
cd scripts
npm install -g mapshaper
.\prepare-water-tiles.ps1
```

```bash
# Mac/Linux
cd scripts
npm install -g mapshaper
./prepare-water-tiles.sh
```

### Option B: Global with All Layers (Recommended)

For complete global coverage including water, roads, and boundaries:

```powershell
# Windows - requires GDAL (choco install gdal)
cd scripts
npm install -g mapshaper
.\prepare-tiles-global.ps1
```

**Process specific layers only:**
```powershell
.\prepare-tiles-global.ps1 -Layers "water"           # Water only
.\prepare-tiles-global.ps1 -Layers "water,roads"     # Water and roads
.\prepare-tiles-global.ps1 -Layers "roads,boundaries" # Roads and boundaries
```

**Resume if interrupted:**
```powershell
.\prepare-tiles-global.ps1 -SkipDownload -StartFrom "france"
```

**Requirements:**
- ~100 GB free disk space
- ~65 GB download (regional PBF files)
- Several hours for full processing

**After the script completes, it will show QGIS commands to run.**

---

## Global Water Processing (Detailed)

### Why Regional PBFs?

The global inland water extraction requires OSM data for the entire planet. Options:

| Approach | Download | Max File | Memory Needs | Recommended |
|----------|----------|----------|--------------|-------------|
| Planet PBF | 70 GB | 70 GB | 100+ GB RAM | No |
| Continental PBFs | 65 GB | 28 GB (Europe) | High | No |
| Regional PBFs | 65 GB | 4.5 GB (France) | Moderate | **Yes** |

**We use regional PBFs** from Geofabrik because:
1. Smaller files = manageable memory usage
2. Resume support if one fails
3. Parallel download possible
4. Geofabrik guarantees regions stitch together perfectly (no gaps/overlaps)

### Regional Breakdown

The `geofabrik-regions.json` file defines all regions:

| Continent | Strategy | Regions | Largest File |
|-----------|----------|---------|--------------|
| Africa | Single file | 1 | 6 GB |
| Antarctica | Single file | 1 | 30 MB |
| Asia | By country | 36 | Russia 3.5 GB, Japan 2 GB |
| Australia/Oceania | By country | 5 | Australia 900 MB |
| Central America | Single file | 1 | 600 MB |
| Europe | By country | 48 | France 4.5 GB, Germany 4 GB |
| North America | USA by region | 8 | Canada 3 GB, US-Midwest 2.5 GB |
| South America | Single file | 1 | 3 GB |

**Total: ~100 regions, ~65 GB**

### Processing Pipeline

The `prepare-tiles-global.ps1` script runs this pipeline:

```
1. Download coastlines (850 MB) - for water layer only
   └── osmdata.openstreetmap.de/water-polygons-split-4326.zip

2. Download regional PBFs (~65 GB)
   └── Geofabrik regional files (100 regions)

3. Extract features from each PBF (per layer)
   └── Water: natural=water, waterway=riverbank, etc.
   └── Roads: highway=*
   └── Boundaries: boundary=administrative
   └── Creates: {layer}/{region}.shp for each region

4. Merge by continent (memory efficient)
   └── Merge regions → continent shapefiles
   └── Merge continents → {layer}_merged.shp

5. For water: merge coastlines + inland water
   └── all_water.shp (complete water coverage)

6. Create LOD source files with mapshaper (per layer)
   └── {layer}_source_1deg.shp (full detail)
   └── {layer}_source_5deg.shp (filter + simplify)
   └── {layer}_source_10deg.shp (more filtering)
   └── {layer}_source_20deg.shp (aggressive filtering)
   └── {layer}/world.json
```

### Layers Extracted

| Layer | Source | Geometry | LODs |
|-------|--------|----------|------|
| **Water** | Coastlines + PBF inland | Polygons | 1°, 5°, 10°, 20°, world |
| **Roads** | PBF | Lines | 1°, 5°, 10°, 20° |
| **Boundaries** | PBF | Lines | 1°, 5°, 10°, 20°, world |
| **Land** | Computed (bbox - water) | Polygons | 1°, 5°, 10°, 20°, world |

### Script Usage

```powershell
# Full global processing (all layers)
.\prepare-tiles-global.ps1

# Process specific layers only
.\prepare-tiles-global.ps1 -Layers "water"
.\prepare-tiles-global.ps1 -Layers "water,roads"
.\prepare-tiles-global.ps1 -Layers "roads,boundaries"

# Skip download (if PBFs already downloaded)
.\prepare-tiles-global.ps1 -SkipDownload

# Skip extraction (if features already extracted)
.\prepare-tiles-global.ps1 -SkipDownload -SkipExtract

# Resume from a specific region (if extraction failed partway)
.\prepare-tiles-global.ps1 -SkipDownload -StartFrom "france"
```

### Directory Structure After Processing

```
scripts/
├── tile-work/
│   ├── pbf/                          # Downloaded PBF files (~65 GB)
│   │   ├── africa.osm.pbf
│   │   ├── germany.osm.pbf
│   │   └── ...
│   │
│   ├── inland/                       # Extracted water per region
│   │   ├── africa.shp
│   │   ├── germany.shp
│   │   └── ...
│   ├── roads/                        # Extracted roads per region
│   │   ├── africa.shp
│   │   └── ...
│   ├── boundaries/                   # Extracted boundaries per region
│   │   ├── africa.shp
│   │   └── ...
│   │
│   ├── inland_water_merged.shp       # All inland water
│   ├── roads_merged.shp              # All roads
│   ├── boundaries_merged.shp         # All boundaries
│   │
│   ├── water-polygons-split-4326/    # Coastlines
│   ├── all_water.shp                 # Coastlines + inland merged
│   │
│   ├── water_source_1deg.shp         # Water LOD sources
│   ├── water_source_5deg.shp
│   ├── water_source_10deg.shp
│   ├── water_source_20deg.shp
│   │
│   ├── roads_source_1deg.shp         # Roads LOD sources
│   ├── roads_source_5deg.shp
│   ├── roads_source_10deg.shp
│   ├── roads_source_20deg.shp
│   │
│   ├── boundaries_source_1deg.shp    # Boundaries LOD sources
│   ├── boundaries_source_5deg.shp
│   ├── boundaries_source_10deg.shp
│   └── boundaries_source_20deg.shp
│
├── tiles/
│   ├── water/
│   │   └── world.json
│   └── boundaries/
│       └── world.json
│
└── geofabrik-regions.json            # Region definitions
```

### Layer Extraction SQL

The script extracts these features from PBF files:

**Water (inland):**
```sql
SELECT * FROM multipolygons WHERE
  natural = 'water' OR           -- Lakes, ponds
  water IS NOT NULL OR           -- Any water tag
  waterway = 'riverbank' OR      -- Wide rivers
  landuse = 'reservoir' OR       -- Reservoirs
  landuse = 'basin'              -- Water basins
```

**Roads:**
```sql
SELECT * FROM lines WHERE highway IS NOT NULL
```

| Highway Type | Included In |
|--------------|-------------|
| `motorway`, `trunk` | All LODs (20°, 10°, 5°, 1°) |
| `primary` | 10°, 5°, 1° |
| `secondary` | 5°, 1° |
| `tertiary`, `residential`, etc. | 1° only |

**Boundaries:**
```sql
SELECT * FROM lines WHERE boundary = 'administrative'
```

| Admin Level | Description | Typical LOD |
|-------------|-------------|-------------|
| 2 | Country borders | All LODs |
| 4 | States/provinces | 10°+ |
| 6 | Counties/districts | 5°+ |
| 8 | Cities/municipalities | 1° only |

### Memory Management

The script uses a two-stage merge to avoid memory issues:

1. **Stage 1:** Merge regions within each continent
   - Europe's 48 countries → `inland_europe.shp`
   - Asia's 36 countries → `inland_asia.shp`
   - etc.

2. **Stage 2:** Merge all continent files
   - 8 continent files → `inland_water_merged.shp`

This keeps memory usage manageable even for large datasets.

---

## What the Script Does

The `prepare-water-tiles` script automates:

1. **Downloads** OSM water polygons (~850 MB)
2. **Extracts** inland water from PBF (if provided)
3. **Merges** coastlines + inland water
4. **Runs mapshaper** for each LOD:
   - `water_source_1deg.shp` - Full detail
   - `water_source_5deg.shp` - Filter islands <1km², simplify 10%
   - `water_source_10deg.shp` - Filter islands <10km², simplify 5%
   - `water_source_20deg.shp` - Filter islands <50km², simplify 1%
   - `water/world.json` - Filter islands <50km², simplify 0.5%

**You only need QGIS for Step 5 (tiling) and Step 6 (land generation).**

## Tile Architecture

### LOD Selection by Extent

| Extent Span | Tile Size | Use Case |
|-------------|-----------|----------|
| >90° | World file | Entire planet |
| 40-90° | 20° tiles | Continental scale |
| 15-40° | 10° tiles | Large country/region |
| 3-15° | 5° tiles | State/province |
| <3° | 1° tiles | City/county (full detail) |

### Directory Structure

```
cdn.clipmap.io/
├── water/
│   ├── world.json              # Single file for >90° extent
│   ├── 20deg/{lon}_{lat}.json  # 72×9 = 648 tiles
│   ├── 10deg/{lon}_{lat}.json  # 144×18 = 2,592 tiles
│   ├── 5deg/{lon}_{lat}.json   # 288×36 = 10,368 tiles
│   └── 1deg/{lon}_{lat}.json   # 360×180 = 64,800 tiles
├── roads/
│   ├── 10deg/...               # Highways only
│   ├── 5deg/...                # Primary roads+
│   └── 1deg/...                # All roads
├── parks/
│   ├── 10deg/...               # National parks (>100 km²)
│   ├── 5deg/...                # Large parks (>10 km²)
│   └── 1deg/...                # All parks
├── railways/
│   ├── 10deg/...               # Major rail only
│   ├── 5deg/...                # Rail + subway
│   └── 1deg/...                # All railways
├── boundaries/
│   ├── world.json              # Country borders
│   ├── 10deg/...               # Countries + states
│   ├── 5deg/...                # + Counties
│   └── 1deg/...                # All admin levels
├── ferries/
│   ├── 5deg/...
│   └── 1deg/...
├── contours/
│   ├── 5deg/...                # 500m intervals
│   └── 1deg/...                # 100m intervals
├── elevation/
│   ├── 5deg/...
│   └── 1deg/...
└── elevation-index.json        # Min/max per 1° tile
```

## Layer-Specific LOD Rules

### Water (Polygons)
**Includes:** Coastlines (oceans) + inland water (lakes, rivers, streams, ponds)

This is a UNION of two sources:
1. **OSM Water Polygons** - Pre-processed coastlines from osmdata.openstreetmap.de
2. **Inland Water from PBF** - `natural=water`, `waterway=riverbank`, `landuse=reservoir`, etc.

**Three key optimizations:**
1. **Island Filtering** - mapshaper `-filter-islands` removes tiny islands
2. **Simplification** - Reduces vertices
3. **Min Area Filtering** - Removes tiny ponds/streams at coarse LODs

| LOD | Tile Size | Island Filter | Simplify | Notes |
|-----|-----------|---------------|----------|-------|
| World | Single file | >50 km² | 0.5% | Major water bodies only |
| 20° | 648 tiles | >50 km² | 1% | Continental scale |
| 10° | 2,592 tiles | >10 km² | 5% | Regional |
| 5° | 10,368 tiles | >1 km² | 10% | Good detail |
| 1° | 64,800 tiles | None | None | Full detail |

### Land (Polygons)
**Pre-computed as:** `tile_bbox - water`

Since we no longer use Overpass API at runtime, land must be pre-computed. For each water tile, we compute: `land = tile_rectangle - water_polygons`

This is done AFTER water tiles are generated using the `generateLandTiles` script.

| LOD | Source | Output |
|-----|--------|--------|
| 1° | water/1deg/*.json | land/1deg/*.json |
| 5° | water/5deg/*.json | land/5deg/*.json |
| 10° | water/10deg/*.json | land/10deg/*.json |
| 20° | water/20deg/*.json | land/20deg/*.json |
| World | water/world.json | land/world.json |

### Roads (Lines)
Dense in urban areas. Needs filtering by road class.

| LOD | Tile Size | Filter | Notes |
|-----|-----------|--------|-------|
| 10° | 2,592 tiles | `motorway, trunk` | Highways only |
| 5° | 10,368 tiles | `+ primary` | Major roads |
| 1° | 64,800 tiles | All | Including footpaths |

**No world-scale roads** - too dense to be useful.

### Parks (Polygons)
Filter by area to reduce clutter at coarse scales.

| LOD | Tile Size | Filter | Notes |
|-----|-----------|--------|-------|
| 10° | 2,592 tiles | >100 km² | National parks only |
| 5° | 10,368 tiles | >10 km² | State/regional parks |
| 1° | 64,800 tiles | All | Urban parks, gardens |

### Railways (Lines)
Relatively sparse. Filter by type.

| LOD | Tile Size | Filter |
|-----|-----------|--------|
| 10° | 2,592 tiles | `rail` only |
| 5° | 10,368 tiles | `rail, subway` |
| 1° | 64,800 tiles | All (light rail, tram) |

### Boundaries (Lines)
Filter by admin level.

| LOD | Tile Size | Admin Level |
|-----|-----------|-------------|
| World | Single file | Countries (2) |
| 10° | 2,592 tiles | Countries + states (2-4) |
| 5° | 10,368 tiles | + Counties (2-6) |
| 1° | 64,800 tiles | All levels |

### Contours/Elevation (Lines/Polygons)
Only useful at local scale.

| LOD | Tile Size | Interval |
|-----|-----------|----------|
| 5° | 10,368 tiles | 500m contours |
| 1° | 64,800 tiles | 100m contours |

---

## Generation Workflow

### Prerequisites

| Tool | Purpose |
|------|---------|
| **Mapshaper** | Island filtering + simplification (CRITICAL) |
| QGIS 3.x | Tile clipping |
| Node.js 18+ | Upload script |

```bash
# Install mapshaper globally
npm install -g mapshaper
```

### Step 1: Download Source Data

**Water Polygons (pre-processed coastlines):**
```bash
# OSM water polygons - much cleaner than raw OSM
wget https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip
unzip water-polygons-split-4326.zip
```

**OSM Data (for roads, parks, etc.):**
```bash
# Download from Geofabrik (regional files are smaller/faster)
wget https://download.geofabrik.de/north-america-latest.osm.pbf

# Or use planet file for global
wget https://planet.openstreetmap.org/pbf/planet-latest.osm.pbf
```

### Step 2: Extract Inland Water from PBF

Use osmium or ogr2ogr to extract inland water features from OSM PBF:

```bash
# Extract water polygons from PBF using ogr2ogr
ogr2ogr -f "ESRI Shapefile" inland_water.shp \
  north-america-latest.osm.pbf \
  -sql "SELECT * FROM multipolygons WHERE natural='water' OR water IS NOT NULL OR waterway='riverbank' OR landuse='reservoir'"
```

Or in QGIS:
1. Load PBF: Layer → Add Layer → Add Vector Layer → select PBF
2. Load "multipolygons" layer
3. Filter: `"natural" = 'water' OR "water" IS NOT NULL OR "waterway" = 'riverbank'`
4. Export as shapefile: `inland_water.shp`

### Step 3: Merge Coastlines + Inland Water

```bash
# Merge coastlines and inland water into single file
mapshaper water_polygons.shp inland_water.shp combine-files \
  -merge-layers \
  -dissolve2 \
  -clean \
  -o format=shapefile all_water.shp
```

### Step 4: Pre-process with Mapshaper (CRITICAL)

**This is the most important step for file size reduction.** Mapshaper's `-filter-islands` removes thousands of tiny islands/ponds that are invisible at coarse zoom levels.

```bash
# 1° tiles: Full detail, just clean up invalid geometries
mapshaper all_water.shp \
  -clean \
  -o format=shapefile water_source_1deg.shp

# 5° tiles: Remove features <1km², simplify 10%
mapshaper all_water.shp \
  -filter-islands min-area=1km2 \
  -simplify 10% \
  -filter "this.area > 0" \
  -clean \
  -o format=shapefile water_source_5deg.shp

# 10° tiles: Remove features <10km², simplify 5%
mapshaper all_water.shp \
  -filter-islands min-area=10km2 \
  -simplify 5% \
  -filter "this.area > 0" \
  -clean \
  -o format=shapefile water_source_10deg.shp

# 20° tiles: Remove features <50km², simplify 1%
mapshaper all_water.shp \
  -filter-islands min-area=50km2 \
  -simplify 1% \
  -filter "this.area > 0" \
  -clean \
  -o format=shapefile water_source_20deg.shp

# World file: Heavy filtering + simplification
mapshaper all_water.shp \
  -filter-islands min-area=50km2 \
  -simplify 0.5% \
  -filter "this.area > 0" \
  -clean \
  -o format=geojson precision=0.0001 tiles/water/world.json
```

**Expected file sizes after mapshaper:**
| Source File | Features | Size |
|-------------|----------|------|
| water_source_1deg.shp | ~1M+ | ~1 GB |
| water_source_5deg.shp | ~100K | ~100 MB |
| water_source_10deg.shp | ~20K | ~40 MB |
| water_source_20deg.shp | ~5K | ~15 MB |
| world.json | ~1K | ~8 MB |

### Step 5: Tile Water with QGIS

After mapshaper preprocessing, use QGIS to clip into tiles. The QGIS script just handles clipping since mapshaper already did the heavy lifting.

**Recommended: Use `tile_simple()` for each LOD:**

```python
# In QGIS Python Console
exec(open('C:/path/to/clipmap/scripts/qgis/generate_tiles.py').read())

# Tile each mapshaper output separately
tile_simple('C:/path/to/water_source_1deg.shp', 'C:/path/to/tiles', 1, 'water')
tile_simple('C:/path/to/water_source_5deg.shp', 'C:/path/to/tiles', 5, 'water')
tile_simple('C:/path/to/water_source_10deg.shp', 'C:/path/to/tiles', 10, 'water')
tile_simple('C:/path/to/water_source_20deg.shp', 'C:/path/to/tiles', 20, 'water')

# Optional: limit to a region for testing
tile_simple('water_source_5deg.shp', 'tiles', 5, 'water', bounds=(-130, 25, -65, 50))
```

### Step 6: Generate Land Tiles

Land tiles are computed as `tile_bbox - water`. Run this AFTER water tiles are created:

```bash
cd scripts
npx tsx generateLandTiles.ts
```

Or for a specific LOD:
```bash
npx tsx generateLandTiles.ts 5deg
```

**This creates the final structure:**
```
tiles/
├── water/
│   ├── world.json
│   ├── 1deg/
│   ├── 5deg/
│   ├── 10deg/
│   └── 20deg/
├── land/
│   ├── world.json     # Generated from water/world.json
│   ├── 1deg/
│   ├── 5deg/
│   ├── 10deg/
│   └── 20deg/
```

### Step 7: Generate Other Layers (Roads, Parks, etc.)

Use `generate_all()` which includes built-in filtering:

```python
exec(open('C:/path/to/clipmap/scripts/qgis/generate_tiles.py').read())

generate_all(
    'C:/path/to/north-america-latest.osm.pbf',
    'C:/path/to/water_source_1deg.shp',
    'C:/path/to/output/tiles'
)
```

### Step 8: Generate Elevation Index

```bash
cd scripts/qgis
python generate_elevation_index.py \
  --dem srtm_merged.tif \
  --output ../tiles/elevation-index.json
```

### Step 9: Upload to R2

```bash
cd scripts
npm install

# Preview
npm run upload-tiles -- --input ./tiles --dry-run

# Upload (skips existing by default)
npm run upload-tiles -- --input ./tiles
```

---

## Storage Estimates

### Per-Layer Estimates (Global Coverage)

| Layer | LODs | Raw Size | With Mapshaper |
|-------|------|----------|----------------|
| Water | 5 | ~100 GB | ~15-20 GB |
| Land | 5 | ~100 GB | ~15-20 GB |
| Roads | 3 | ~50 GB | ~20-30 GB |
| Parks | 3 | ~10 GB | ~3-5 GB |
| Railways | 3 | ~2 GB | ~1 GB |
| Boundaries | 4 | ~3 GB | ~1 GB |
| Ferries | 2 | ~100 MB | ~100 MB |
| **Total** | | **~265 GB** | **~55-75 GB** |

*Note: Places/labels layer removed - requires more sophisticated LOD handling and label collision detection.*

### Regional Estimates (US Only)

| Layer | All LODs |
|-------|----------|
| Water | ~3-5 GB |
| Roads | ~5-8 GB |
| Parks | ~1 GB |
| Other layers | ~2 GB |
| **Total** | **~15-20 GB** |

---

## QGIS Processing Scripts

### Simplification

```python
# Simplify water polygons for coarse LODs
processing.run("native:simplifygeometries", {
    'INPUT': 'water_polygons.shp',
    'METHOD': 0,  # Douglas-Peucker
    'TOLERANCE': 0.01,  # ~1km at equator
    'OUTPUT': 'water_simplified.gpkg'
})
```

### Filtering

```python
# Filter roads by highway class
processing.run("native:extractbyexpression", {
    'INPUT': 'roads.gpkg',
    'EXPRESSION': '"highway" IN (\'motorway\', \'trunk\', \'primary\')',
    'OUTPUT': 'roads_major.gpkg'
})
```

### Tiling

```python
# Split into tiles
for lon in range(-180, 180, tile_size):
    for lat in range(-90, 90, tile_size):
        bbox = f"{lon},{lat},{lon+tile_size},{lat+tile_size}"
        # Clip and export...
```

---

## Updating Tiles

### Incremental Updates

1. Download updated OSM data
2. Regenerate only changed tiles (compare timestamps)
3. Upload with `--force` for changed tiles only

### Full Refresh

For major OSM changes or new LOD configurations:

```bash
# Regenerate everything
python generate_all_lods.py --full

# Force re-upload
npm run upload-tiles -- --input ./tiles --force
```

---

## Elevation / Topographic Data

**Note:** Geofabrik does NOT provide elevation data - they only distribute OSM vector data.

Elevation data requires separate sources.

### Available Sources

| Source | Resolution | Coverage | Download Size | Format | License |
|--------|------------|----------|---------------|--------|---------|
| **SRTM** | 90m (3 arc-sec) | ±60° latitude | ~20 GB | GeoTIFF | Public domain |
| **SRTM 1 arc-sec** | 30m | USA only | ~50 GB | GeoTIFF | Public domain |
| **ASTER GDEM** | 30m | ±83° latitude | ~300 GB | GeoTIFF | Free, attribution |
| **ALOS World 3D** | 30m | Global | ~150 GB | GeoTIFF | Free, registration |
| **Mapzen Terrain Tiles** | Variable | Global | ~200 GB | PNG tiles | ODbL |
| **AWS Terrain Tiles** | Variable | Global | On-demand | PNG tiles | Various |
| **ETOPO1** | 1 arc-min (~2km) | Global + bathymetry | ~1 GB | NetCDF/GeoTIFF | Public domain |

### Recommended Approach

For ClipMap's use case (SVG map exports):

1. **For contour lines:** Use SRTM 90m (manageable size, good coverage)
2. **For hillshade/relief:** Use pre-rendered terrain tiles
3. **For elevation index:** Pre-compute min/max per tile

### Download SRTM Data

```bash
# Option 1: NASA EarthData (requires free account)
# https://earthdata.nasa.gov/

# Option 2: CGIAR-CSI (direct download, 5°×5° tiles)
# https://srtm.csi.cgiar.org/srtmdata/

# Option 3: OpenTopography (various datasets)
# https://opentopography.org/
```

### Generate Contour Lines

Use GDAL to generate contours from elevation raster:

```bash
# Install GDAL
# Windows: choco install gdal
# Mac: brew install gdal
# Linux: apt install gdal-bin

# Generate 100m contours
gdal_contour -a elevation -i 100 srtm_merged.tif contours_100m.shp

# Generate 500m contours for coarse LODs
gdal_contour -a elevation -i 500 srtm_merged.tif contours_500m.shp

# Generate 50m contours for fine detail
gdal_contour -a elevation -i 50 srtm_merged.tif contours_50m.shp
```

### Contour LOD Strategy

| LOD | Contour Interval | Simplification | Use Case |
|-----|------------------|----------------|----------|
| 1° | 50m or 100m | None | Detailed local maps |
| 5° | 100m or 200m | 10% | Regional maps |
| 10° | 500m | 5% | Country-scale |
| 20° | 1000m | 2% | Continental |

### Generate Hillshade

```bash
# Generate hillshade for visual relief
gdaldem hillshade srtm_merged.tif hillshade.tif -z 2 -az 315 -alt 45

# Generate slope map
gdaldem slope srtm_merged.tif slope.tif

# Generate color relief
gdaldem color-relief srtm_merged.tif color_ramp.txt relief.tif
```

### Pre-compute Elevation Index

For quick elevation lookups, pre-compute min/max elevation per tile:

```json
// elevation-index.json
{
  "tiles": {
    "-122_37": { "min": 0, "max": 385 },
    "-122_38": { "min": 0, "max": 1283 },
    ...
  }
}
```

### Future Work

- [ ] Download and process SRTM tiles
- [ ] Generate contour lines at multiple intervals
- [ ] Create contour LOD sources with mapshaper
- [ ] Tile contours in QGIS
- [ ] Optional: hillshade raster tiles for visual effect

---

## Troubleshooting

### Tile too large (>10MB)

Increase simplification tolerance or add stricter filtering:
```python
simplify_tolerance = 0.02  # Increase from 0.01
```

### Missing features at coarse LOD

Check filter expressions - may be too restrictive:
```python
# Too strict:
filter = 'population > 1000000'

# Better for 10° tiles:
filter = 'population > 100000 OR place = "city"'
```

### Memory issues in QGIS

Process by region:
```python
regions = ['north-america', 'europe', 'asia']
for region in regions:
    generate_region_tiles(f"{region}-latest.osm.pbf", "tiles")
```

---

## Summary

| Task | Command |
|------|---------|
| Generate world files | QGIS → `generate_world_water()`, `generate_world_boundaries()` |
| Generate LOD tiles | QGIS → `generate_all_lods()` |
| Generate elevation index | `python generate_elevation_index.py --dem ... --output ...` |
| Upload to R2 | `npm run upload-tiles -- --input ./tiles` |
| Verify | `curl https://cdn.clipmap.io/water/5deg/-75_40.json` |

---

## Appendix: Data Analysis (March 2026)

This section documents the actual attribute distributions from global merged data.

### Merged Source Files (GeoPackage Format)

We use GeoPackage instead of Shapefile to avoid the 2GB file size limit.

| File | Size | Feature Count | Notes |
|------|------|---------------|-------|
| `roads_merged.gpkg` | 91 GB | 251.5M | All highway types |
| `boundaries_merged.gpkg` | 6 GB | 751K | Admin boundaries |
| `all_water.gpkg` | 15 GB | - | Coastlines + inland |
| `inland_merged.gpkg` | 16 GB | - | Inland water only |

Note: 100 of 101 Geofabrik regions processed (North Macedonia PBF was corrupted).

### Roads: Highway Type Distribution

Queried from `roads_merged.gpkg` using `ogrinfo`:

| highway | count | LOD inclusion |
|---------|-------|---------------|
| residential | 66,772,165 | 1deg only |
| service | 62,981,836 | 1deg only |
| footway | 30,103,696 | **exclude** (pedestrian) |
| track | 28,021,030 | 1deg only |
| unclassified | 17,615,592 | 2.5deg+ |
| path | 13,807,856 | **exclude** (pedestrian) |
| tertiary | 8,873,146 | 5deg+ |
| secondary | 5,697,083 | 5deg+ |
| primary | 3,981,094 | 10deg+ |
| cycleway | 2,129,206 | **exclude** (pedestrian) |
| living_street | 2,105,756 | 2.5deg+ |
| steps | 2,009,953 | **exclude** (pedestrian) |
| trunk | 1,942,004 | 20deg+ |
| motorway | 1,336,792 | 20deg+ |
| motorway_link | 897,429 | 10deg+ |
| trunk_link | 568,457 | 10deg+ |
| pedestrian | 535,495 | **exclude** |
| primary_link | 480,407 | 10deg+ |
| construction | 382,543 | **exclude** |
| secondary_link | 372,892 | 5deg+ |
| tertiary_link | 269,331 | 5deg+ |
| proposed | 156,434 | **exclude** |
| bridleway | 120,084 | **exclude** |
| platform | 108,239 | **exclude** |
| corridor | 71,566 | **exclude** |
| road | 40,716 | **exclude** (ambiguous) |
| busway | 34,029 | **exclude** |
| raceway | 31,674 | **exclude** |
| services | 19,861 | **exclude** |
| rest_area | 13,497 | **exclude** |

### Boundaries: Admin Level Distribution

Queried from `boundaries_merged.gpkg`:

| admin_level | count | description | LOD inclusion |
|-------------|-------|-------------|---------------|
| 2 | 205 | Countries/territories | 20deg+ (all) |
| 3 | 628 | Large subdivisions | 10deg+ |
| 4 | 2,005 | States/provinces | 10deg+ |
| 5 | 3,316 | Districts (some countries) | 5deg+ |
| 6 | 41,250 | Counties | 5deg+ |
| 7 | 32,685 | Sub-counties | 2.5deg+ |
| 8 | 239,141 | Municipalities/cities | 1deg only |
| 9 | 40,789 | City districts | **exclude** |
| 10+ | 62,851 | Neighborhoods | **exclude** |
| NULL/other | 328,178 | Untagged | **exclude** |

### Revised LOD Strategy with 2.5deg

Added 2.5deg as intermediate LOD level (gap from 1deg to 5deg was too large):

| LOD | Tiles | Roads | Boundaries | Water |
|-----|-------|-------|------------|-------|
| world | 1 | - | admin 2, 0.05° simp | >50km² (55k), 1% |
| 20deg | 162 | motorway, trunk + links | admin 2 | >50km² (55k), 5% |
| 10deg | 648 | + primary, links | admin 2-4 | >10km² (89k), 10% |
| 5deg | 2,592 | + secondary, tertiary + links | admin 2-6 | >2km² (237k), 25% |
| 2.5deg | 10,368 | + unclassified, living_street | admin 2-7 | >0.5km² (645k), 50% |
| 1deg | 64,800 | + residential, service, track | admin 2-8 | full (19M) |

*Data-driven thresholds based on polygon size distribution. Diminishing returns beyond 50km² (only 5k more removed going to 100km²).*

### Water Layer: Combined Sources

ClipMap requires **both** coastlines AND inland water in a single layer:

1. **Coastlines** - From OSM water polygons (osmdata.openstreetmap.de)
2. **Inland water** - Lakes, rivers, reservoirs from Geofabrik PBF extracts

Combined into `all_water.gpkg` (15 GB).

**Concern:** The OSM water polygon source is pre-split into tiles. There may be artifacts when we tile on top of pre-tiled data. Options:
- Use unsplit coastline source
- Accept and handle edge cases in rendering
- Use overlapping tiles with clipping

### ogr2ogr Commands for LOD Generation

**Roads 20deg:**
```bash
ogr2ogr -f GPKG roads_20deg.gpkg roads_merged.gpkg -nln roads \
  -where "highway IN ('motorway','motorway_link','trunk','trunk_link')" \
  -simplify 0.002
```

**Roads 10deg:**
```bash
ogr2ogr -f GPKG roads_10deg.gpkg roads_merged.gpkg -nln roads \
  -where "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link')" \
  -simplify 0.001
```

**Roads 5deg:**
```bash
ogr2ogr -f GPKG roads_5deg.gpkg roads_merged.gpkg -nln roads \
  -where "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link')" \
  -simplify 0.0005
```

**Roads 2.5deg:**
```bash
ogr2ogr -f GPKG roads_2.5deg.gpkg roads_merged.gpkg -nln roads \
  -where "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','living_street')" \
  -simplify 0.0002
```

**Roads 1deg (full detail):**
```bash
ogr2ogr -f GPKG roads_1deg.gpkg roads_merged.gpkg -nln roads \
  -where "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','living_street','residential','service','track')"
```

**Boundaries 20deg:**
```bash
ogr2ogr -f GPKG boundaries_20deg.gpkg boundaries_merged.gpkg -nln boundaries \
  -where "admin_level = '2'" \
  -simplify 0.01
```

**Boundaries 10deg:**
```bash
ogr2ogr -f GPKG boundaries_10deg.gpkg boundaries_merged.gpkg -nln boundaries \
  -where "admin_level IN ('2','3','4')" \
  -simplify 0.005
```

**Boundaries 5deg:**
```bash
ogr2ogr -f GPKG boundaries_5deg.gpkg boundaries_merged.gpkg -nln boundaries \
  -where "admin_level IN ('2','3','4','5','6')" \
  -simplify 0.002
```

**Boundaries 2.5deg:**
```bash
ogr2ogr -f GPKG boundaries_2.5deg.gpkg boundaries_merged.gpkg -nln boundaries \
  -where "admin_level IN ('2','3','4','5','6','7')" \
  -simplify 0.001
```

**Boundaries 1deg:**
```bash
ogr2ogr -f GPKG boundaries_1deg.gpkg boundaries_merged.gpkg -nln boundaries \
  -where "admin_level IN ('2','3','4','5','6','7','8')"
```

**Boundaries world (single file):**
```bash
ogr2ogr -f GPKG boundaries_world.gpkg boundaries_merged.gpkg -nln boundaries \
  -where "admin_level = '2'" \
  -simplify 0.05
```

**Water (uses mapshaper for island filtering + simplification):**

Data-driven thresholds based on actual polygon distribution (19M total):

```bash
# 1deg - full detail (19M polygons)
mapshaper all_water.gpkg -filter "this.area > 0" -clean -o format=gpkg water_1deg.gpkg

# 2.5deg - filter <0.5km² (645k remain), keep 50% of vertices
mapshaper all_water.gpkg -filter-islands min-area=0.5km2 -simplify 50% keep-shapes \
  -filter "this.area > 0" -clean -o format=gpkg water_2.5deg.gpkg

# 5deg - filter <2km² (237k remain), keep 25% of vertices
mapshaper all_water.gpkg -filter-islands min-area=2km2 -simplify 25% keep-shapes \
  -filter "this.area > 0" -clean -o format=gpkg water_5deg.gpkg

# 10deg - filter <10km² (89k remain), keep 10% of vertices
mapshaper all_water.gpkg -filter-islands min-area=10km2 -simplify 10% keep-shapes \
  -filter "this.area > 0" -clean -o format=gpkg water_10deg.gpkg

# 20deg - filter <50km² (55k remain), keep 5% of vertices
mapshaper all_water.gpkg -filter-islands min-area=50km2 -simplify 5% keep-shapes \
  -filter "this.area > 0" -clean -o format=gpkg water_20deg.gpkg

# world - filter <50km² (55k - diminishing returns beyond), keep 1% of vertices
mapshaper all_water.gpkg -filter-islands min-area=50km2 -simplify 1% keep-shapes \
  -filter "this.area > 0" -clean -o format=gpkg water_world.gpkg
```

### LOD Source Files Generated (March 2026)

Successfully generated 17 LOD source files in `scripts/tile-work/lod-sources/`:

**Roads (5 LODs):**

| File | Size | Highway Types |
|------|------|---------------|
| `roads_1deg.gpkg` | 832 MB | residential, service, track + all above |
| `roads_2.5deg.gpkg` | 164 MB | unclassified, living_street + all above |
| `roads_5deg.gpkg` | 72 MB | tertiary, secondary + links |
| `roads_10deg.gpkg` | 23 MB | primary + links |
| `roads_20deg.gpkg` | 10 MB | motorway, trunk + links |

**Boundaries (6 LODs):**

| File | Size | Admin Levels |
|------|------|--------------|
| `boundaries_1deg.gpkg` | 4.5 GB | 2-8 (full detail) |
| `boundaries_2.5deg.gpkg` | 315 MB | 2-7 |
| `boundaries_5deg.gpkg` | 162 MB | 2-6 |
| `boundaries_10deg.gpkg` | 15 MB | 2-4 |
| `boundaries_20deg.gpkg` | 1 MB | 2 (countries) |
| `boundaries_world.gpkg` | 455 KB | 2 (simplified) |

**Water (6 LODs):**

| File | Size | Filter/Simplify |
|------|------|-----------------|
| `water_1deg.gpkg` | 972 MB | Full (no filtering) |
| `water_2.5deg.gpkg` | 416 MB | >0.5km², 50% |
| `water_5deg.gpkg` | 114 MB | >2km², 25% |
| `water_10deg.gpkg` | 68 MB | >10km², 10% |
| `water_20deg.gpkg` | 39 MB | >50km², 5% |
| `water_world.gpkg` | 12 MB | >50km², 1% |

**Notes:**
- Boundaries column `admin_level` was truncated to `admin_leve` due to shapefile processing
- Water LODs were generated from `water_source_*.shp` intermediate files (created by mapshaper earlier)
- mapshaper cannot process files >2GB directly (Node.js limitation), so water was processed from pre-filtered shapefiles
- All files are in EPSG:4326 (WGS84) projection

**Total LOD source files: 7.2 GB** (without original merged sources)

### Next Steps

1. **Tile the LOD sources** - Use QGIS to clip each LOD source into tiles
2. **Generate land tiles** - Compute `land = bbox - water` for each water tile
3. **Upload to CDN** - Use the upload script to push tiles to Cloudflare R2
