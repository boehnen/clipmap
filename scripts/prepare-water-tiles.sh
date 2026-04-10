#!/bin/bash
#
# ClipMap Water Tile Preparation Script
#
# This script automates the data preparation steps before QGIS tiling:
# 1. Downloads OSM water polygons (coastlines)
# 2. Extracts inland water from OSM PBF
# 3. Merges coastlines + inland water
# 4. Runs mapshaper to create LOD-specific source files
# 5. Creates world.json files
#
# After running this script, use QGIS to tile the output shapefiles.
#
# Usage:
#   ./prepare-water-tiles.sh                    # Download coastlines only
#   ./prepare-water-tiles.sh path/to/region.osm.pbf   # Include inland water from PBF
#
# Requirements:
#   - curl, unzip
#   - mapshaper (npm install -g mapshaper)
#   - ogr2ogr (GDAL) - for extracting inland water from PBF
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SCRIPT_DIR/tile-work"
OUTPUT_DIR="$SCRIPT_DIR/tiles"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== ClipMap Water Tile Preparation ===${NC}"
echo ""

# Check requirements
check_requirements() {
    local missing=()

    command -v curl >/dev/null 2>&1 || missing+=("curl")
    command -v unzip >/dev/null 2>&1 || missing+=("unzip")
    command -v mapshaper >/dev/null 2>&1 || missing+=("mapshaper (npm install -g mapshaper)")

    if [ ${#missing[@]} -ne 0 ]; then
        echo -e "${RED}Missing required tools:${NC}"
        for tool in "${missing[@]}"; do
            echo "  - $tool"
        done
        exit 1
    fi

    echo -e "${GREEN}✓ All required tools found${NC}"
}

# Download OSM water polygons (coastlines)
download_coastlines() {
    local url="https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"
    local zip_file="$WORK_DIR/water-polygons-split-4326.zip"
    local shp_dir="$WORK_DIR/water-polygons-split-4326"

    mkdir -p "$WORK_DIR"

    if [ -f "$shp_dir/water_polygons.shp" ]; then
        echo -e "${YELLOW}Coastlines already downloaded, skipping...${NC}"
        return
    fi

    echo "Downloading OSM water polygons (~850 MB)..."
    curl -L -o "$zip_file" "$url"

    echo "Extracting..."
    unzip -o "$zip_file" -d "$WORK_DIR"

    echo -e "${GREEN}✓ Coastlines downloaded${NC}"
}

# Extract inland water from PBF (if provided)
extract_inland_water() {
    local pbf_file="$1"
    local output="$WORK_DIR/inland_water.shp"

    if [ -z "$pbf_file" ]; then
        echo -e "${YELLOW}No PBF file provided, skipping inland water extraction${NC}"
        echo "  (coastlines only - no lakes/rivers/streams)"
        return
    fi

    if [ ! -f "$pbf_file" ]; then
        echo -e "${RED}PBF file not found: $pbf_file${NC}"
        exit 1
    fi

    if [ -f "$output" ]; then
        echo -e "${YELLOW}Inland water already extracted, skipping...${NC}"
        return
    fi

    echo "Extracting inland water from PBF..."
    echo "  This may take a while for large files..."

    # Check for ogr2ogr
    if ! command -v ogr2ogr &> /dev/null; then
        echo -e "${RED}ogr2ogr (GDAL) not found. Install GDAL to extract inland water.${NC}"
        echo "  Windows: choco install gdal"
        echo "  Mac: brew install gdal"
        echo "  Ubuntu: apt install gdal-bin"
        return
    fi

    # Extract water features from multipolygons layer
    ogr2ogr -f "ESRI Shapefile" "$output" "$pbf_file" \
        -sql "SELECT * FROM multipolygons WHERE natural='water' OR water IS NOT NULL OR waterway='riverbank' OR landuse='reservoir' OR landuse='basin'" \
        -progress

    echo -e "${GREEN}✓ Inland water extracted${NC}"
}

# Merge coastlines and inland water
merge_water() {
    local coastlines="$WORK_DIR/water-polygons-split-4326/water_polygons.shp"
    local inland="$WORK_DIR/inland_water.shp"
    local output="$WORK_DIR/all_water.shp"

    if [ -f "$output" ]; then
        echo -e "${YELLOW}Merged water file exists, skipping...${NC}"
        return
    fi

    if [ -f "$inland" ]; then
        echo "Merging coastlines + inland water..."
        mapshaper "$coastlines" "$inland" combine-files \
            -merge-layers \
            -clean \
            -o format=shapefile "$output"
        echo -e "${GREEN}✓ Water sources merged${NC}"
    else
        echo "Using coastlines only (no inland water to merge)..."
        cp "$coastlines" "$output"
        cp "${coastlines%.shp}.shx" "${output%.shp}.shx"
        cp "${coastlines%.shp}.dbf" "${output%.shp}.dbf"
        cp "${coastlines%.shp}.prj" "${output%.shp}.prj" 2>/dev/null || true
        echo -e "${GREEN}✓ Using coastlines as water source${NC}"
    fi
}

# Create LOD-specific source files with mapshaper
create_lod_sources() {
    local input="$WORK_DIR/all_water.shp"

    mkdir -p "$OUTPUT_DIR/water"

    echo ""
    echo "Creating LOD-specific source files with mapshaper..."
    echo "  This is the critical step for file size reduction!"
    echo ""

    # 1° tiles: Full detail, just clean
    echo "Creating 1° source (full detail)..."
    if [ ! -f "$WORK_DIR/water_source_1deg.shp" ]; then
        mapshaper "$input" \
            -clean \
            -o format=shapefile "$WORK_DIR/water_source_1deg.shp"
        echo -e "${GREEN}✓ 1° source created${NC}"
    else
        echo -e "${YELLOW}  Already exists, skipping${NC}"
    fi

    # 5° tiles: Remove features <1km², simplify 10%
    echo "Creating 5° source (filter islands <1km², simplify 10%)..."
    if [ ! -f "$WORK_DIR/water_source_5deg.shp" ]; then
        mapshaper "$input" \
            -filter-islands min-area=1km2 \
            -simplify 10% \
            -filter "this.area > 0" \
            -clean \
            -o format=shapefile "$WORK_DIR/water_source_5deg.shp"
        echo -e "${GREEN}✓ 5° source created${NC}"
    else
        echo -e "${YELLOW}  Already exists, skipping${NC}"
    fi

    # 10° tiles: Remove features <10km², simplify 5%
    echo "Creating 10° source (filter islands <10km², simplify 5%)..."
    if [ ! -f "$WORK_DIR/water_source_10deg.shp" ]; then
        mapshaper "$input" \
            -filter-islands min-area=10km2 \
            -simplify 5% \
            -filter "this.area > 0" \
            -clean \
            -o format=shapefile "$WORK_DIR/water_source_10deg.shp"
        echo -e "${GREEN}✓ 10° source created${NC}"
    else
        echo -e "${YELLOW}  Already exists, skipping${NC}"
    fi

    # 20° tiles: Remove features <50km², simplify 1%
    echo "Creating 20° source (filter islands <50km², simplify 1%)..."
    if [ ! -f "$WORK_DIR/water_source_20deg.shp" ]; then
        mapshaper "$input" \
            -filter-islands min-area=50km2 \
            -simplify 1% \
            -filter "this.area > 0" \
            -clean \
            -o format=shapefile "$WORK_DIR/water_source_20deg.shp"
        echo -e "${GREEN}✓ 20° source created${NC}"
    else
        echo -e "${YELLOW}  Already exists, skipping${NC}"
    fi

    # World file: Heavy filtering + simplification
    echo "Creating world.json (filter islands <50km², simplify 0.5%)..."
    if [ ! -f "$OUTPUT_DIR/water/world.json" ]; then
        mapshaper "$input" \
            -filter-islands min-area=50km2 \
            -simplify 0.5% \
            -filter "this.area > 0" \
            -clean \
            -o format=geojson precision=0.0001 "$OUTPUT_DIR/water/world.json"
        echo -e "${GREEN}✓ world.json created${NC}"
    else
        echo -e "${YELLOW}  Already exists, skipping${NC}"
    fi
}

# Show file sizes
show_summary() {
    echo ""
    echo -e "${GREEN}=== Summary ===${NC}"
    echo ""
    echo "Source files created in: $WORK_DIR"
    echo ""

    for deg in 1 5 10 20; do
        local file="$WORK_DIR/water_source_${deg}deg.shp"
        if [ -f "$file" ]; then
            local size=$(du -h "$file" | cut -f1)
            echo "  water_source_${deg}deg.shp: $size"
        fi
    done

    if [ -f "$OUTPUT_DIR/water/world.json" ]; then
        local size=$(du -h "$OUTPUT_DIR/water/world.json" | cut -f1)
        echo "  water/world.json: $size"
    fi

    echo ""
    echo -e "${GREEN}=== Next Steps ===${NC}"
    echo ""
    echo "1. Open QGIS"
    echo "2. Run in Python Console:"
    echo ""
    echo "   exec(open('$SCRIPT_DIR/qgis/generate_tiles.py').read())"
    echo ""
    echo "   # Tile each LOD:"
    echo "   tile_simple('$WORK_DIR/water_source_1deg.shp', '$OUTPUT_DIR', 1, 'water')"
    echo "   tile_simple('$WORK_DIR/water_source_5deg.shp', '$OUTPUT_DIR', 5, 'water')"
    echo "   tile_simple('$WORK_DIR/water_source_10deg.shp', '$OUTPUT_DIR', 10, 'water')"
    echo "   tile_simple('$WORK_DIR/water_source_20deg.shp', '$OUTPUT_DIR', 20, 'water')"
    echo ""
    echo "3. Generate land tiles:"
    echo "   npx tsx $SCRIPT_DIR/generateLandTiles.ts"
    echo ""
    echo "4. Upload to R2:"
    echo "   npm run upload-tiles -- --input $OUTPUT_DIR"
}

# Main
main() {
    local pbf_file="$1"

    check_requirements
    echo ""

    download_coastlines
    echo ""

    extract_inland_water "$pbf_file"
    echo ""

    merge_water
    echo ""

    create_lod_sources

    show_summary
}

main "$@"
