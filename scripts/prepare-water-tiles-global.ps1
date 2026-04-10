#
# ClipMap Global Water Tile Preparation Script (PowerShell)
#
# Downloads regional PBFs from Geofabrik (subregions stitch together perfectly),
# extracts inland water from each, merges with coastlines, creates LOD sources.
#
# Geofabrik guarantees: subregions don't overlap and together equal parent region.
# This ensures complete coverage with no gaps or duplicates.
#
# Usage:
#   .\prepare-water-tiles-global.ps1                    # Full global processing
#   .\prepare-water-tiles-global.ps1 -SkipDownload      # Skip PBF downloads
#   .\prepare-water-tiles-global.ps1 -StartFrom "france" # Resume from specific region
#
# Requirements:
#   - mapshaper (npm install -g mapshaper)
#   - ogr2ogr (GDAL)
#   - ~80 GB free disk space
#

param(
    [switch]$SkipDownload = $false,
    [switch]$SkipExtract = $false,
    [string]$StartFrom = ""
)

$ErrorActionPreference = "Stop"

# Add npm global bin to PATH
$NpmGlobalBin = Join-Path $env:APPDATA "npm"
if (Test-Path $NpmGlobalBin) {
    $env:PATH = "$NpmGlobalBin;$env:PATH"
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkDir = Join-Path $ScriptDir "tile-work"
$PbfDir = Join-Path $WorkDir "pbf"
$InlandDir = Join-Path $WorkDir "inland"
$OutputDir = Join-Path $ScriptDir "tiles"

# Load regions from JSON
$RegionsFile = Join-Path $ScriptDir "geofabrik-regions.json"
$RegionsData = Get-Content $RegionsFile | ConvertFrom-Json

# Flatten all regions into a single list
$AllRegions = @()
foreach ($continent in $RegionsData.regions) {
    foreach ($region in $continent.regions) {
        $AllRegions += @{
            Continent = $continent.continent
            Name = $region.name
            Url = $region.url
            SizeMb = $region.size_mb
        }
    }
}

Write-Host "=== ClipMap Global Water Tile Preparation ===" -ForegroundColor Green
Write-Host ""
Write-Host "Total regions: $($AllRegions.Count)"
Write-Host "Estimated download: ~65 GB"
Write-Host ""

# Check requirements
function Check-Requirements {
    $missing = @()

    if (-not (Get-Command "mapshaper" -ErrorAction SilentlyContinue)) {
        $missing += "mapshaper (npm install -g mapshaper)"
    }

    if (-not (Get-Command "ogr2ogr" -ErrorAction SilentlyContinue)) {
        $missing += "ogr2ogr (GDAL - choco install gdal)"
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

# Download OSM water polygons (coastlines)
function Download-Coastlines {
    $url = "https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip"
    $zipFile = Join-Path $WorkDir "water-polygons-split-4326.zip"
    $shpDir = Join-Path $WorkDir "water-polygons-split-4326"
    $shpFile = Join-Path $shpDir "water_polygons.shp"

    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

    if (Test-Path $shpFile) {
        Write-Host "Coastlines already downloaded" -ForegroundColor Yellow
        return
    }

    Write-Host "Downloading OSM water polygons (~850 MB)..."
    Invoke-WebRequest -Uri $url -OutFile $zipFile -UseBasicParsing
    Expand-Archive -Path $zipFile -DestinationPath $WorkDir -Force
    Write-Host "[OK] Coastlines downloaded" -ForegroundColor Green
}

# Download all regional PBFs
function Download-RegionalPbfs {
    New-Item -ItemType Directory -Force -Path $PbfDir | Out-Null

    Write-Host ""
    Write-Host "=== Downloading Regional PBFs ===" -ForegroundColor Cyan

    $totalSize = ($AllRegions | Measure-Object -Property SizeMb -Sum).Sum
    Write-Host "Total estimated size: $([math]::Round($totalSize / 1024, 1)) GB"
    Write-Host ""

    $downloaded = 0
    $skipped = 0
    $failed = 0

    foreach ($region in $AllRegions) {
        $pbfFile = Join-Path $PbfDir "$($region.Name).osm.pbf"

        if (Test-Path $pbfFile) {
            $skipped++
            continue
        }

        Write-Host "[$($downloaded + $skipped + $failed + 1)/$($AllRegions.Count)] $($region.Name) (~$($region.SizeMb) MB)..."

        try {
            # Use curl for resume support
            & curl.exe -L -C - -o $pbfFile $region.Url --progress-bar --fail
            if ($LASTEXITCODE -eq 0) {
                $downloaded++
                Write-Host "  [OK]" -ForegroundColor Green
            } else {
                throw "curl failed"
            }
        } catch {
            $failed++
            Write-Host "  [FAILED] $_" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "Downloads: $downloaded new, $skipped already had, $failed failed" -ForegroundColor Cyan
}

# Extract inland water from a single PBF
function Extract-WaterFromPbf {
    param([string]$Name, [string]$PbfPath)

    $shpFile = Join-Path $InlandDir "$Name.shp"

    if (Test-Path $shpFile) {
        return $true  # Already extracted
    }

    if (-not (Test-Path $PbfPath)) {
        return $false  # PBF not found
    }

    # SQL to extract water features
    $sql = "SELECT * FROM multipolygons WHERE natural='water' OR water IS NOT NULL OR waterway='riverbank' OR landuse='reservoir' OR landuse='basin'"

    try {
        $output = & ogr2ogr -f "ESRI Shapefile" $shpFile $PbfPath -sql $sql 2>&1
        return (Test-Path $shpFile)
    } catch {
        return $false
    }
}

# Extract inland water from all PBFs
function Extract-AllInlandWater {
    New-Item -ItemType Directory -Force -Path $InlandDir | Out-Null

    Write-Host ""
    Write-Host "=== Extracting Inland Water ===" -ForegroundColor Cyan
    Write-Host ""

    $startProcessing = [string]::IsNullOrEmpty($StartFrom)
    $extracted = 0
    $skipped = 0
    $failed = 0

    foreach ($region in $AllRegions) {
        # Handle -StartFrom parameter
        if (-not $startProcessing) {
            if ($region.Name -eq $StartFrom) {
                $startProcessing = $true
            } else {
                continue
            }
        }

        $pbfFile = Join-Path $PbfDir "$($region.Name).osm.pbf"
        $shpFile = Join-Path $InlandDir "$($region.Name).shp"

        if (Test-Path $shpFile) {
            $skipped++
            continue
        }

        if (-not (Test-Path $pbfFile)) {
            Write-Host "  $($region.Name): PBF not found, skipping" -ForegroundColor Yellow
            continue
        }

        Write-Host "[$($extracted + $skipped + $failed + 1)] $($region.Name)..." -NoNewline

        if (Extract-WaterFromPbf -Name $region.Name -PbfPath $pbfFile) {
            $extracted++
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            $failed++
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    }

    Write-Host ""
    Write-Host "Extraction: $extracted new, $skipped already had, $failed failed" -ForegroundColor Cyan
}

# Merge all inland water shapefiles using batching (memory efficient)
function Merge-InlandWater {
    $output = Join-Path $WorkDir "inland_water_merged.shp"

    if (Test-Path $output) {
        Write-Host "Merged inland water exists, skipping..." -ForegroundColor Yellow
        return $output
    }

    Write-Host ""
    Write-Host "=== Merging Inland Water ===" -ForegroundColor Cyan

    # Get all extracted shapefiles
    $shpFiles = Get-ChildItem -Path $InlandDir -Filter "*.shp" | Select-Object -ExpandProperty FullName

    if ($shpFiles.Count -eq 0) {
        Write-Host "No inland water files found" -ForegroundColor Yellow
        return $null
    }

    Write-Host "Merging $($shpFiles.Count) regional files..."
    Write-Host "This may take a while for large datasets..."

    # Batch merge to avoid memory issues
    # First, merge by continent
    $continentMerged = @()
    $continents = $RegionsData.regions | Select-Object -ExpandProperty continent -Unique

    foreach ($continent in $continents) {
        $continentFiles = $shpFiles | Where-Object {
            $name = [System.IO.Path]::GetFileNameWithoutExtension($_)
            $matchingRegion = $AllRegions | Where-Object { $_.Name -eq $name -and $_.Continent -eq $continent }
            $null -ne $matchingRegion
        }

        if ($continentFiles.Count -eq 0) { continue }

        $continentOutput = Join-Path $WorkDir "inland_$continent.shp"

        if (-not (Test-Path $continentOutput)) {
            Write-Host "  Merging $continent ($($continentFiles.Count) files)..."

            try {
                & mapshaper $continentFiles combine-files `
                    -merge-layers `
                    -clean `
                    -o format=shapefile $continentOutput

                if (Test-Path $continentOutput) {
                    $continentMerged += $continentOutput
                    Write-Host "    [OK]" -ForegroundColor Green
                }
            } catch {
                Write-Host "    [FAILED] $_" -ForegroundColor Red
            }
        } else {
            $continentMerged += $continentOutput
            Write-Host "  $continent already merged" -ForegroundColor Yellow
        }
    }

    # Now merge all continent files
    if ($continentMerged.Count -gt 0) {
        Write-Host "  Merging all continents..."

        & mapshaper $continentMerged combine-files `
            -merge-layers `
            -clean `
            -o format=shapefile $output

        Write-Host "[OK] All inland water merged" -ForegroundColor Green
    }

    return $output
}

# Merge coastlines and inland water
function Merge-AllWater {
    param([string]$InlandPath)

    $coastlines = Join-Path $WorkDir "water-polygons-split-4326\water_polygons.shp"
    $output = Join-Path $WorkDir "all_water.shp"

    if (Test-Path $output) {
        Write-Host "Combined water file exists, skipping..." -ForegroundColor Yellow
        return
    }

    Write-Host ""
    Write-Host "=== Merging Coastlines + Inland Water ===" -ForegroundColor Cyan

    if ($InlandPath -and (Test-Path $InlandPath)) {
        Write-Host "Combining coastlines with inland water..."
        Write-Host "This is a large operation, please wait..."

        & mapshaper $coastlines $InlandPath combine-files `
            -merge-layers `
            -clean `
            -o format=shapefile $output

        Write-Host "[OK] All water sources merged" -ForegroundColor Green
    } else {
        Write-Host "No inland water - using coastlines only" -ForegroundColor Yellow
        Copy-Item $coastlines $output
        Copy-Item ($coastlines -replace "\.shp$", ".shx") ($output -replace "\.shp$", ".shx")
        Copy-Item ($coastlines -replace "\.shp$", ".dbf") ($output -replace "\.shp$", ".dbf")
        Copy-Item ($coastlines -replace "\.shp$", ".prj") ($output -replace "\.shp$", ".prj") -ErrorAction SilentlyContinue
    }
}

# Create LOD-specific source files
function Create-LodSources {
    $input = Join-Path $WorkDir "all_water.shp"
    $waterDir = Join-Path $OutputDir "water"

    New-Item -ItemType Directory -Force -Path $waterDir | Out-Null

    Write-Host ""
    Write-Host "=== Creating LOD Source Files ===" -ForegroundColor Cyan
    Write-Host ""

    # 1 degree tiles: Full detail
    $out1deg = Join-Path $WorkDir "water_source_1deg.shp"
    Write-Host "1deg (full detail)..."
    if (-not (Test-Path $out1deg)) {
        & mapshaper $input -clean -o format=shapefile $out1deg
        Write-Host "  [OK]" -ForegroundColor Green
    } else {
        Write-Host "  exists" -ForegroundColor Yellow
    }

    # 5 degree tiles
    $out5deg = Join-Path $WorkDir "water_source_5deg.shp"
    Write-Host "5deg (filter under 0.5km2, simplify 10%)..."
    if (-not (Test-Path $out5deg)) {
        & mapshaper $input `
            -filter-islands min-area=0.5km2 `
            -simplify 10% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=shapefile $out5deg
        Write-Host "  [OK]" -ForegroundColor Green
    } else {
        Write-Host "  exists" -ForegroundColor Yellow
    }

    # 10 degree tiles
    $out10deg = Join-Path $WorkDir "water_source_10deg.shp"
    Write-Host "10deg (filter under 2km2, simplify 5%)..."
    if (-not (Test-Path $out10deg)) {
        & mapshaper $input `
            -filter-islands min-area=2km2 `
            -simplify 5% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=shapefile $out10deg
        Write-Host "  [OK]" -ForegroundColor Green
    } else {
        Write-Host "  exists" -ForegroundColor Yellow
    }

    # 20 degree tiles
    $out20deg = Join-Path $WorkDir "water_source_20deg.shp"
    Write-Host "20deg (filter under 10km2, simplify 2%)..."
    if (-not (Test-Path $out20deg)) {
        & mapshaper $input `
            -filter-islands min-area=10km2 `
            -simplify 2% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=shapefile $out20deg
        Write-Host "  [OK]" -ForegroundColor Green
    } else {
        Write-Host "  exists" -ForegroundColor Yellow
    }

    # World file
    $worldJson = Join-Path $waterDir "world.json"
    Write-Host "world.json (filter under 25km2, simplify 1%)..."
    if (-not (Test-Path $worldJson)) {
        & mapshaper $input `
            -filter-islands min-area=25km2 `
            -simplify 1% `
            "-filter" "this.area > 0" `
            -clean `
            -o format=geojson precision=0.0001 $worldJson
        Write-Host "  [OK]" -ForegroundColor Green
    } else {
        Write-Host "  exists" -ForegroundColor Yellow
    }
}

# Show summary
function Show-Summary {
    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Green
    Write-Host ""

    foreach ($deg in @(1, 5, 10, 20)) {
        $file = Join-Path $WorkDir "water_source_${deg}deg.shp"
        if (Test-Path $file) {
            $size = [math]::Round((Get-Item $file).Length / 1MB, 1)
            Write-Host "  water_source_${deg}deg.shp: $size MB"
        }
    }

    $worldJson = Join-Path $OutputDir "water\world.json"
    if (Test-Path $worldJson) {
        $size = [math]::Round((Get-Item $worldJson).Length / 1MB, 1)
        Write-Host "  water/world.json: $size MB"
    }

    Write-Host ""
    Write-Host "Next: Run QGIS tiling, then generateLandTiles.ts"
}

# Main
Check-Requirements
Write-Host ""

Download-Coastlines

if (-not $SkipDownload) {
    Download-RegionalPbfs
}

if (-not $SkipExtract) {
    Extract-AllInlandWater
}

$mergedInland = Merge-InlandWater
Merge-AllWater -InlandPath $mergedInland
Create-LodSources
Show-Summary
