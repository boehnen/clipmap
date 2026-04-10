"""
QGIS Elevation Tile Generator for ClipMap

Generates contour lines and elevation bands from DEM data.
Output can be used for layered physical maps (stacked wood/acrylic).

Data Sources:
  - SRTM 30m: https://dwtkns.com/srtm30m/ (free, registration required)
  - OpenTopography: https://opentopography.org/
  - Mapzen Terrarium: s3://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png

Usage (QGIS Python Console):
  exec(open('path/to/generate_elevation_tiles.py').read())
  generate_elevation_tiles("dem.tif", "./tiles", interval=100)

Requirements:
  - QGIS 3.x with Python bindings
  - DEM raster file (GeoTIFF recommended)
"""

import os
import json
from pathlib import Path

try:
    from qgis.core import (
        QgsApplication,
        QgsRasterLayer,
        QgsVectorLayer,
        QgsRectangle,
        QgsCoordinateReferenceSystem,
        QgsProcessingFeedback,
        QgsFeatureRequest,
        QgsGeometry,
    )
    from qgis import processing
    QGIS_AVAILABLE = True
except ImportError:
    QGIS_AVAILABLE = False
    print("QGIS not available. Run this script from QGIS Python console.")

# Configuration
TILE_SIZE = 1.0  # 1 degree tiles
DEFAULT_INTERVALS = [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000]


def generate_contours(
    dem_path: str,
    output_dir: str,
    interval: float = 100,
    min_elevation: float = 0,
    max_elevation: float = 9000,
) -> str:
    """Generate contour lines from DEM.

    Args:
        dem_path: Path to DEM raster (GeoTIFF)
        output_dir: Output directory
        interval: Contour interval in meters
        min_elevation: Minimum elevation to include
        max_elevation: Maximum elevation to include

    Returns:
        Path to output contour shapefile/GeoJSON
    """
    print(f"\nGenerating contours (interval: {interval}m)...")

    # Load DEM
    dem = QgsRasterLayer(dem_path, "DEM")
    if not dem.isValid():
        print(f"  Error: Could not load DEM from {dem_path}")
        return None

    print(f"  DEM extent: {dem.extent().toString()}")
    print(f"  DEM CRS: {dem.crs().authid()}")

    # Output path
    contour_path = os.path.join(output_dir, f"contours_{int(interval)}m.gpkg")

    # Run GDAL contour via processing
    params = {
        'INPUT': dem_path,
        'BAND': 1,
        'INTERVAL': interval,
        'FIELD_NAME': 'elevation',
        'CREATE_3D': False,
        'IGNORE_NODATA': True,
        'NODATA': -9999,
        'OFFSET': 0,
        'OUTPUT': contour_path,
    }

    result = processing.run("gdal:contour", params, feedback=QgsProcessingFeedback())
    print(f"  Contours saved to: {contour_path}")

    return contour_path


def generate_elevation_bands(
    dem_path: str,
    output_dir: str,
    intervals: list = None,
) -> str:
    """Generate filled elevation bands (polygons) from DEM.

    Each band is a polygon representing an elevation range.
    Perfect for stacked physical maps.

    Args:
        dem_path: Path to DEM raster
        output_dir: Output directory
        intervals: List of elevation breakpoints (e.g., [0, 100, 200, 500, 1000])

    Returns:
        Path to output bands GeoPackage
    """
    if intervals is None:
        intervals = DEFAULT_INTERVALS

    print(f"\nGenerating elevation bands...")
    print(f"  Intervals: {intervals}")

    # Load DEM
    dem = QgsRasterLayer(dem_path, "DEM")
    if not dem.isValid():
        print(f"  Error: Could not load DEM from {dem_path}")
        return None

    bands_dir = os.path.join(output_dir, "elevation_bands")
    os.makedirs(bands_dir, exist_ok=True)

    # Generate each band
    for i in range(len(intervals) - 1):
        min_elev = intervals[i]
        max_elev = intervals[i + 1]
        band_name = f"band_{min_elev}_{max_elev}m"

        print(f"  Generating band: {min_elev}m - {max_elev}m")

        # Reclassify raster to binary (1 = in range, 0 = out)
        # Then polygonize
        band_path = os.path.join(bands_dir, f"{band_name}.gpkg")

        # Use raster calculator to create mask
        expression = f'("{dem_path}@1" >= {min_elev}) AND ("{dem_path}@1" < {max_elev})'

        # Create temporary mask raster
        mask_path = os.path.join(bands_dir, f"_temp_mask_{i}.tif")

        calc_params = {
            'EXPRESSION': f'({expression}) * 1',
            'LAYERS': [dem_path],
            'OUTPUT': mask_path,
        }

        try:
            processing.run("qgis:rastercalculator", calc_params, feedback=QgsProcessingFeedback())

            # Polygonize the mask
            poly_params = {
                'INPUT': mask_path,
                'BAND': 1,
                'FIELD': 'value',
                'EIGHT_CONNECTEDNESS': False,
                'OUTPUT': band_path,
            }

            processing.run("gdal:polygonize", poly_params, feedback=QgsProcessingFeedback())

            # Filter to keep only value=1 polygons
            # Add elevation attributes
            layer = QgsVectorLayer(band_path, band_name, "ogr")
            if layer.isValid():
                # Could filter here, but for now just note it
                print(f"    Saved: {band_path}")

            # Cleanup temp file
            if os.path.exists(mask_path):
                os.remove(mask_path)

        except Exception as e:
            print(f"    Error generating band: {e}")

    return bands_dir


def tile_contours(
    contour_path: str,
    output_dir: str,
    layer_name: str = "contours",
) -> dict:
    """Tile contour lines into 1x1 degree tiles."""
    print(f"\nTiling contours: {contour_path}")

    layer = QgsVectorLayer(contour_path, "contours", "ogr")
    if not layer.isValid():
        print(f"  Error: Could not load {contour_path}")
        return {'tiles': 0, 'features': 0}

    # Get bounds
    extent = layer.extent()
    min_lon = int(extent.xMinimum())
    min_lat = int(extent.yMinimum())
    max_lon = int(extent.xMaximum()) + 1
    max_lat = int(extent.yMaximum()) + 1

    print(f"  Bounds: {min_lon},{min_lat} to {max_lon},{max_lat}")

    # Create output directory
    layer_dir = os.path.join(output_dir, layer_name, "0")
    os.makedirs(layer_dir, exist_ok=True)

    tile_count = 0
    feature_count = 0

    for lon in range(min_lon, max_lon):
        for lat in range(min_lat, max_lat):
            tile_bounds = QgsRectangle(lon, lat, lon + TILE_SIZE, lat + TILE_SIZE)
            tile_path = os.path.join(layer_dir, f"{lon}_{lat}.geojson")

            # Get features in tile
            request = QgsFeatureRequest()
            request.setFilterRect(tile_bounds)

            features = []
            clip_geom = QgsGeometry.fromRect(tile_bounds)

            for feature in layer.getFeatures(request):
                geom = feature.geometry()
                if geom.isEmpty():
                    continue

                # Clip to tile bounds
                geom = geom.intersection(clip_geom)
                if geom.isEmpty():
                    continue

                geom_json = json.loads(geom.asJson())
                if geom_json is None:
                    continue

                # Get elevation
                elevation = feature['elevation'] if 'elevation' in [f.name() for f in layer.fields()] else None

                features.append({
                    'type': 'Feature',
                    'properties': {
                        'elevation': elevation,
                    },
                    'geometry': geom_json,
                })

            if features:
                geojson = {
                    'type': 'FeatureCollection',
                    'features': features,
                }
                with open(tile_path, 'w') as f:
                    json.dump(geojson, f, separators=(',', ':'))

                tile_count += 1
                feature_count += len(features)

    print(f"  Generated {tile_count} tiles, {feature_count} features")
    return {'tiles': tile_count, 'features': feature_count}


def generate_elevation_tiles(
    dem_path: str,
    output_dir: str,
    interval: float = 100,
    generate_bands: bool = True,
    band_intervals: list = None,
):
    """Main entry point: generate all elevation tiles.

    Args:
        dem_path: Path to DEM raster (GeoTIFF)
        output_dir: Output directory for tiles
        interval: Contour line interval in meters
        generate_bands: If True, also generate filled elevation bands
        band_intervals: Custom intervals for bands (e.g., [0, 100, 200, 500])
    """
    print("=" * 50)
    print("Elevation Tile Generator")
    print("=" * 50)
    print(f"DEM: {dem_path}")
    print(f"Output: {output_dir}")
    print(f"Contour interval: {interval}m")

    if not os.path.exists(dem_path):
        print(f"Error: DEM file not found: {dem_path}")
        return

    os.makedirs(output_dir, exist_ok=True)

    # Generate contour lines
    contour_path = generate_contours(dem_path, output_dir, interval)

    if contour_path:
        # Tile the contours
        tile_contours(contour_path, output_dir, f"contours_{int(interval)}m")

    # Generate elevation bands
    if generate_bands:
        if band_intervals is None:
            # Default intervals good for most terrain
            band_intervals = [0, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000]

        bands_dir = generate_elevation_bands(dem_path, output_dir, band_intervals)

        # Tile each band
        if bands_dir:
            for band_file in Path(bands_dir).glob("band_*.gpkg"):
                band_name = band_file.stem
                tile_contours(str(band_file), output_dir, band_name)

    print("\n" + "=" * 50)
    print("Done!")
    print("=" * 50)


# Example usage in QGIS console:
# generate_elevation_tiles(
#     "C:/data/srtm_12_04.tif",
#     "C:/output/elevation_tiles",
#     interval=50,
#     generate_bands=True,
#     band_intervals=[0, 100, 200, 300, 500, 1000]
# )
