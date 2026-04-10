# Test script for ogr2ogr extraction

$QgisRoot = Get-ChildItem "C:\Program Files\QGIS*" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$QgisBin = Join-Path $QgisRoot.FullName "bin"
$GdalData = Join-Path $QgisRoot.FullName "apps\gdal\share\gdal"

Write-Host "QGIS Root: $($QgisRoot.FullName)"
Write-Host "QGIS Bin: $QgisBin"
Write-Host "GDAL Data: $GdalData"

$env:PATH = "$QgisBin;$env:PATH"
$env:GDAL_DATA = $GdalData

Write-Host ""
Write-Host "Testing ogr2ogr version..."
& ogr2ogr --version

$pbfFile = "C:\Users\user\source\repos\clipmap\scripts\tile-work\pbf\andorra.osm.pbf"

Write-Host ""
Write-Host "=== Available layers in PBF ==="
& ogrinfo $pbfFile

Write-Host ""
Write-Host "=== Multipolygons layer schema ==="
& ogrinfo -so $pbfFile multipolygons

Write-Host ""
Write-Host "=== Lines layer schema ==="
& ogrinfo -so $pbfFile lines

Write-Host ""
Write-Host "Testing extraction from Andorra..."
$shpFile = "C:\Users\user\source\repos\clipmap\scripts\tile-work\test_extract.shp"

# Clean up previous test
Remove-Item "$shpFile*" -ErrorAction SilentlyContinue

# Try simpler query first
$sql = "SELECT * FROM multipolygons WHERE natural='water'"
Write-Host "SQL: $sql"

$result = & ogr2ogr -f "ESRI Shapefile" $shpFile $pbfFile -sql $sql 2>&1
Write-Host "Exit code: $LASTEXITCODE"
Write-Host "Result: $result"

if (Test-Path $shpFile) {
    Write-Host "SUCCESS: Output file created"
    Get-Item $shpFile
} else {
    Write-Host "No output file (empty result or error)"
}
