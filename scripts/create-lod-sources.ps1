# Create LOD source files from merged GeoPackages
# Uses mapshaper for water (island filtering) and ogr2ogr for roads/boundaries

param(
    [string]$Layer = "all"  # water, roads, boundaries, or all
)

$ErrorActionPreference = "Stop"

# Add QGIS/GDAL to PATH
$QgisRoot = Get-ChildItem "C:\Program Files\QGIS*" -Directory -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending |
           Select-Object -First 1
if ($QgisRoot) {
    $QgisBin = Join-Path $QgisRoot.FullName "bin"
    $GdalData = Join-Path $QgisRoot.FullName "apps\gdal\share\gdal"
    if (Test-Path $QgisBin) { $env:PATH = "$QgisBin;$env:PATH" }
    if (Test-Path $GdalData) { $env:GDAL_DATA = $GdalData }
}

# Add npm global bin to PATH (for mapshaper)
$NpmBin = Join-Path $env:APPDATA "npm"
if (Test-Path $NpmBin) { $env:PATH = "$NpmBin;$env:PATH" }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkDir = Join-Path $ScriptDir "tile-work"
$OutDir = Join-Path $WorkDir "lod-sources"
$TempDir = Join-Path $WorkDir "lod-temp"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# Run ogr2ogr command
function Run-Ogr2ogr {
    param(
        [string]$InputFile,
        [string]$OutputFile,
        [string]$LayerName,
        [string]$Where = $null,
        [double]$Simplify = 0,
        [string]$Desc
    )

    Write-Host "  $Desc..." -NoNewline

    # Remove output file if it exists (ogr2ogr won't overwrite)
    if (Test-Path $OutputFile) {
        Remove-Item $OutputFile -Force
    }

    # Build ogr2ogr arguments as a list
    $ogrArgs = @("-f", "GPKG", $OutputFile, $InputFile, "-nln", $LayerName)
    if ($Where) {
        $ogrArgs += "-where"
        $ogrArgs += $Where
    }
    if ($Simplify -gt 0) {
        $ogrArgs += "-simplify"
        $ogrArgs += $Simplify.ToString()
    }

    try {
        # Use & operator for direct invocation (handles complex args better)
        $output = & ogr2ogr @ogrArgs 2>&1

        # Check if output file exists and has content (success indicator)
        if ((Test-Path $OutputFile) -and ((Get-Item $OutputFile).Length -gt 1000)) {
            Write-Host " [OK]" -ForegroundColor Green
            return $true
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
            if ($output) { Write-Host "    $output" -ForegroundColor Red }
            return $false
        }
    } catch {
        Write-Host " [ERROR]" -ForegroundColor Red
        Write-Host "    $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Run mapshaper and convert output to GPKG
function Run-Mapshaper {
    param(
        [string]$InputFile,
        [string]$OutputFile,
        [string]$MinArea = $null,
        [string]$Simplify = $null,
        [string]$Desc
    )

    Write-Host "  $Desc..." -NoNewline

    # mapshaper doesn't support GPKG output, so output to shapefile first
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($OutputFile)
    $tempShp = Join-Path $TempDir "$baseName.shp"

    # Build mapshaper command
    $mapshaperArgs = @($InputFile)
    if ($MinArea) {
        $mapshaperArgs += @("-filter-islands", "min-area=$MinArea")
    }
    if ($Simplify) {
        $mapshaperArgs += @("-simplify", $Simplify, "keep-shapes")
    }
    $mapshaperArgs += @("-filter", "this.area > 0", "-clean", "-o", "format=shapefile", $tempShp)

    $logFile = [System.IO.Path]::GetTempFileName()

    try {
        # Run mapshaper
        $proc = Start-Process -FilePath "mapshaper" `
            -ArgumentList $mapshaperArgs `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardError $logFile

        $stderr = Get-Content $logFile -Raw -ErrorAction SilentlyContinue

        if ($proc.ExitCode -ne 0) {
            Write-Host " [FAILED - mapshaper]" -ForegroundColor Red
            if ($stderr) { Write-Host "    $stderr" -ForegroundColor Red }
            return $false
        }

        # Convert shapefile to GPKG
        $proc2 = Start-Process -FilePath "ogr2ogr" `
            -ArgumentList @("-f", "GPKG", $OutputFile, $tempShp, "-nln", "water") `
            -NoNewWindow -Wait -PassThru `
            -RedirectStandardError $logFile

        $stderr2 = Get-Content $logFile -Raw -ErrorAction SilentlyContinue

        # Clean up temp shapefile
        Remove-Item "$TempDir\$baseName.*" -ErrorAction SilentlyContinue

        if ($proc2.ExitCode -eq 0) {
            Write-Host " [OK]" -ForegroundColor Green
            return $true
        } else {
            Write-Host " [FAILED - ogr2ogr]" -ForegroundColor Red
            if ($stderr2) { Write-Host "    $stderr2" -ForegroundColor Red }
            return $false
        }
    } finally {
        Remove-Item $logFile -ErrorAction SilentlyContinue
    }
}

# Water LODs - uses mapshaper for island filtering
function Create-WaterLods {
    Write-Host ""
    Write-Host "=== Creating Water LODs ===" -ForegroundColor Cyan

    $inputFile = Join-Path $WorkDir "all_water.gpkg"
    if (-not (Test-Path $inputFile)) {
        Write-Host "  Input not found: $inputFile" -ForegroundColor Red
        return
    }

    # Data-driven thresholds based on polygon distribution:
    # 1deg: full (19M polygons)
    # 2.5deg: >0.5km² (645k polygons)
    # 5deg: >2km² (237k polygons)
    # 10deg: >10km² (89k polygons)
    # 20deg/world: >50km² (55k polygons)

    $out = Join-Path $OutDir "water_1deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Mapshaper -InputFile $inputFile -OutputFile $out -Desc "1deg (full, 19M)"
    } else { Write-Host "  1deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "water_2.5deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Mapshaper -InputFile $inputFile -OutputFile $out -MinArea "0.5km2" -Simplify "50%" -Desc "2.5deg (>0.5km2, 645k)"
    } else { Write-Host "  2.5deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "water_5deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Mapshaper -InputFile $inputFile -OutputFile $out -MinArea "2km2" -Simplify "25%" -Desc "5deg (>2km2, 237k)"
    } else { Write-Host "  5deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "water_10deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Mapshaper -InputFile $inputFile -OutputFile $out -MinArea "10km2" -Simplify "10%" -Desc "10deg (>10km2, 89k)"
    } else { Write-Host "  10deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "water_20deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Mapshaper -InputFile $inputFile -OutputFile $out -MinArea "50km2" -Simplify "5%" -Desc "20deg (>50km2, 55k)"
    } else { Write-Host "  20deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "water_world.gpkg"
    if (-not (Test-Path $out)) {
        Run-Mapshaper -InputFile $inputFile -OutputFile $out -MinArea "50km2" -Simplify "1%" -Desc "world (>50km2, 55k)"
    } else { Write-Host "  world [exists]" -ForegroundColor Yellow }
}

# Roads LODs - attribute-based filtering with ogr2ogr
function Create-RoadsLods {
    Write-Host ""
    Write-Host "=== Creating Roads LODs ===" -ForegroundColor Yellow

    $inputFile = Join-Path $WorkDir "roads_merged.gpkg"
    if (-not (Test-Path $inputFile)) {
        Write-Host "  Input not found: $inputFile" -ForegroundColor Red
        return
    }

    # Highway types by LOD
    $types_20deg = "highway IN ('motorway','motorway_link','trunk','trunk_link')"
    $types_10deg = "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link')"
    $types_5deg = "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link')"
    $types_2_5deg = "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','living_street')"
    $types_1deg = "highway IN ('motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','living_street','residential','service','track')"

    $out = Join-Path $OutDir "roads_1deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "roads" -Where $types_1deg -Desc "1deg (residential+)"
    } else { Write-Host "  1deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "roads_2.5deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "roads" -Where $types_2_5deg -Simplify 0.0002 -Desc "2.5deg (unclassified+)"
    } else { Write-Host "  2.5deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "roads_5deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "roads" -Where $types_5deg -Simplify 0.0005 -Desc "5deg (tertiary+)"
    } else { Write-Host "  5deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "roads_10deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "roads" -Where $types_10deg -Simplify 0.001 -Desc "10deg (primary+)"
    } else { Write-Host "  10deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "roads_20deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "roads" -Where $types_20deg -Simplify 0.002 -Desc "20deg (motorway/trunk)"
    } else { Write-Host "  20deg [exists]" -ForegroundColor Yellow }
}

# Boundaries LODs - admin_level filtering with ogr2ogr
function Create-BoundariesLods {
    Write-Host ""
    Write-Host "=== Creating Boundaries LODs ===" -ForegroundColor Magenta

    $inputFile = Join-Path $WorkDir "boundaries_merged.gpkg"
    if (-not (Test-Path $inputFile)) {
        Write-Host "  Input not found: $inputFile" -ForegroundColor Red
        return
    }

    # Admin levels by LOD (column truncated to admin_leve in GPKG from shapefile)
    $levels_20deg = "admin_leve = '2'"
    $levels_10deg = "admin_leve IN ('2','3','4')"
    $levels_5deg = "admin_leve IN ('2','3','4','5','6')"
    $levels_2_5deg = "admin_leve IN ('2','3','4','5','6','7')"
    $levels_1deg = "admin_leve IN ('2','3','4','5','6','7','8')"

    $out = Join-Path $OutDir "boundaries_1deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "boundaries" -Where $levels_1deg -Desc "1deg (level 2-8)"
    } else { Write-Host "  1deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "boundaries_2.5deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "boundaries" -Where $levels_2_5deg -Simplify 0.001 -Desc "2.5deg (level 2-7)"
    } else { Write-Host "  2.5deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "boundaries_5deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "boundaries" -Where $levels_5deg -Simplify 0.002 -Desc "5deg (level 2-6)"
    } else { Write-Host "  5deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "boundaries_10deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "boundaries" -Where $levels_10deg -Simplify 0.005 -Desc "10deg (level 2-4)"
    } else { Write-Host "  10deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "boundaries_20deg.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "boundaries" -Where $levels_20deg -Simplify 0.01 -Desc "20deg (countries)"
    } else { Write-Host "  20deg [exists]" -ForegroundColor Yellow }

    $out = Join-Path $OutDir "boundaries_world.gpkg"
    if (-not (Test-Path $out)) {
        Run-Ogr2ogr -InputFile $inputFile -OutputFile $out -LayerName "boundaries" -Where $levels_20deg -Simplify 0.05 -Desc "world (countries)"
    } else { Write-Host "  world [exists]" -ForegroundColor Yellow }
}

# Show summary
function Show-Summary {
    Write-Host ""
    Write-Host "=== LOD Source Files ===" -ForegroundColor Green

    $files = Get-ChildItem $OutDir -Filter "*.gpkg" -ErrorAction SilentlyContinue | Sort-Object Name
    if ($files) {
        foreach ($file in $files) {
            $size = [math]::Round($file.Length / 1MB, 1)
            $sizeStr = if ($size -ge 1024) { "{0:N1} GB" -f ($size / 1024) } else { "$size MB" }
            Write-Host "  $($file.Name): $sizeStr"
        }
    } else {
        Write-Host "  No files generated yet" -ForegroundColor Yellow
    }
}

# Main
Write-Host "Creating LOD source files..." -ForegroundColor White
Write-Host "Input: $WorkDir"
Write-Host "Output: $OutDir"

switch ($Layer.ToLower()) {
    "water" { Create-WaterLods }
    "roads" { Create-RoadsLods }
    "boundaries" { Create-BoundariesLods }
    "all" {
        Create-WaterLods
        Create-RoadsLods
        Create-BoundariesLods
    }
    default {
        Write-Host "Unknown layer: $Layer" -ForegroundColor Red
        Write-Host "Use: water, roads, boundaries, or all"
    }
}

Show-Summary
