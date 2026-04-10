# Check for small/empty extracted files

Write-Host "=== Small Water Files (under 2KB) ===" -ForegroundColor Cyan
$smallWater = Get-ChildItem "C:\Users\user\source\repos\clipmap\scripts\tile-work\inland\*.shp" -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -lt 2000 }
if ($smallWater) {
    $smallWater | ForEach-Object { Write-Host "$($_.Name): $($_.Length) bytes" }
} else {
    Write-Host "None found"
}

Write-Host ""
Write-Host "=== Small Roads Files (under 2KB) ===" -ForegroundColor Cyan
$smallRoads = Get-ChildItem "C:\Users\user\source\repos\clipmap\scripts\tile-work\roads\*.shp" -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -lt 2000 }
if ($smallRoads) {
    $smallRoads | ForEach-Object { Write-Host "$($_.Name): $($_.Length) bytes" }
} else {
    Write-Host "None found"
}

Write-Host ""
Write-Host "=== File size summary ===" -ForegroundColor Cyan
Write-Host "Water files:"
$waterStats = Get-ChildItem "C:\Users\user\source\repos\clipmap\scripts\tile-work\inland\*.shp" -ErrorAction SilentlyContinue
Write-Host "  Total: $($waterStats.Count)"
Write-Host "  Under 1KB: $(($waterStats | Where-Object { $_.Length -lt 1000 }).Count)"
Write-Host "  1KB-10KB: $(($waterStats | Where-Object { $_.Length -ge 1000 -and $_.Length -lt 10000 }).Count)"
Write-Host "  10KB-1MB: $(($waterStats | Where-Object { $_.Length -ge 10000 -and $_.Length -lt 1000000 }).Count)"
Write-Host "  Over 1MB: $(($waterStats | Where-Object { $_.Length -ge 1000000 }).Count)"

Write-Host ""
Write-Host "Roads files:"
$roadStats = Get-ChildItem "C:\Users\user\source\repos\clipmap\scripts\tile-work\roads\*.shp" -ErrorAction SilentlyContinue
Write-Host "  Total: $($roadStats.Count)"
Write-Host "  Under 1KB: $(($roadStats | Where-Object { $_.Length -lt 1000 }).Count)"
Write-Host "  1KB-10KB: $(($roadStats | Where-Object { $_.Length -ge 1000 -and $_.Length -lt 10000 }).Count)"
Write-Host "  10KB-1MB: $(($roadStats | Where-Object { $_.Length -ge 10000 -and $_.Length -lt 1000000 }).Count)"
Write-Host "  Over 1MB: $(($roadStats | Where-Object { $_.Length -ge 1000000 }).Count)"
