#
# ClipMap Water Tile Preparation Script (PowerShell)
#
# This script automates the data preparation steps before QGIS tiling:
# 1. Downloads OSM water polygons (coastlines)
# 2. Extracts inland water from OSM PBF (optional)
# 3. Merges coastlines + inland water
# 4. Runs mapshaper to create LOD-specific source files
# 5. Creates world.json files
#
# After running this script, use QGIS to tile the output shapefiles.
#
# Usage:
#   .\prepare-water-tiles.ps1                         # Download coastlines only
#   .\prepare-water-tiles.ps1 -PbfFile path\to\region.osm.pbf   # Include inland water
#
# Requirements:
#   - mapshaper (npm install -g mapshaper)
#   - ogr2ogr (GDAL) - optional, for extracting inland water from PBF
#

param(
    [string]$PbfFile = ""
)

$ErrorActionPreference = "Stop"

# Add npm global bin to PATH
$NpmGlobalBin = Join-Path $env:APPDATA "npm"
if (Test-Path $NpmGlobalBin) {
    $env:PATH = "$NpmGlobalBin;$env:PATH"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkDir = Join-Path $ScriptDir "tile-work"
$OutputDir = Join-Path $ScriptDir "tiles"

Write-Host "=== ClipMap Water Tile Preparation ===" -ForegroundColor Green
Write-Host ""

# Check requirements
function Check-Requirements {
    $missing = @()

    if (-not (Get-Command "mapshaper" -ErrorAction SilentlyContinue)) {
        $missing += "mapshaper (npm install -g mapshaper)"
    }

    if ($missing.Count -gt 0) {
        Write-Host "Missing required tools:" -ForegroundColor Red
        foreach ($tool in $missing) {
            Write-Host "  - $tool"
        }
        exit 1
    }

    Write-Host "[OK] All required tools found" -ForegroundColor Green
}

# Download OSM water polygons
function Download-Coastlines {
    $url = "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"
    $zipFile = Join-Path $WorkDir "water-polygons-split-4326.zip"
    $shpDir = Join-Path $WorkDir "water-polygons-split-4326"
    $shpFile = Join-Path $shpDir "water_polygons.shp"

    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

    if (Test-Path $shpFile) {
        Write-Host "Coastlines already downloaded, skipping..." -ForegroundColor Yellow
        return
    }

    Write-Host "Downloading OSM water polygons (~850 MB)..."
    Write-Host "  This may take a while..."

    Invoke-WebRequest -Uri $url -OutFile $zipFile -UseBasicParsing

    Write-Host "Extracting..."
    Expand-Archive -Path $zipFile -DestinationPath $WorkDir -Force

    Write-Host "[OK] Coastlines downloaded" -ForegroundColor Green
}

# Extract inland water from PBF
function Extract-InlandWater {
    param([string]$PbfPath)

    $output = Join-Path $WorkDir "inland_water.shp"

    if ([string]::IsNullOrEmpty($PbfPath)) {
        Write-Host "No PBF file provided, skipping inland water extraction" -ForegroundColor Yellow
        Write-Host "  (coastlines only - no lakes/rivers/streams)"
        return
    }

    if (-not (Test-Path $PbfPath)) {
        Write-Host "PBF file not found: $PbfPath" -ForegroundColor Red
        exit 1
    }

    if (Test-Path $output) {
        Write-Host "Inland water already extracted, skipping..." -ForegroundColor Yellow
        return
    }

    Write-Host "Extracting inland water from PBF..."

    if (-not (Get-Command "ogr2ogr" -ErrorAction SilentlyContinue)) {
        Write-Host "ogr2ogr (GDAL) not found. Install GDAL to extract inland water." -ForegroundColor Red
        Write-Host "  Windows: choco install gdal"
        Write-Host "  Or download from: https://www.gisinternals.com/"
        return
    }

    $sql = "SELECT * FROM multipolygons WHERE natural='water' OR water IS NOT NULL OR waterway='riverbank' OR landuse='reservoir' OR landuse='basin'"

    & ogr2ogr -f "ESRI Shapefile" $output $PbfPath -sql $sql -progress

    Write-Host "[OK] Inland water extracted" -ForegroundColor Green
}

# Merge coastlines and inland water
function Merge-Water {
    $coastlines = Join-Path $WorkDir "water-polygons-split-4326\water_polygons.shp"
    $inland = Join-Path $WorkDir "inland_water.shp"
    $output = Join-Path $WorkDir "all_water.shp"

    if (Test-Path $output) {
        Write-Host "Merged water file exists, skipping..." -ForegroundColor Yellow
        return
    }

    if (Test-Path $inland) {
        Write-Host "Merging coastlines + inland water..."
        & mapshaper $coastlines $inland combine-files `
            -merge-layers `
            -clean `
            -o format=shapefile $output
        Write-Host "[OK] Water sources merged" -ForegroundColor Green
    } else {
        Write-Host "Using coastlines only (no inland water to merge)..."
        Copy-Item $coastlines $output
        Copy-Item ($coastlines -replace "\.shp$", ".shx") ($output -replace "\.shp$", ".shx")
        Copy-Item ($coastlines -replace "\.shp$", ".dbf") ($output -replace "\.shp$", ".dbf")
        if (Test-Path ($coastlines -replace "\.shp$", ".prj")) {
            Copy-Item ($coastlines -replace "\.shp$", ".prj") ($output -replace "\.shp$", ".prj")
        }
        Write-Host "[OK] Using coastlines as water source" -ForegroundColor Green
    }
}

# Create LOD-specific source files
function Create-LodSources {
    $input = Join-Path $WorkDir "all_water.shp"
    $waterDir = Join-Path $OutputDir "water"

    New-Item -ItemType Directory -Force -Path $waterDir | Out-Null

    Write-Host ""
    Write-Host "Creating LOD-specific source files with mapshaper..."
    Write-Host "  This is the critical step for file size reduction!"
    Write-Host ""

    # 1 degree tiles: Full detail
    $out1deg = Join-Path $WorkDir "water_source_1deg.shp"
    Write-Host "Creating 1deg source (full detail)..."
    if (-not (Test-Path $out1deg)) {
        & mapshaper $input -clean -o format=shapefile $out1deg
        Write-Host "[OK] 1deg source created" -ForegroundColor Green
    } else {
        Write-Host "  Already exists, skipping" -ForegroundColor Yellow
    }

    # 5 degree tiles - keep most islands, simplify geometry
    $out5deg = Join-Path $WorkDir "water_source_5deg.shp"
    Write-Host "Creating 5deg source (filter islands under 0.5km2, simplify 10%)..."
    if (-not (Test-Path $out5deg)) {
        & mapshaper $input `
            -filter-islands min-area=0.5km2 `
            -simplify 10% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=shapefile $out5deg
        Write-Host "[OK] 5deg source created" -ForegroundColor Green
    } else {
        Write-Host "  Already exists, skipping" -ForegroundColor Yellow
    }

    # 10 degree tiles - keep significant islands
    $out10deg = Join-Path $WorkDir "water_source_10deg.shp"
    Write-Host "Creating 10deg source (filter islands under 2km2, simplify 5%)..."
    if (-not (Test-Path $out10deg)) {
        & mapshaper $input `
            -filter-islands min-area=2km2 `
            -simplify 5% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=shapefile $out10deg
        Write-Host "[OK] 10deg source created" -ForegroundColor Green
    } else {
        Write-Host "  Already exists, skipping" -ForegroundColor Yellow
    }

    # 20 degree tiles - keep larger islands
    $out20deg = Join-Path $WorkDir "water_source_20deg.shp"
    Write-Host "Creating 20deg source (filter islands under 10km2, simplify 2%)..."
    if (-not (Test-Path $out20deg)) {
        & mapshaper $input `
            -filter-islands min-area=10km2 `
            -simplify 2% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=shapefile $out20deg
        Write-Host "[OK] 20deg source created" -ForegroundColor Green
    } else {
        Write-Host "  Already exists, skipping" -ForegroundColor Yellow
    }

    # World file
    $worldJson = Join-Path $waterDir "world.json"
    Write-Host "Creating world.json (filter islands under 25km2, simplify 1%)..."
    if (-not (Test-Path $worldJson)) {
        & mapshaper $input `
            -filter-islands min-area=25km2 `
            -simplify 1% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=geojson precision=0.0001 $worldJson
        Write-Host "[OK] world.json created" -ForegroundColor Green
    } else {
        Write-Host "  Already exists, skipping" -ForegroundColor Yellow
    }
}

# Show summary
function Show-Summary {
    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Source files created in: $WorkDir"
    Write-Host ""

    foreach ($deg in @(1, 5, 10, 20)) {
        $file = Join-Path $WorkDir "water_source_${deg}deg.shp"
        if (Test-Path $file) {
            $size = (Get-Item $file).Length / 1MB
            Write-Host ("  water_source_{0}deg.shp: {1:N1} MB" -f $deg, $size)
        }
    }

    $worldJson = Join-Path $OutputDir "water\world.json"
    if (Test-Path $worldJson) {
        $size = (Get-Item $worldJson).Length / 1MB
        Write-Host ("  water/world.json: {0:N1} MB" -f $size)
    }

    Write-Host ""
    Write-Host "=== Next Steps ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "1. Open QGIS"
    Write-Host "2. Run in Python Console:"
    Write-Host ""
    Write-Host "   exec(open('$ScriptDir/qgis/generate_tiles.py').read())"
    Write-Host ""
    Write-Host "   # Tile each LOD:"
    Write-Host "   tile_simple('$WorkDir/water_source_1deg.shp', '$OutputDir', 1, 'water')"
    Write-Host "   tile_simple('$WorkDir/water_source_5deg.shp', '$OutputDir', 5, 'water')"
    Write-Host "   tile_simple('$WorkDir/water_source_10deg.shp', '$OutputDir', 10, 'water')"
    Write-Host "   tile_simple('$WorkDir/water_source_20deg.shp', '$OutputDir', 20, 'water')"
    Write-Host ""
    Write-Host "3. Generate land tiles:"
    Write-Host "   npx tsx $ScriptDir/generateLandTiles.ts"
    Write-Host ""
    Write-Host "4. Upload to R2:"
    Write-Host "   npm run upload-tiles -- --input $OutputDir"
}

# Main
Check-Requirements
Write-Host ""

Download-Coastlines
Write-Host ""

Extract-InlandWater -PbfPath $PbfFile
Write-Host ""

Merge-Water
Write-Host ""

Create-LodSources

Show-Summary
