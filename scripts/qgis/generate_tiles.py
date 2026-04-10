#!/usr/bin/env python3
"""
ClipMap Multi-LOD Tile Generator

Generates GeoJSON tiles at multiple LODs for ClipMap CDN.
Run from QGIS Python Console or as standalone with QGIS Python bindings.

Usage (QGIS Console):
    exec(open('path/to/generate_tiles.py').read())
    generate_all('path/to/data.osm.pbf', 'path/to/water-polygons.shp', 'output/tiles')

Usage (Command Line):
    python generate_tiles.py --pbf data.osm.pbf --water water-polygons.shp --output tiles
"""

import os
import json
import math
from pathlib import Path

# Try to import QGIS - will fail if not in QGIS environment
try:
    from qgis.core import (
        QgsProject, QgsVectorLayer, QgsFeature, QgsGeometry,
        QgsRectangle, QgsCoordinateReferenceSystem, QgsCoordinateTransform,
        QgsVectorFileWriter, QgsField, QgsFields, QgsWkbTypes,
        QgsFeatureRequest, QgsSpatialIndex, QgsJsonExporter
    )
    from qgis.PyQt.QtCore import QVariant
    from qgis import processing
    QGIS_AVAILABLE = True
except ImportError:
    QGIS_AVAILABLE = False
    print("QGIS not available - run from QGIS Python Console")


# =============================================================================
# LAYER CONFIGURATION
# =============================================================================

# Simplification tolerances (proven values from existing water tiles)
# These are in degrees (EPSG:4326)
# At equator: 0.00008° ≈ 9m, 0.0002° ≈ 22m, 0.0005° ≈ 55m
SIMPLIFY_TOLERANCES = {
    '1deg': 0,         # Full detail
    '5deg': 0.00008,   # Light simplification (~9m at equator)
    '10deg': 0.0002,   # Medium simplification (~22m at equator)
    '20deg': 0.0005,   # Heavy simplification (~55m at equator)
    'world': 0.001,    # World file (~111m at equator)
}

# Minimum area filtering (in square degrees)
# CRITICAL for file size - removes small islands/polygons
# Based on backend featureFilter.ts approach: min_area = tile_area * fraction
# Rough conversion: 1 deg² ≈ 12,100 km² at equator
#                   0.001 deg² ≈ 12 km² at equator
#                   0.0001 deg² ≈ 1.2 km² at equator
#                   0.00001 deg² ≈ 0.12 km² at equator
MIN_AREA_DEG2 = {
    '1deg': 0,           # Full detail - keep all
    '5deg': 0.00001,     # ~0.12 km² - remove tiny islands
    '10deg': 0.0001,     # ~1.2 km² - remove small islands
    '20deg': 0.001,      # ~12 km² - keep only significant features
    'world': 0.01,       # ~120 km² - only major features
}

LAYERS = {
    'water': {
        'source': 'water_polygons',  # Use pre-processed water polygons
        'geometry': 'Polygon',
        'lods': [
            {'folder': '1deg', 'tile_size': 1, 'simplify': SIMPLIFY_TOLERANCES['1deg'],
             'min_area': MIN_AREA_DEG2['1deg']},
            {'folder': '5deg', 'tile_size': 5, 'simplify': SIMPLIFY_TOLERANCES['5deg'],
             'min_area': MIN_AREA_DEG2['5deg']},
            {'folder': '10deg', 'tile_size': 10, 'simplify': SIMPLIFY_TOLERANCES['10deg'],
             'min_area': MIN_AREA_DEG2['10deg']},
            {'folder': '20deg', 'tile_size': 20, 'simplify': SIMPLIFY_TOLERANCES['20deg'],
             'min_area': MIN_AREA_DEG2['20deg']},
        ],
        'world_file': True,
        'world_simplify': SIMPLIFY_TOLERANCES['world'],
        'world_min_area': MIN_AREA_DEG2['world'],
    },
    'roads': {
        'source': 'pbf',
        'osm_layer': 'lines',
        'geometry': 'LineString',
        'base_filter': '"highway" IS NOT NULL',
        'properties': ['highway', 'name', 'ref'],
        'lods': [
            {'folder': '1deg', 'tile_size': 1, 'simplify': SIMPLIFY_TOLERANCES['1deg'], 'filter': None},
            {'folder': '5deg', 'tile_size': 5, 'simplify': SIMPLIFY_TOLERANCES['5deg'],
             'filter': '"highway" IN (\'motorway\', \'trunk\', \'primary\', \'secondary\', \'tertiary\')'},
            {'folder': '10deg', 'tile_size': 10, 'simplify': SIMPLIFY_TOLERANCES['10deg'],
             'filter': '"highway" IN (\'motorway\', \'trunk\', \'primary\')'},
        ],
    },
    'parks': {
        'source': 'pbf',
        'osm_layer': 'multipolygons',
        'geometry': 'Polygon',
        'base_filter': '''
            "leisure" IN ('park', 'garden', 'nature_reserve') OR
            "landuse" IN ('forest', 'grass', 'meadow', 'recreation_ground') OR
            "natural" = 'wood' OR
            "boundary" = 'national_park'
        ''',
        'properties': ['name', 'leisure', 'landuse'],
        'clip_to_land': True,  # Remove water overlap
        'lods': [
            {'folder': '1deg', 'tile_size': 1, 'simplify': SIMPLIFY_TOLERANCES['1deg']},
            {'folder': '5deg', 'tile_size': 5, 'simplify': SIMPLIFY_TOLERANCES['5deg'], 'min_area': 10000000},   # >10 km²
            {'folder': '10deg', 'tile_size': 10, 'simplify': SIMPLIFY_TOLERANCES['10deg'], 'min_area': 100000000}, # >100 km²
        ],
    },
    'railways': {
        'source': 'pbf',
        'osm_layer': 'lines',
        'geometry': 'LineString',
        'base_filter': '"railway" IN (\'rail\', \'subway\', \'light_rail\', \'tram\', \'monorail\')',
        'properties': ['railway', 'name'],
        'lods': [
            {'folder': '1deg', 'tile_size': 1, 'simplify': SIMPLIFY_TOLERANCES['1deg']},
            {'folder': '5deg', 'tile_size': 5, 'simplify': SIMPLIFY_TOLERANCES['5deg'],
             'filter': '"railway" IN (\'rail\', \'subway\')'},
            {'folder': '10deg', 'tile_size': 10, 'simplify': SIMPLIFY_TOLERANCES['10deg'],
             'filter': '"railway" = \'rail\''},
        ],
    },
    'ferries': {
        'source': 'pbf',
        'osm_layer': 'lines',
        'geometry': 'LineString',
        'base_filter': '"route" = \'ferry\'',
        'properties': ['name', 'ref'],
        'lods': [
            {'folder': '1deg', 'tile_size': 1, 'simplify': SIMPLIFY_TOLERANCES['1deg']},
            {'folder': '5deg', 'tile_size': 5, 'simplify': SIMPLIFY_TOLERANCES['5deg']},
        ],
    },
    'boundaries': {
        'source': 'pbf',
        'osm_layer': 'lines',
        'geometry': 'LineString',
        'base_filter': '"boundary" = \'administrative\'',
        'properties': ['name', 'admin_level'],
        'lods': [
            {'folder': '1deg', 'tile_size': 1, 'simplify': SIMPLIFY_TOLERANCES['1deg']},
            {'folder': '5deg', 'tile_size': 5, 'simplify': SIMPLIFY_TOLERANCES['5deg'],
             'filter': '"admin_level" IN (\'2\', \'3\', \'4\', \'5\', \'6\')'},
            {'folder': '10deg', 'tile_size': 10, 'simplify': SIMPLIFY_TOLERANCES['10deg'],
             'filter': '"admin_level" IN (\'2\', \'3\', \'4\')'},
        ],
        'world_file': True,
        'world_filter': '"admin_level" = \'2\'',
        'world_simplify': SIMPLIFY_TOLERANCES['world'],
    },
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def tile_start(value, tile_size):
    """Snap coordinate to tile grid."""
    return math.floor(value / tile_size) * tile_size


def get_tile_bounds(lon, lat, tile_size):
    """Get QgsRectangle for a tile."""
    return QgsRectangle(lon, lat, lon + tile_size, lat + tile_size)


def ensure_dir(path):
    """Create directory if it doesn't exist."""
    Path(path).mkdir(parents=True, exist_ok=True)


def simplify_geometry(geom, tolerance):
    """Simplify geometry using Douglas-Peucker."""
    if tolerance <= 0:
        return geom
    return geom.simplify(tolerance)


def features_to_geojson(features, properties_to_keep=None):
    """Convert list of features to GeoJSON dict."""
    geojson_features = []

    for feat in features:
        geom = feat.geometry()
        if geom.isEmpty():
            continue

        # Convert geometry to GeoJSON
        geom_json = json.loads(geom.asJson())

        # Extract properties
        props = {}
        if properties_to_keep:
            for prop in properties_to_keep:
                val = feat.attribute(prop)
                if val is not None and val != '':
                    props[prop] = val

        geojson_features.append({
            'type': 'Feature',
            'geometry': geom_json,
            'properties': props
        })

    return {
        'type': 'FeatureCollection',
        'features': geojson_features
    }


def write_geojson(features, output_path, properties_to_keep=None):
    """Write features to GeoJSON file."""
    geojson = features_to_geojson(features, properties_to_keep)

    # Only write if there are features
    if len(geojson['features']) == 0:
        return 0

    with open(output_path, 'w') as f:
        json.dump(geojson, f, separators=(',', ':'))  # Compact JSON

    return len(geojson['features'])


# =============================================================================
# TILE GENERATION
# =============================================================================

def simplify_layer_qgis(layer, tolerance):
    """
    Simplify entire layer using QGIS processing.
    This ensures consistent simplification across tile boundaries.
    """
    if tolerance <= 0:
        return layer

    result = processing.run("native:simplifygeometries", {
        'INPUT': layer,
        'METHOD': 0,  # Douglas-Peucker
        'TOLERANCE': tolerance,
        'OUTPUT': 'TEMPORARY_OUTPUT'
    })
    return result['OUTPUT']


def filter_layer_qgis(layer, expression):
    """Apply filter expression to layer."""
    if not expression or not expression.strip():
        return layer

    result = processing.run("native:extractbyexpression", {
        'INPUT': layer,
        'EXPRESSION': expression.strip(),
        'OUTPUT': 'TEMPORARY_OUTPUT'
    })
    return result['OUTPUT']


def generate_layer_tiles(
    layer,
    layer_config,
    output_dir,
    bounds=None,
    water_layer=None
):
    """
    Generate tiles for a single layer at all LODs.

    Strategy: Simplify ENTIRE layer first, then clip to tiles.
    This ensures consistent simplification and seamless tile edges.

    Args:
        layer: QgsVectorLayer to tile
        layer_config: Configuration dict from LAYERS
        output_dir: Base output directory
        bounds: Optional (min_lon, min_lat, max_lon, max_lat) to limit processing
        water_layer: Optional water layer for clip_to_land
    """
    layer_name = layer_config.get('name', 'unknown')
    properties = layer_config.get('properties', [])
    clip_to_land = layer_config.get('clip_to_land', False)
    base_filter = layer_config.get('base_filter', '')

    print(f"\n{'='*60}")
    print(f"Processing layer: {layer_name}")
    print(f"{'='*60}")

    # Build water spatial index if needed
    water_index = None
    if clip_to_land and water_layer:
        print("Building water spatial index...")
        water_index = QgsSpatialIndex(water_layer.getFeatures())

    # Process each LOD
    for lod in layer_config['lods']:
        folder = lod['folder']
        tile_size = lod['tile_size']
        simplify_tolerance = lod.get('simplify', 0)
        lod_filter = lod.get('filter')
        min_area = lod.get('min_area', 0)

        lod_dir = os.path.join(output_dir, layer_name, folder)
        ensure_dir(lod_dir)

        min_area_info = f", min_area={min_area}" if min_area > 0 else ""
        print(f"\n  LOD: {folder} (tile_size={tile_size}°, simplify={simplify_tolerance}{min_area_info})")

        # ===== STEP 1: Apply filters to source layer =====
        work_layer = layer

        # Apply base + LOD-specific filters
        combined_filter = base_filter
        if lod_filter:
            if combined_filter:
                combined_filter = f"({combined_filter}) AND ({lod_filter})"
            else:
                combined_filter = lod_filter

        if combined_filter:
            print(f"    Applying filter...")
            work_layer = filter_layer_qgis(work_layer, combined_filter)
            print(f"    Filtered to {work_layer.featureCount()} features")

        # ===== STEP 2: Simplify ENTIRE layer (key for seamless tiles) =====
        if simplify_tolerance > 0:
            print(f"    Simplifying entire layer (tolerance={simplify_tolerance})...")
            work_layer = simplify_layer_qgis(work_layer, simplify_tolerance)
            print(f"    Simplified to {work_layer.featureCount()} features")

        # ===== STEP 3: Clip to tiles =====
        # Determine bounds
        if bounds:
            min_lon, min_lat, max_lon, max_lat = bounds
        else:
            extent = work_layer.extent()
            min_lon, min_lat = extent.xMinimum(), extent.yMinimum()
            max_lon, max_lat = extent.xMaximum(), extent.yMaximum()

        # Snap to tile grid
        start_lon = tile_start(min_lon, tile_size)
        start_lat = tile_start(min_lat, tile_size)
        end_lon = tile_start(max_lon, tile_size)
        end_lat = tile_start(max_lat, tile_size)

        total_tiles = int(((end_lon - start_lon) / tile_size + 1) * ((end_lat - start_lat) / tile_size + 1))
        processed = 0
        tiles_with_data = 0

        print(f"    Generating {total_tiles} tiles...")

        # Process tiles
        lat = start_lat
        while lat <= end_lat:
            lon = start_lon
            while lon <= end_lon:
                processed += 1

                tile_bounds = get_tile_bounds(lon, lat, tile_size)

                # Create request with spatial filter
                request = QgsFeatureRequest()
                request.setFilterRect(tile_bounds)

                # Collect features
                features = []
                for feat in work_layer.getFeatures(request):
                    geom = feat.geometry()

                    # Skip small features if min_area specified
                    if min_area > 0 and geom.area() < min_area:
                        continue

                    # Clip to tile bounds
                    tile_geom = QgsGeometry.fromRect(tile_bounds)
                    clipped = geom.intersection(tile_geom)

                    if clipped.isEmpty():
                        continue

                    # Clip to land (remove water) if needed
                    if clip_to_land and water_index and water_layer:
                        # Find intersecting water features
                        water_ids = water_index.intersects(clipped.boundingBox())
                        for wid in water_ids:
                            water_feat = water_layer.getFeature(wid)
                            water_geom = water_feat.geometry()
                            clipped = clipped.difference(water_geom)
                            if clipped.isEmpty():
                                break

                    if clipped.isEmpty():
                        continue

                    # Create output feature
                    out_feat = QgsFeature()
                    out_feat.setGeometry(clipped)
                    out_feat.setAttributes(feat.attributes())
                    features.append(out_feat)

                # Write tile
                if features:
                    tile_path = os.path.join(lod_dir, f"{int(lon)}_{int(lat)}.json")
                    count = write_geojson(features, tile_path, properties)
                    if count > 0:
                        tiles_with_data += 1

                # Progress
                if processed % 100 == 0:
                    print(f"    Progress: {processed}/{total_tiles} tiles, {tiles_with_data} with data")

                lon += tile_size
            lat += tile_size

        print(f"    Complete: {tiles_with_data} tiles with data")


def generate_world_file(layer, layer_config, output_dir):
    """Generate simplified world-scale file for a layer."""
    layer_name = layer_config.get('name', 'unknown')

    if not layer_config.get('world_file'):
        return

    print(f"\n  Generating world file for {layer_name}...")

    world_dir = os.path.join(output_dir, layer_name)
    ensure_dir(world_dir)
    world_path = os.path.join(world_dir, 'world.json')

    simplify_tolerance = layer_config.get('world_simplify', SIMPLIFY_TOLERANCES['world'])
    min_area = layer_config.get('world_min_area', MIN_AREA_DEG2['world'])
    world_filter = layer_config.get('world_filter')
    base_filter = layer_config.get('base_filter', '')
    properties = layer_config.get('properties', [])

    # Combine filters
    combined_filter = base_filter
    if world_filter:
        if combined_filter:
            combined_filter = f"({combined_filter}) AND ({world_filter})"
        else:
            combined_filter = world_filter

    # Apply filter if any
    work_layer = layer
    if combined_filter:
        print(f"    Filtering...")
        work_layer = filter_layer_qgis(work_layer, combined_filter)

    # Simplify entire layer (ensures consistent simplification)
    if simplify_tolerance > 0:
        print(f"    Simplifying (tolerance={simplify_tolerance})...")
        work_layer = simplify_layer_qgis(work_layer, simplify_tolerance)

    # Export to GeoJSON with min_area filtering
    features = []
    skipped_small = 0
    for feat in work_layer.getFeatures():
        geom = feat.geometry()
        if geom.isEmpty():
            continue

        # Filter small features (critical for file size!)
        if min_area > 0 and geom.area() < min_area:
            skipped_small += 1
            continue

        out_feat = QgsFeature()
        out_feat.setGeometry(geom)
        out_feat.setAttributes(feat.attributes())
        features.append(out_feat)

    count = write_geojson(features, world_path, properties)
    print(f"    World file: {count} features (skipped {skipped_small} small)")


# =============================================================================
# MAIN FUNCTIONS
# =============================================================================

def load_pbf_layer(pbf_path, osm_layer_name):
    """Load a specific layer from OSM PBF file."""
    uri = f"{pbf_path}|layername={osm_layer_name}"
    layer = QgsVectorLayer(uri, osm_layer_name, "ogr")
    if not layer.isValid():
        raise ValueError(f"Failed to load {osm_layer_name} from {pbf_path}")
    return layer


def load_water_polygons(shp_path):
    """Load water polygons shapefile."""
    layer = QgsVectorLayer(shp_path, "water_polygons", "ogr")
    if not layer.isValid():
        raise ValueError(f"Failed to load water polygons from {shp_path}")
    return layer


def generate_all(pbf_path, water_polygons_path, output_dir, bounds=None):
    """
    Generate all tiles for all layers.

    Args:
        pbf_path: Path to OSM PBF file
        water_polygons_path: Path to water polygons shapefile
        output_dir: Output directory for tiles
        bounds: Optional (min_lon, min_lat, max_lon, max_lat)
    """
    if not QGIS_AVAILABLE:
        print("ERROR: Must run from QGIS Python Console")
        return

    print("="*60)
    print("ClipMap Tile Generator")
    print("="*60)
    print(f"PBF: {pbf_path}")
    print(f"Water: {water_polygons_path}")
    print(f"Output: {output_dir}")
    if bounds:
        print(f"Bounds: {bounds}")
    print()

    ensure_dir(output_dir)

    # Load water polygons (used for water tiles and clip_to_land)
    print("Loading water polygons...")
    water_layer = load_water_polygons(water_polygons_path)
    print(f"  {water_layer.featureCount()} water features")

    # Process each layer
    for layer_name, config in LAYERS.items():
        config['name'] = layer_name

        if config['source'] == 'water_polygons':
            # Use water polygons layer
            generate_world_file(water_layer, config, output_dir)
            generate_layer_tiles(water_layer, config, output_dir, bounds)

        elif config['source'] == 'pbf':
            # Load from PBF
            osm_layer_name = config['osm_layer']
            print(f"\nLoading {osm_layer_name} from PBF...")
            layer = load_pbf_layer(pbf_path, osm_layer_name)
            print(f"  {layer.featureCount()} features")

            # Note: base_filter is applied per-LOD in generate_layer_tiles
            # for better performance (combined with LOD-specific filters)

            generate_world_file(layer, config, output_dir)
            generate_layer_tiles(
                layer, config, output_dir, bounds,
                water_layer=water_layer if config.get('clip_to_land') else None
            )

    print("\n" + "="*60)
    print("COMPLETE")
    print("="*60)
    print(f"\nTiles written to: {output_dir}")
    print("\nNext steps:")
    print("  1. Review tiles in QGIS")
    print("  2. Run: npm run upload-tiles -- --input ./tiles")


def generate_water_only(water_polygons_path, output_dir, bounds=None):
    """Generate only water tiles (useful for testing)."""
    if not QGIS_AVAILABLE:
        print("ERROR: Must run from QGIS Python Console")
        return

    print("Generating water tiles only...")
    water_layer = load_water_polygons(water_polygons_path)

    config = LAYERS['water'].copy()
    config['name'] = 'water'

    generate_world_file(water_layer, config, output_dir)
    generate_layer_tiles(water_layer, config, output_dir, bounds)


def generate_roads_only(pbf_path, output_dir, bounds=None):
    """Generate only road tiles (useful for testing)."""
    if not QGIS_AVAILABLE:
        print("ERROR: Must run from QGIS Python Console")
        return

    print("Generating road tiles only...")
    layer = load_pbf_layer(pbf_path, 'lines')

    config = LAYERS['roads'].copy()
    config['name'] = 'roads'

    base_filter = config.get('base_filter')
    if base_filter:
        layer.setSubsetString(base_filter)

    generate_layer_tiles(layer, config, output_dir, bounds)


def tile_simple(source_path, output_dir, tile_size, layer_name='water', bounds=None):
    """
    Simple tiling of a pre-processed shapefile/GeoJSON.

    Use this when mapshaper has already done filtering and simplification.
    This function ONLY clips to tiles - no additional processing.

    Args:
        source_path: Path to pre-processed shapefile (e.g., water_source_5deg.shp)
        output_dir: Output directory (tiles will go to output_dir/layer_name/Ndeg/)
        tile_size: Tile size in degrees (1, 5, 10, or 20)
        layer_name: Layer name for output folder (default: 'water')
        bounds: Optional (min_lon, min_lat, max_lon, max_lat)

    Usage:
        # After running mapshaper to create water_source_5deg.shp:
        tile_simple('water_source_5deg.shp', 'tiles', 5, 'water')
        tile_simple('water_source_10deg.shp', 'tiles', 10, 'water')
    """
    if not QGIS_AVAILABLE:
        print("ERROR: Must run from QGIS Python Console")
        return

    print(f"Tiling {source_path} -> {tile_size}° tiles")

    # Load layer
    layer = QgsVectorLayer(source_path, "source", "ogr")
    if not layer.isValid():
        raise ValueError(f"Failed to load {source_path}")
    print(f"  Loaded {layer.featureCount()} features")

    # Output directory
    folder = f"{tile_size}deg"
    lod_dir = os.path.join(output_dir, layer_name, folder)
    ensure_dir(lod_dir)

    # Determine bounds
    if bounds:
        min_lon, min_lat, max_lon, max_lat = bounds
    else:
        extent = layer.extent()
        min_lon, min_lat = extent.xMinimum(), extent.yMinimum()
        max_lon, max_lat = extent.xMaximum(), extent.yMaximum()

    # Snap to tile grid
    start_lon = tile_start(min_lon, tile_size)
    start_lat = tile_start(min_lat, tile_size)
    end_lon = tile_start(max_lon, tile_size)
    end_lat = tile_start(max_lat, tile_size)

    total_tiles = int(((end_lon - start_lon) / tile_size + 1) * ((end_lat - start_lat) / tile_size + 1))
    processed = 0
    tiles_with_data = 0

    print(f"  Generating {total_tiles} tiles...")

    # Process tiles
    lat = start_lat
    while lat <= end_lat:
        lon = start_lon
        while lon <= end_lon:
            processed += 1

            tile_bounds = get_tile_bounds(lon, lat, tile_size)
            request = QgsFeatureRequest()
            request.setFilterRect(tile_bounds)

            # Collect and clip features
            features = []
            for feat in layer.getFeatures(request):
                geom = feat.geometry()
                tile_geom = QgsGeometry.fromRect(tile_bounds)
                clipped = geom.intersection(tile_geom)

                if clipped.isEmpty():
                    continue

                out_feat = QgsFeature()
                out_feat.setGeometry(clipped)
                features.append(out_feat)

            # Write tile
            if features:
                tile_path = os.path.join(lod_dir, f"{int(lon)}_{int(lat)}.json")
                count = write_geojson(features, tile_path)
                if count > 0:
                    tiles_with_data += 1

            # Progress
            if processed % 100 == 0:
                print(f"    Progress: {processed}/{total_tiles} tiles, {tiles_with_data} with data")

            lon += tile_size
        lat += tile_size

    print(f"  Complete: {tiles_with_data} tiles with data")
    return tiles_with_data


# =============================================================================
# COMMAND LINE
# =============================================================================

if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Generate ClipMap tiles')
    parser.add_argument('--pbf', required=True, help='OSM PBF file')
    parser.add_argument('--water', required=True, help='Water polygons shapefile')
    parser.add_argument('--output', default='./tiles', help='Output directory')
    parser.add_argument('--bounds', type=float, nargs=4,
                        metavar=('MIN_LON', 'MIN_LAT', 'MAX_LON', 'MAX_LAT'),
                        help='Limit to bounds')

    args = parser.parse_args()

    bounds = tuple(args.bounds) if args.bounds else None
    generate_all(args.pbf, args.water, args.output, bounds)
