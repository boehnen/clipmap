#!/usr/bin/env python3
"""
Elevation Index Generator

Generates a JSON index of min/max elevation per 1° tile from DEM data.
This allows client-side elevation range lookups without external API calls.

Usage:
    python generate_elevation_index.py --dem /path/to/dem.tif --output elevation-index.json

DEM Sources:
    - SRTM 30m: https://dwtkns.com/srtm30m/
    - ASTER GDEM: https://asterweb.jpl.nasa.gov/gdem.asp
    - Copernicus DEM: https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model

For global coverage, download SRTM tiles and merge them, or use a pre-merged global DEM.
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

try:
    import numpy as np
    from osgeo import gdal
    gdal.UseExceptions()
except ImportError:
    print("Error: This script requires GDAL and NumPy.")
    print("Install with: pip install gdal numpy")
    print("Or use OSGeo4W/conda for GDAL bindings.")
    sys.exit(1)


def get_tile_key(lon: int, lat: int) -> str:
    """Generate tile key like '-122_37' for a 1° tile."""
    return f"{lon}_{lat}"


def compute_tile_elevation(
    dataset: gdal.Dataset,
    lon: int,
    lat: int,
    tile_size: float = 1.0
) -> Optional[Tuple[float, float]]:
    """
    Compute min/max elevation for a 1° tile.

    Returns None if tile has no valid data (e.g., ocean).
    """
    # Get dataset georeferencing
    gt = dataset.GetGeoTransform()
    inv_gt = gdal.InvGeoTransform(gt)

    # Calculate pixel coordinates for tile bounds
    # Note: lat is the bottom of the tile, lat+1 is the top
    x1, y1 = gdal.ApplyGeoTransform(inv_gt, lon, lat + tile_size)
    x2, y2 = gdal.ApplyGeoTransform(inv_gt, lon + tile_size, lat)

    # Ensure we're within raster bounds
    x1 = max(0, min(int(x1), dataset.RasterXSize - 1))
    x2 = max(0, min(int(x2), dataset.RasterXSize - 1))
    y1 = max(0, min(int(y1), dataset.RasterYSize - 1))
    y2 = max(0, min(int(y2), dataset.RasterYSize - 1))

    # Ensure proper ordering
    if x1 > x2:
        x1, x2 = x2, x1
    if y1 > y2:
        y1, y2 = y2, y1

    width = x2 - x1
    height = y2 - y1

    if width <= 0 or height <= 0:
        return None

    # Read the tile data
    band = dataset.GetRasterBand(1)
    nodata = band.GetNoDataValue()

    try:
        data = band.ReadAsArray(x1, y1, width, height)
    except Exception:
        return None

    if data is None:
        return None

    # Mask nodata values
    if nodata is not None:
        valid_data = data[data != nodata]
    else:
        # Common nodata values for elevation
        valid_data = data[(data > -1000) & (data < 9000)]

    if len(valid_data) == 0:
        return None

    return float(np.min(valid_data)), float(np.max(valid_data))


def generate_elevation_index(
    dem_path: str,
    output_path: str,
    tile_size: float = 1.0,
    bounds: Optional[Tuple[float, float, float, float]] = None
) -> Dict:
    """
    Generate elevation index from DEM file.

    Args:
        dem_path: Path to DEM raster (GeoTIFF, VRT, etc.)
        output_path: Path for output JSON
        tile_size: Size of each tile in degrees (default 1°)
        bounds: Optional (min_lon, min_lat, max_lon, max_lat) to limit processing

    Returns:
        The elevation index dictionary
    """
    print(f"Opening DEM: {dem_path}")
    dataset = gdal.Open(dem_path, gdal.GA_ReadOnly)

    if dataset is None:
        raise RuntimeError(f"Could not open DEM: {dem_path}")

    # Get DEM bounds
    gt = dataset.GetGeoTransform()
    dem_min_lon = gt[0]
    dem_max_lon = gt[0] + gt[1] * dataset.RasterXSize
    dem_max_lat = gt[3]
    dem_min_lat = gt[3] + gt[5] * dataset.RasterYSize

    print(f"DEM bounds: {dem_min_lon:.2f} to {dem_max_lon:.2f} lon, {dem_min_lat:.2f} to {dem_max_lat:.2f} lat")
    print(f"DEM size: {dataset.RasterXSize} x {dataset.RasterYSize} pixels")

    # Determine processing bounds
    if bounds:
        min_lon = max(bounds[0], dem_min_lon)
        min_lat = max(bounds[1], dem_min_lat)
        max_lon = min(bounds[2], dem_max_lon)
        max_lat = min(bounds[3], dem_max_lat)
    else:
        min_lon = dem_min_lon
        min_lat = dem_min_lat
        max_lon = dem_max_lon
        max_lat = dem_max_lat

    # Snap to tile grid
    min_lon = math.floor(min_lon / tile_size) * tile_size
    min_lat = math.floor(min_lat / tile_size) * tile_size
    max_lon = math.ceil(max_lon / tile_size) * tile_size
    max_lat = math.ceil(max_lat / tile_size) * tile_size

    print(f"Processing bounds: {min_lon} to {max_lon} lon, {min_lat} to {max_lat} lat")

    # Calculate total tiles
    n_lon = int((max_lon - min_lon) / tile_size)
    n_lat = int((max_lat - min_lat) / tile_size)
    total_tiles = n_lon * n_lat
    print(f"Processing {total_tiles} tiles ({n_lon} x {n_lat})")

    # Process each tile
    index = {
        "version": 1,
        "resolution": tile_size,
        "bounds": {
            "minLon": min_lon,
            "minLat": min_lat,
            "maxLon": max_lon,
            "maxLat": max_lat
        },
        "tiles": {}
    }

    processed = 0
    valid_tiles = 0

    for lat in range(int(min_lat), int(max_lat), int(tile_size)):
        for lon in range(int(min_lon), int(max_lon), int(tile_size)):
            processed += 1

            if processed % 1000 == 0:
                print(f"Progress: {processed}/{total_tiles} tiles ({valid_tiles} with data)")

            result = compute_tile_elevation(dataset, lon, lat, tile_size)

            if result is not None:
                min_elev, max_elev = result
                key = get_tile_key(lon, lat)
                index["tiles"][key] = {
                    "min": round(min_elev, 1),
                    "max": round(max_elev, 1)
                }
                valid_tiles += 1

    print(f"Completed: {valid_tiles} tiles with elevation data")

    # Write output
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump(index, f, separators=(',', ':'))  # Compact JSON

    # Also write a pretty version for debugging
    pretty_path = output_path.with_suffix('.pretty.json')
    with open(pretty_path, 'w') as f:
        json.dump(index, f, indent=2)

    file_size = output_path.stat().st_size / 1024
    print(f"Written: {output_path} ({file_size:.1f} KB)")
    print(f"Written: {pretty_path} (pretty-printed)")

    return index


def main():
    parser = argparse.ArgumentParser(
        description='Generate elevation index from DEM data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument(
        '--dem', '-d',
        required=True,
        help='Path to DEM raster file (GeoTIFF, VRT, etc.)'
    )
    parser.add_argument(
        '--output', '-o',
        default='elevation-index.json',
        help='Output JSON file path (default: elevation-index.json)'
    )
    parser.add_argument(
        '--tile-size', '-t',
        type=float,
        default=1.0,
        help='Tile size in degrees (default: 1.0)'
    )
    parser.add_argument(
        '--bounds', '-b',
        type=float,
        nargs=4,
        metavar=('MIN_LON', 'MIN_LAT', 'MAX_LON', 'MAX_LAT'),
        help='Limit processing to these bounds'
    )

    args = parser.parse_args()

    if not os.path.exists(args.dem):
        print(f"Error: DEM file not found: {args.dem}")
        sys.exit(1)

    bounds = tuple(args.bounds) if args.bounds else None

    generate_elevation_index(
        dem_path=args.dem,
        output_path=args.output,
        tile_size=args.tile_size,
        bounds=bounds
    )


if __name__ == '__main__':
    main()
