# QGIS Tile Generation

Generate ClipMap tiles using QGIS for better performance and visual verification.

## Quick Start

```bash
# 1. Download OSM data (example: North America)
wget https://download.geofabrik.de/north-america-latest.osm.pbf

# 2. Download SRTM elevation data (for topo maps)
# Get tiles from https://dwtkns.com/srtm30m/

# 3. Open QGIS and run from Python Console:
exec(open('C:/path/to/scripts/qgis/generate_tiles.py').read())
generate_all_tiles("north-america-latest.osm.pbf", "./tiles")

# 4. Generate elevation index
python generate_elevation_index.py --dem merged_srtm.tif --output elevation-index.json

# 5. Upload to R2
cd scripts
cp .env.example .env  # Fill in R2 credentials
npm install
npm run upload-tiles -- --input ./tiles
```

## Prerequisites

- QGIS 3.x (free: https://qgis.org)
- OSM PBF file from Geofabrik (https://download.geofabrik.de/)
- For elevation: GDAL with Python bindings

## Option 1: Manual Workflow (GUI)

### Step 1: Load PBF Data

1. Open QGIS
2. **Layer → Add Layer → Add Vector Layer**
3. Select your `.osm.pbf` file
4. When prompted, select layers to import:
   - `multipolygons` (for water, parks)
   - `lines` (for roads, railways)

### Step 2: Filter Each Layer

Create filtered layers for each ClipMap layer:

**Water (polygons):**
```sql
"natural" = 'water' OR "water" IS NOT NULL OR "waterway" = 'riverbank' OR "landuse" IN ('reservoir', 'basin')
```

**Roads:**
```sql
"highway" IN ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'pedestrian', 'track', 'path', 'footway', 'cycleway')
```

**Parks:**
```sql
"leisure" IN ('park', 'garden', 'nature_reserve') OR "landuse" IN ('forest', 'grass', 'meadow', 'recreation_ground') OR "natural" = 'wood' OR "boundary" = 'national_park'
```

**Railways:**
```sql
"railway" IN ('rail', 'subway', 'light_rail', 'tram', 'monorail')
```

To apply filter:
1. Right-click layer → **Filter...**
2. Enter expression
3. Click **OK**

### Step 3: Create Tile Grid

1. **Vector → Research Tools → Create Grid**
2. Settings:
   - Grid type: Rectangle (polygon)
   - Grid extent: Layer extent (or custom)
   - Horizontal spacing: 1 (degrees)
   - Vertical spacing: 1 (degrees)
   - Grid CRS: EPSG:4326

### Step 4: Export Tiles

Use **Processing → Toolbox → Split vector layer**:
1. Input layer: Your filtered layer
2. Unique ID field: Create a tile ID field first
3. Output: GeoJSON files

Or use **Atlas Generation** for batch export.

### Step 5: Organize Output

Rename files to match ClipMap structure:
```
tiles/
  water/0/{lon}_{lat}.geojson
  roads/0/{lon}_{lat}.geojson
  parks/0/{lon}_{lat}.geojson
  railways/0/{lon}_{lat}.geojson
```

---

## Option 2: Python Script (Automated)

Run the included Python script from QGIS console:

1. Open QGIS
2. **Plugins → Python Console**
3. Run:
```python
exec(open('C:/path/to/scripts/qgis/generate_tiles.py').read())

# Then call:
generate_all_tiles(
    "C:/path/to/region.osm.pbf",
    "C:/path/to/output/tiles"
)
```

---

## Option 3: Command Line (Headless)

If QGIS is in your PATH:

```bash
python scripts/qgis/generate_tiles.py --input region.osm.pbf --output ./tiles
```

Note: Requires QGIS Python bindings properly configured.

---

## Performance Tips

1. **Use regional extracts** - Don't process the entire planet at once
2. **Simplify geometries** - Use `Simplify` tool before export for smaller files
3. **Create spatial index** - Right-click layer → Create Spatial Index
4. **Use SSD** - Significantly faster I/O for large datasets
5. **Filter early** - Apply attribute filter before spatial operations

---

## Simplification (Optional)

For zoom level 1 (simplified preview):

1. **Vector → Geometry Tools → Simplify**
2. Tolerance: 0.001 (degrees, ~100m)
3. Export to `tiles/{layer}/1/`

---

## Verification

Before uploading, spot-check tiles:

1. Load a few `.geojson` tiles back into QGIS
2. Compare against OSM base layer
3. Check tile boundaries align correctly
4. Verify feature counts are reasonable

---

## Upload to R2

After generating tiles:

```bash
cd scripts

# 1. Create .env file with R2 credentials
cp .env.example .env

# 2. Edit .env and fill in:
#    R2_ACCOUNT_ID=your_account_id
#    R2_ACCESS_KEY_ID=your_access_key
#    R2_SECRET_ACCESS_KEY=your_secret
#    R2_BUCKET_NAME=your_bucket

# 3. Install dependencies and upload
npm install
npm run upload-tiles -- --input ./tiles

# Options:
#   --dry-run    Preview files without uploading
#   --force      Re-upload existing files
```

**Get R2 credentials:**
1. Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create API Token with "Object Read & Write" permission
3. Copy Account ID, Access Key ID, and Secret Access Key

---

## Elevation Data (Topographic Maps)

For layered physical maps (stacked wood/acrylic), generate elevation bands.

### Data Sources

**SRTM 30m** (Free, global):
- https://dwtkns.com/srtm30m/ (interactive downloader)
- https://earthexplorer.usgs.gov/ (USGS Earth Explorer)

**OpenTopography** (Higher resolution for some areas):
- https://opentopography.org/

### Generate Contours & Elevation Bands

```python
# In QGIS Python Console:
exec(open('path/to/generate_elevation_tiles.py').read())

generate_elevation_tiles(
    "srtm_12_04.tif",      # Your DEM file
    "./elevation_tiles",    # Output directory
    interval=50,            # Contour interval (meters)
    generate_bands=True,    # Create filled elevation bands
    band_intervals=[0, 100, 200, 300, 500, 1000, 2000]  # Band breaks
)
```

### Output Structure

```
elevation_tiles/
├── contours_50m/0/           # Contour lines
│   ├── -74_40.geojson
│   └── ...
├── band_0_100m/0/            # 0-100m elevation band
├── band_100_200m/0/          # 100-200m elevation band
├── band_200_300m/0/          # 200-300m elevation band
└── ...
```

### Physical Map Workflow

For a stacked wood/acrylic topographic map:

1. Choose band intervals based on your material thickness
   - 3mm plywood → 100m intervals gives ~3cm per 1000m elevation
2. Generate bands for your area
3. Export each band as separate SVG
4. Cut each band from your material
5. Stack and glue in order

**Tip**: For coastal areas, the 0m band includes sea level - you may want to start at a small positive value (e.g., 10m) to avoid cutting ocean areas.
