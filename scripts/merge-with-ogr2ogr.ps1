# Merge shapefiles using ogr2ogr (more memory efficient than mapshaper)
param(
    [string]$Layer = "roads"  # roads, inland, or boundaries
)

$ErrorActionPreference = "Stop"

# Add QGIS to PATH
$QgisRoot = Get-ChildItem "C:\Program Files\QGIS*" -Directory -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending |
           Select-Object -First 1
if ($QgisRoot) {
    $QgisBin = Join-Path $QgisRoot.FullName "bin"
    $GdalData = Join-Path $QgisRoot.FullName "apps\gdal\share\gdal"
    if (Test-Path $QgisBin) { $env:PATH = "$QgisBin;$env:PATH" }
    if (Test-Path $GdalData) { $env:GDAL_DATA = $GdalData }
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkDir = Join-Path $ScriptDir "tile-work"

# Layer configs - using GeoPackage to avoid 2GB shapefile limit
$configs = @{
    roads = @{
        InputDir = Join-Path $WorkDir "roads"
        Output = Join-Path $WorkDir "roads_merged.gpkg"
    }
    inland = @{
        InputDir = Join-Path $WorkDir "inland"
        Output = Join-Path $WorkDir "inland_merged.gpkg"
    }
    boundaries = @{
        InputDir = Join-Path $WorkDir "boundaries"
        Output = Join-Path $WorkDir "boundaries_merged.gpkg"
    }
}

$config = $configs[$Layer]
if (-not $config) {
    Write-Host "Unknown layer: $Layer. Use: roads, inland, or boundaries" -ForegroundColor Red
    exit 1
}

$inputDir = $config.InputDir
$output = $config.Output

# Get all shapefiles
$shpFiles = Get-ChildItem -Path $inputDir -Filter "*.shp" | Select-Object -ExpandProperty FullName
Write-Host "Merging $($shpFiles.Count) $Layer files using ogr2ogr..." -ForegroundColor Cyan

# Remove existing output
if (Test-Path $output) {
    Remove-Item $output -Force
}

$count = 0
$total = $shpFiles.Count

foreach ($shp in $shpFiles) {
    $count++
    $name = [System.IO.Path]::GetFileNameWithoutExtension($shp)
    Write-Host "[$count/$total] $name..." -NoNewline

    # Run via cmd /c to avoid PowerShell stderr issues
    $logFile = [System.IO.Path]::GetTempFileName()

    if ($count -eq 1) {
        # First file - create output
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "ogr2ogr -f GPKG `"$output`" `"$shp`" -nln merged 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
    } else {
        # Subsequent files - append
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "ogr2ogr -f GPKG -append -update `"$output`" `"$shp`" -nln merged 2>`"$logFile`"" `
            -NoNewWindow -Wait -PassThru
    }

    $exitCode = $proc.ExitCode
    $stderr = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
    Remove-Item $logFile -ErrorAction SilentlyContinue

    if ($exitCode -eq 0) {
        Write-Host " [OK]" -ForegroundColor Green
    } else {
        Write-Host " [FAILED]" -ForegroundColor Red
        if ($stderr) { Write-Host "  $stderr" -ForegroundColor Red }
    }
}

# Check result
if (Test-Path $output) {
    $size = (Get-Item $output).Length / 1MB
    Write-Host ""
    Write-Host "Created: $output ($([math]::Round($size, 1)) MB)" -ForegroundColor Green
} else {
    Write-Host "Failed to create output file" -ForegroundColor Red
}
