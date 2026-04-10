#
# ClipMap Global Tile Preparation Script (PowerShell)
#
# Downloads regional PBFs from Geofabrik and extracts:
#   - Water (inland lakes, rivers, reservoirs)
#   - Roads (all highway types)
#   - Boundaries (administrative borders)
#
# Then merges with coastlines and creates LOD-specific source files.
#
# Geofabrik guarantees: subregions don't overlap and together equal parent region.
# This ensures complete coverage with no gaps or duplicates.
#
# Usage:
#   .\prepare-tiles-global.ps1                      # Full processing
#   .\prepare-tiles-global.ps1 -SkipDownload        # Skip PBF downloads
#   .\prepare-tiles-global.ps1 -Layers "water"      # Only process water
#   .\prepare-tiles-global.ps1 -Layers "water,roads" # Process water and roads
#   .\prepare-tiles-global.ps1 -StartFrom "france"  # Resume from specific region
#
# Requirements:
#   - mapshaper (npm install -g mapshaper)
#   - ogr2ogr (GDAL)
#   - ~100 GB free disk space
#

param(
    [switch]$SkipDownload = $false,
    [switch]$SkipExtract = $false,
    [string]$StartFrom = "",
    [string]$Layers = "water,roads,boundaries"  # Comma-separated list
)

$ErrorActionPreference = "Stop"

# Add npm global bin to PATH
$NpmGlobalBin = Join-Path $env:APPDATA "npm"
if (Test-Path $NpmGlobalBin) {
    $env:PATH = "$NpmGlobalBin;$env:PATH"
}

# Add QGIS bin to PATH (for ogr2ogr)
$QgisRoot = Get-ChildItem "C:\Program Files\QGIS*" -Directory -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending |
           Select-Object -First 1
if ($QgisRoot) {
    $QgisBin = Join-Path $QgisRoot.FullName "bin"
    $GdalData = Join-Path $QgisRoot.FullName "apps\gdal\share\gdal"
    if (Test-Path $QgisBin) {
        $env:PATH = "$QgisBin;$env:PATH"
    }
    if (Test-Path $GdalData) {
        $env:GDAL_DATA = $GdalData
    }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkDir = Join-Path $ScriptDir "tile-work"
$PbfDir = Join-Path $WorkDir "pbf"
$OutputDir = Join-Path $ScriptDir "tiles"

# Parse layers to process
$LayersToProcess = $Layers.ToLower().Split(",") | ForEach-Object { $_.Trim() }

# Layer extraction configurations
# Note: GDAL's OSM driver only exposes certain tags as columns.
# Available in multipolygons: natural, landuse, leisure, amenity, etc.
# Available in lines: highway, boundary, waterway, etc.
# Other tags are in 'other_tags' hstore column.
$LayerConfigs = @{
    water = @{
        Name = "water"
        SubDir = "inland"
        # Lakes, ponds, reservoirs from multipolygons
        # natural=water covers most water bodies
        # landuse=reservoir/basin for man-made water bodies
        Sql = "SELECT * FROM multipolygons WHERE natural='water' OR landuse='reservoir' OR landuse='basin'"
        Color = "Cyan"
    }
    roads = @{
        Name = "roads"
        SubDir = "roads"
        # All highway types from lines layer
        Sql = "SELECT * FROM lines WHERE highway IS NOT NULL"
        Color = "Yellow"
    }
    boundaries = @{
        Name = "boundaries"
        SubDir = "boundaries"
        # Administrative boundaries are in multipolygons layer
        Sql = "SELECT * FROM multipolygons WHERE boundary='administrative'"
        Color = "Magenta"
    }
}

# Load regions from JSON
$RegionsFile = Join-Path $ScriptDir "geofabrik-regions.json"
$RegionsData = Get-Content $RegionsFile | ConvertFrom-Json

# Flatten all regions into a single list (use PSCustomObject for property access)
$AllRegions = @()
foreach ($continent in $RegionsData.regions) {
    foreach ($region in $continent.regions) {
        $AllRegions += [PSCustomObject]@{
            Continent = $continent.continent
            Name = $region.name
            Url = $region.url
            SizeMb = $region.size_mb
        }
    }
}

Write-Host "=== ClipMap Global Tile Preparation ===" -ForegroundColor Green
Write-Host ""
Write-Host "Layers to process: $($LayersToProcess -join ', ')"
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
    Write-Host "Downloads: $downloaded new, $skipped existing, $failed failed" -ForegroundColor Cyan
}

# Generic extraction function for any layer
function Extract-LayerFromPbf {
    param(
        [string]$LayerName,
        [string]$RegionName,
        [string]$PbfPath,
        [string]$Sql,
        [string]$OutputDir
    )

    $shpFile = Join-Path $OutputDir "$RegionName.shp"

    if (Test-Path $shpFile) {
        return "exists"
    }

    if (-not (Test-Path $PbfPath)) {
        return "no_pbf"
    }

    # Run ogr2ogr using cmd /c to handle complex arguments properly
    $logFile = [System.IO.Path]::GetTempFileName()
    $args = "-f `"ESRI Shapefile`" `"$shpFile`" `"$PbfPath`" -sql `"$Sql`""
    $proc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "ogr2ogr $args 2>`"$logFile`"" `
        -NoNewWindow -Wait -PassThru

    $exitCode = $proc.ExitCode
    $stderr = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    Remove-Item $logFile -ErrorAction SilentlyContinue

    if ($exitCode -ne 0 -and $stderr -notmatch "Warning") {
        Write-Host " Error: $stderr" -ForegroundColor Red
        return "failed"
    }
    if (Test-Path $shpFile) {
        return "ok"
    } else {
        return "empty"  # No features found
    }
}

# Extract all features for a specific layer
function Extract-AllForLayer {
    param([hashtable]$Config)

    $layerDir = Join-Path $WorkDir $Config.SubDir
    New-Item -ItemType Directory -Force -Path $layerDir | Out-Null

    Write-Host ""
    Write-Host "=== Extracting $($Config.Name) ===" -ForegroundColor $Config.Color
    Write-Host ""

    $startProcessing = [string]::IsNullOrEmpty($StartFrom)
    $stats = @{ extracted = 0; skipped = 0; empty = 0; failed = 0 }

    foreach ($region in $AllRegions) {
        if (-not $startProcessing) {
            if ($region.Name -eq $StartFrom) {
                $startProcessing = $true
            } else {
                continue
            }
        }

        $pbfFile = Join-Path $PbfDir "$($region.Name).osm.pbf"
        $total = $stats.extracted + $stats.skipped + $stats.empty + $stats.failed + 1

        Write-Host "[$total/$($AllRegions.Count)] $($region.Name)..." -NoNewline

        $result = Extract-LayerFromPbf `
            -LayerName $Config.Name `
            -RegionName $region.Name `
            -PbfPath $pbfFile `
            -Sql $Config.Sql `
            -OutputDir $layerDir

        switch ($result) {
            "ok" {
                $stats.extracted++
                Write-Host " [OK]" -ForegroundColor Green
            }
            "exists" {
                $stats.skipped++
                Write-Host " [exists]" -ForegroundColor Yellow
            }
            "empty" {
                $stats.empty++
                Write-Host " [empty]" -ForegroundColor DarkGray
            }
            "no_pbf" {
                Write-Host " [no PBF]" -ForegroundColor Yellow
            }
            default {
                $stats.failed++
                Write-Host " [FAILED]" -ForegroundColor Red
            }
        }
    }

    Write-Host ""
    Write-Host "$($Config.Name): $($stats.extracted) extracted, $($stats.skipped) existing, $($stats.empty) empty, $($stats.failed) failed" -ForegroundColor $Config.Color

    return $layerDir
}

# Merge shapefiles by continent then globally (memory efficient)
function Merge-LayerFiles {
    param(
        [string]$LayerName,
        [string]$InputDir,
        [string]$OutputFile
    )

    if (Test-Path $OutputFile) {
        Write-Host "  $LayerName merged file exists, skipping..." -ForegroundColor Yellow
        return $OutputFile
    }

    $shpFiles = Get-ChildItem -Path $InputDir -Filter "*.shp" -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty FullName

    if ($shpFiles.Count -eq 0) {
        Write-Host "  No $LayerName files to merge" -ForegroundColor Yellow
        return $null
    }

    Write-Host "  Merging $($shpFiles.Count) $LayerName files..."

    # Merge by continent first for memory efficiency
    $continentMerged = @()
    $continents = $RegionsData.regions | Select-Object -ExpandProperty continent -Unique

    foreach ($continent in $continents) {
        $continentFiles = $shpFiles | Where-Object {
            $name = [System.IO.Path]::GetFileNameWithoutExtension($_)
            $matchingRegion = $AllRegions | Where-Object { $_.Name -eq $name -and $_.Continent -eq $continent }
            $null -ne $matchingRegion
        }

        if ($continentFiles.Count -eq 0) { continue }

        $continentOutput = Join-Path $WorkDir "${LayerName}_$continent.shp"

        if (-not (Test-Path $continentOutput)) {
            Write-Host "    $continent ($($continentFiles.Count) files)..." -NoNewline

            # For large file counts, merge in batches of 5 to avoid command line limits
            $batchSize = 5
            $batchOutputs = @()
            $batchNum = 0

            if ($continentFiles.Count -gt $batchSize) {
                # Merge in batches
                for ($i = 0; $i -lt $continentFiles.Count; $i += $batchSize) {
                    $batch = $continentFiles[$i..[Math]::Min($i + $batchSize - 1, $continentFiles.Count - 1)]
                    $batchOutput = Join-Path $WorkDir "${LayerName}_${continent}_batch${batchNum}.shp"
                    $batchNum++

                    $filesStr = ($batch | ForEach-Object { "`"$_`"" }) -join " "
                    $cmdArgs = "$filesStr combine-files -merge-layers -clean -o format=shapefile `"$batchOutput`""

                    $logFile = [System.IO.Path]::GetTempFileName()
                    $proc = Start-Process -FilePath "cmd.exe" `
                        -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
                        -NoNewWindow -Wait -PassThru
                    Remove-Item $logFile -ErrorAction SilentlyContinue

                    if (Test-Path $batchOutput) {
                        $batchOutputs += $batchOutput
                    }
                }

                # Merge all batch outputs
                if ($batchOutputs.Count -gt 0) {
                    $filesStr = ($batchOutputs | ForEach-Object { "`"$_`"" }) -join " "
                    $cmdArgs = "$filesStr combine-files -merge-layers -clean -o format=shapefile `"$continentOutput`""

                    $logFile = [System.IO.Path]::GetTempFileName()
                    $proc = Start-Process -FilePath "cmd.exe" `
                        -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
                        -NoNewWindow -Wait -PassThru
                    Remove-Item $logFile -ErrorAction SilentlyContinue

                    # Clean up batch files
                    foreach ($bf in $batchOutputs) {
                        Remove-Item $bf -ErrorAction SilentlyContinue
                        Remove-Item ($bf -replace "\.shp$", ".shx") -ErrorAction SilentlyContinue
                        Remove-Item ($bf -replace "\.shp$", ".dbf") -ErrorAction SilentlyContinue
                        Remove-Item ($bf -replace "\.shp$", ".prj") -ErrorAction SilentlyContinue
                    }
                }
            } else {
                # Small file count - merge directly
                $filesStr = ($continentFiles | ForEach-Object { "`"$_`"" }) -join " "
                $cmdArgs = "$filesStr combine-files -merge-layers -clean -o format=shapefile `"$continentOutput`""

                $logFile = [System.IO.Path]::GetTempFileName()
                $proc = Start-Process -FilePath "cmd.exe" `
                    -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
                    -NoNewWindow -Wait -PassThru
                Remove-Item $logFile -ErrorAction SilentlyContinue
            }

            if (Test-Path $continentOutput) {
                $continentMerged += $continentOutput
                Write-Host " [OK]" -ForegroundColor Green
            } else {
                Write-Host " [FAILED]" -ForegroundColor Red
            }
        } else {
            $continentMerged += $continentOutput
        }
    }

    # Merge all continent files
    if ($continentMerged.Count -gt 0) {
        Write-Host "    Merging continents..." -NoNewline

        $filesStr = ($continentMerged | ForEach-Object { "`"$_`"" }) -join " "
        $cmdArgs = "$filesStr combine-files -merge-layers -clean -o format=shapefile `"$OutputFile`""

        $logFile = [System.IO.Path]::GetTempFileName()
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
        Remove-Item $logFile -ErrorAction SilentlyContinue

        if (Test-Path $OutputFile) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    }

    return $OutputFile
}

# Merge coastlines and inland water
function Merge-AllWater {
    param([string]$InlandPath)

    $coastlines = Join-Path $WorkDir "water-polygons-split-4326\water_polygons.shp"
    $output = Join-Path $WorkDir "all_water.shp"

    if (Test-Path $output) {
        Write-Host "  Combined water exists, skipping..." -ForegroundColor Yellow
        return
    }

    if ($InlandPath -and (Test-Path $InlandPath)) {
        Write-Host "  Combining coastlines + inland..." -NoNewline
        & mapshaper $coastlines $InlandPath combine-files `
            -merge-layers `
            -clean `
            -o format=shapefile $output 2>&1 | Out-Null
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host "  Using coastlines only" -ForegroundColor Yellow
        Copy-Item $coastlines $output
        Copy-Item ($coastlines -replace "\.shp$", ".shx") ($output -replace "\.shp$", ".shx")
        Copy-Item ($coastlines -replace "\.shp$", ".dbf") ($output -replace "\.shp$", ".dbf")
        Copy-Item ($coastlines -replace "\.shp$", ".prj") ($output -replace "\.shp$", ".prj") -ErrorAction SilentlyContinue
    }
}

# Create LOD source files for water
function Create-WaterLodSources {
    $input = Join-Path $WorkDir "all_water.shp"
    $waterDir = Join-Path $OutputDir "water"
    New-Item -ItemType Directory -Force -Path $waterDir | Out-Null

    Write-Host ""
    Write-Host "=== Creating Water LOD Sources ===" -ForegroundColor Cyan

    $lods = @(
        @{ Name = "1deg"; Filter = $null; Simplify = $null; Desc = "full detail" },
        @{ Name = "5deg"; Filter = "0.5km2"; Simplify = "10%"; Desc = "filter 0.5km2, simplify 10%" },
        @{ Name = "10deg"; Filter = "2km2"; Simplify = "5%"; Desc = "filter 2km2, simplify 5%" },
        @{ Name = "20deg"; Filter = "10km2"; Simplify = "2%"; Desc = "filter 10km2, simplify 2%" }
    )

    foreach ($lod in $lods) {
        $output = Join-Path $WorkDir "water_source_$($lod.Name).shp"
        Write-Host "  $($lod.Name) ($($lod.Desc))..." -NoNewline

        if (Test-Path $output) {
            Write-Host " [exists]" -ForegroundColor Yellow
            continue
        }

        # Build mapshaper command for cmd /c
        if ($lod.Filter) {
            $cmdArgs = "`"$input`" -filter-islands min-area=$($lod.Filter) -simplify $($lod.Simplify) -filter `"this.area > 0`" -clean -o format=shapefile `"$output`""
        } else {
            $cmdArgs = "`"$input`" -clean -o format=shapefile `"$output`""
        }

        $logFile = [System.IO.Path]::GetTempFileName()
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
        Remove-Item $logFile -ErrorAction SilentlyContinue

        if (Test-Path $output) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    }

    # World file
    $worldJson = Join-Path $waterDir "world.json"
    Write-Host "  world.json (filter 25km2, simplify 1%)..." -NoNewline
    if (-not (Test-Path $worldJson)) {
        $cmdArgs = "`"$input`" -filter-islands min-area=25km2 -simplify 1% -filter `"this.area > 0`" -clean -o format=geojson precision=0.0001 `"$worldJson`""
        $logFile = [System.IO.Path]::GetTempFileName()
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
        Remove-Item $logFile -ErrorAction SilentlyContinue

        if (Test-Path $worldJson) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    } else {
        Write-Host " [exists]" -ForegroundColor Yellow
    }
}

# Create LOD source files for roads
function Create-RoadsLodSources {
    $input = Join-Path $WorkDir "roads_merged.shp"

    if (-not (Test-Path $input)) {
        Write-Host "  No roads to process" -ForegroundColor Yellow
        return
    }

    $roadsDir = Join-Path $OutputDir "roads"
    New-Item -ItemType Directory -Force -Path $roadsDir | Out-Null

    Write-Host ""
    Write-Host "=== Creating Roads LOD Sources ===" -ForegroundColor Yellow

    # Roads need filtering by highway type for different LODs
    $lods = @(
        @{
            Name = "1deg"
            Filter = $null  # All roads
            Simplify = $null
            Desc = "all roads"
        },
        @{
            Name = "5deg"
            Filter = "highway == 'motorway' || highway == 'trunk' || highway == 'primary' || highway == 'secondary'"
            Simplify = "10%"
            Desc = "secondary+"
        },
        @{
            Name = "10deg"
            Filter = "highway == 'motorway' || highway == 'trunk' || highway == 'primary'"
            Simplify = "5%"
            Desc = "primary+"
        },
        @{
            Name = "20deg"
            Filter = "highway == 'motorway' || highway == 'trunk'"
            Simplify = "2%"
            Desc = "highways only"
        }
    )

    foreach ($lod in $lods) {
        $output = Join-Path $WorkDir "roads_source_$($lod.Name).shp"
        Write-Host "  $($lod.Name) ($($lod.Desc))..." -NoNewline

        if (Test-Path $output) {
            Write-Host " [exists]" -ForegroundColor Yellow
            continue
        }

        # Build mapshaper command for cmd /c
        if ($lod.Filter -and $lod.Simplify) {
            $cmdArgs = "`"$input`" -filter `"$($lod.Filter)`" -simplify $($lod.Simplify) -clean -o format=shapefile `"$output`""
        } elseif ($lod.Simplify) {
            $cmdArgs = "`"$input`" -simplify $($lod.Simplify) -clean -o format=shapefile `"$output`""
        } else {
            $cmdArgs = "`"$input`" -clean -o format=shapefile `"$output`""
        }

        $logFile = [System.IO.Path]::GetTempFileName()
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
        Remove-Item $logFile -ErrorAction SilentlyContinue

        if (Test-Path $output) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    }
}

# Create LOD source files for boundaries
function Create-BoundariesLodSources {
    $input = Join-Path $WorkDir "boundaries_merged.shp"

    if (-not (Test-Path $input)) {
        Write-Host "  No boundaries to process" -ForegroundColor Yellow
        return
    }

    $boundariesDir = Join-Path $OutputDir "boundaries"
    New-Item -ItemType Directory -Force -Path $boundariesDir | Out-Null

    Write-Host ""
    Write-Host "=== Creating Boundaries LOD Sources ===" -ForegroundColor Magenta

    # Note: OSM admin_level filtering requires the attribute to be present
    # We'll do basic simplification for now, filtering can be done in QGIS
    $lods = @(
        @{ Name = "1deg"; Simplify = $null; Desc = "full detail" },
        @{ Name = "5deg"; Simplify = "10%"; Desc = "simplify 10%" },
        @{ Name = "10deg"; Simplify = "5%"; Desc = "simplify 5%" },
        @{ Name = "20deg"; Simplify = "2%"; Desc = "simplify 2%" }
    )

    foreach ($lod in $lods) {
        $output = Join-Path $WorkDir "boundaries_source_$($lod.Name).shp"
        Write-Host "  $($lod.Name) ($($lod.Desc))..." -NoNewline

        if (Test-Path $output) {
            Write-Host " [exists]" -ForegroundColor Yellow
            continue
        }

        # Build mapshaper command for cmd /c
        if ($lod.Simplify) {
            $cmdArgs = "`"$input`" -simplify $($lod.Simplify) -clean -o format=shapefile `"$output`""
        } else {
            $cmdArgs = "`"$input`" -clean -o format=shapefile `"$output`""
        }

        $logFile = [System.IO.Path]::GetTempFileName()
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
        Remove-Item $logFile -ErrorAction SilentlyContinue

        if (Test-Path $output) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    }

    # World boundaries file
    $worldJson = Join-Path $boundariesDir "world.json"
    Write-Host "  world.json (simplify 1%)..." -NoNewline
    if (-not (Test-Path $worldJson)) {
        $cmdArgs = "`"$input`" -simplify 1% -clean -o format=geojson precision=0.0001 `"$worldJson`""
        $logFile = [System.IO.Path]::GetTempFileName()
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "mapshaper $cmdArgs 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
        Remove-Item $logFile -ErrorAction SilentlyContinue

        if (Test-Path $worldJson) {
            Write-Host " [OK]" -ForegroundColor Green
        } else {
            Write-Host " [FAILED]" -ForegroundColor Red
        }
    } else {
        Write-Host " [exists]" -ForegroundColor Yellow
    }
}

# Show summary
function Show-Summary {
    Write-Host ""
    Write-Host "=== Summary ===" -ForegroundColor Green
    Write-Host ""

    foreach ($layer in @("water", "roads", "boundaries")) {
        Write-Host "$layer`:" -ForegroundColor Cyan
        foreach ($deg in @(1, 5, 10, 20)) {
            $file = Join-Path $WorkDir "${layer}_source_${deg}deg.shp"
            if (Test-Path $file) {
                $size = [math]::Round((Get-Item $file).Length / 1MB, 1)
                Write-Host "  ${deg}deg: $size MB"
            }
        }
    }

    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Run QGIS tiling for each layer"
    Write-Host "  2. Run: npx tsx generateLandTiles.ts"
    Write-Host "  3. Upload to R2"
}

# ============================================
# MAIN
# ============================================

Check-Requirements
Write-Host ""

# Download coastlines (only needed for water)
if ($LayersToProcess -contains "water") {
    Download-Coastlines
}

# Download PBFs
if (-not $SkipDownload) {
    Download-RegionalPbfs
}

# Extract and merge each layer
if (-not $SkipExtract) {
    Write-Host ""
    Write-Host "=== Extracting Layers ===" -ForegroundColor Green

    foreach ($layerName in $LayersToProcess) {
        if ($LayerConfigs.ContainsKey($layerName)) {
            $config = $LayerConfigs[$layerName]
            $layerDir = Extract-AllForLayer -Config $config
        }
    }
}

# Merge extracted files
Write-Host ""
Write-Host "=== Merging Layers ===" -ForegroundColor Green

if ($LayersToProcess -contains "water") {
    $inlandDir = Join-Path $WorkDir "inland"
    $inlandMerged = Join-Path $WorkDir "inland_water_merged.shp"
    Merge-LayerFiles -LayerName "inland" -InputDir $inlandDir -OutputFile $inlandMerged
    Merge-AllWater -InlandPath $inlandMerged
}

if ($LayersToProcess -contains "roads") {
    $roadsDir = Join-Path $WorkDir "roads"
    $roadsMerged = Join-Path $WorkDir "roads_merged.shp"
    Merge-LayerFiles -LayerName "roads" -InputDir $roadsDir -OutputFile $roadsMerged
}

if ($LayersToProcess -contains "boundaries") {
    $boundariesDir = Join-Path $WorkDir "boundaries"
    $boundariesMerged = Join-Path $WorkDir "boundaries_merged.shp"
    Merge-LayerFiles -LayerName "boundaries" -InputDir $boundariesDir -OutputFile $boundariesMerged
}

# Create LOD sources
if ($LayersToProcess -contains "water") {
    Create-WaterLodSources
}

if ($LayersToProcess -contains "roads") {
    Create-RoadsLodSources
}

if ($LayersToProcess -contains "boundaries") {
    Create-BoundariesLodSources
}

Show-Summary
