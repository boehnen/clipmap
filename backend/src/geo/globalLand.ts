// backend/src/geo/globalLand.ts
import fs from "fs";
import path from "path";
import * as polygonClipping from "polygon-clipping";
import { lonLatToWebMercator } from "../geo/projection";
import { douglasPeucker, Point } from "../geo/simplify";
import { ProjectedFeature, DetailLevel } from "../types";
import { logger } from "../logger";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

interface GeoJSONGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: any;
}

interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONGeometry | null;
}

interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

// ---------------------
// Tiling configuration
// ---------------------

// Tile size in degrees. Smaller = more tiles but less complexity per tile
// Options: 10 (coarse), 5 (medium), 2 (fine), 1 (very fine)
// Must match the grid you created in QGIS
// Smaller tiles = less simplification needed = more detail preserved
const TILE_SIZE_DEG = 5; // TODO: Consider 5° or 2° for better detail preservation
// Use process.cwd() to find data directory regardless of where compiled code is located
// In production: data is at /app/src/data/base/land-tiles
// In development: data is at <project>/backend/src/data/base/land-tiles
const LAND_TILES_DIR = path.join(
  process.cwd(),
  "src",
  "data",
  "base",
  "land-tiles"
);

// No cache - tiles are loaded fresh for each request
// Since we process requests sequentially (queue) and clear cache after each request,
// caching provides no benefit and wastes memory

// Maximum points per ring before simplification to prevent polygon-clipping issues
const MAX_POINTS_PER_RING = 5000;

function tileStart(value: number): number {
  // e.g. for 10° tiles:  -73 → -80, 12 → 10, etc.
  return Math.floor(value / TILE_SIZE_DEG) * TILE_SIZE_DEG;
}

function getTileIdsForBBox(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number
): string[] {
  const startLon = tileStart(minLon);
  const endLon = tileStart(maxLon - 1e-9);
  const startLat = tileStart(minLat);
  const endLat = tileStart(maxLat - 1e-9);

  const ids: string[] = [];

  for (let lat = startLat; lat <= endLat; lat += TILE_SIZE_DEG) {
    for (let lon = startLon; lon <= endLon; lon += TILE_SIZE_DEG) {
      ids.push(`${lon}_${lat}`); // must match your tile_id / filenames
    }
  }


  return ids;
}

function loadLandTileMercator(tileId: string): MultiPolygon | null {
  const filePath = path.join(LAND_TILES_DIR, `${tileId}.geojson`);
  if (!fs.existsSync(filePath)) {
    logger.warn("base_tile_missing", { tileId });
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const fc = JSON.parse(raw) as GeoJSONFeatureCollection;

  const mp: MultiPolygon = [];

  for (const feat of fc.features) {
    if (!feat.geometry) continue;
    const geom = feat.geometry;

    if (geom.type === "Polygon") {
      const poly: Polygon = geom.coordinates.map((ring: number[][]) =>
        ring.map(([lon, lat]) =>
          lonLatToWebMercator(lon, lat) as [number, number]
        )
      );
      mp.push(poly);
    } else if (geom.type === "MultiPolygon") {
      for (const polyCoords of geom.coordinates as number[][][][]) {
        const poly: Polygon = polyCoords.map((ring: number[][]) =>
          ring.map(([lon, lat]) =>
            lonLatToWebMercator(lon, lat) as [number, number]
          )
        );
        mp.push(poly);
      }
    }
  }
  
  return mp.length ? mp : null;
}

function ensureClosed(r: Ring): Ring {
  if (r.length < 3) return r;
  const [x0, y0] = r[0];
  const [xN, yN] = r[r.length - 1];
  if (Math.abs(x0 - xN) < 1e-6 && Math.abs(y0 - yN) < 1e-6) return r;
  return [...r, [x0, y0]];
}

// ---------------------
// Geometry simplification (to keep polygon-clipping sane)
// ---------------------

function simplifyRing(ring: Ring, epsilon: number, skipSimplification: boolean = false): Ring {
  if (ring.length <= 4) return ring;
  
  // If simplification is disabled, only ensure closed, don't simplify
  if (skipSimplification || epsilon <= 1e-10) {
    const [x0, y0] = ring[0];
    const [xN, yN] = ring[ring.length - 1];
    if (Math.abs(x0 - xN) > 1e-6 || Math.abs(y0 - yN) > 1e-6) {
      return [...ring, [x0, y0]] as Ring;
    }
    return ring;
  }
  
  // Safety: if ring is too large, aggressively simplify first
  if (ring.length > MAX_POINTS_PER_RING) {
    const safetyEpsilon = epsilon * 10;
    ring = douglasPeucker(ring, safetyEpsilon);
    const [x0, y0] = ring[0];
    const [xN, yN] = ring[ring.length - 1];
    if (Math.abs(x0 - xN) > 1e-6 || Math.abs(y0 - yN) > 1e-6) {
      ring.push([x0, y0]);
    }
    // If still too large, simplify again
    if (ring.length > MAX_POINTS_PER_RING) {
      ring = douglasPeucker(ring, epsilon);
    }
  } else {
    ring = douglasPeucker(ring, epsilon);
  }
  
  const [x0, y0] = ring[0];
  const [xN, yN] = ring[ring.length - 1];
  if (Math.abs(x0 - xN) > 1e-6 || Math.abs(y0 - yN) > 1e-6) {
    ring.push([x0, y0]);
  }
  return ring as Ring;
}

function simplifyMultiPolygon(mp: MultiPolygon, epsilon: number, skipSimplification: boolean = false): MultiPolygon {
  if (skipSimplification || epsilon <= 1e-10) {
    // No simplification, just ensure rings are closed
    return mp.map((poly) =>
      poly.map((ring) => ensureClosed(ring))
    );
  }
  return mp.map((poly) =>
    poly.map((ring) => simplifyRing(ensureClosed(ring), epsilon, skipSimplification))
  );
}

// ---------------------
// Public API
// ---------------------

/**
 * Build "base water" for this bbox from tiled global land polygons:
 *   1. Load all land tiles overlapping the bbox (WebMercator).
 *   2. Clip each tile to bbox and simplify it.
 *   3. baseWater = bbox − (sum of clipped land tiles), done iteratively.
 * Return as ProjectedFeature[] with coords already in Web Mercator.
 */
export function getBaseWaterFeaturesForBBox(
  bboxLatLon: { minLat: number; minLon: number; maxLat: number; maxLon: number },
  bboxMercator: { minx: number; maxx: number; miny: number; maxy: number },
  detail: DetailLevel = "medium"
): ProjectedFeature[] {
  const { minLat, minLon, maxLat, maxLon } = bboxLatLon;
  const { minx, maxx, miny, maxy } = bboxMercator;

  const tileIds = getTileIdsForBBox(minLat, minLon, maxLat, maxLon);

  // BBox in WebMercator
  const bboxRing: Ring = ensureClosed([
    [minx, miny],
    [maxx, miny],
    [maxx, maxy],
    [minx, maxy],
  ]);
  const bboxMP: MultiPolygon = [[bboxRing]];

  // Simplification strategy: ONLY for safety (prevent polygon-clipping failures)
  // NOT for file size - that's handled in rendering stage with file-size-driven approach
  // Only simplify rings that are too large for polygon-clipping to handle safely
  const spanX = maxx - minx;
  const spanY = maxy - miny;
  const span = Math.max(spanX, spanY) || 1;
  
  // Safety epsilon: only used for rings > MAX_POINTS_PER_RING
  // Use a very small epsilon - just enough to prevent clipping failures
  // This is NOT for file size, just for computational safety
  const safetyEpsilon = span / 500000; // Very conservative - only for safety

  // Process tiles one at a time to minimize memory usage
  // Don't store all clipped pieces in memory - process immediately
  let waterMP: MultiPolygon = bboxMP;

  for (const id of tileIds) {
    // Load tile - only pre-simplify if it would be too complex for polygon operations
    const tileMp = loadLandTileMercator(id);
    if (!tileMp || !tileMp.length) {
      logger.warn("tile_empty_or_missing", { tileId: id });
      continue;
    }
    
    // Immediately simplify large tiles to reduce memory usage
    // More aggressive simplification for memory-constrained environments
    let totalPoints = 0;
    for (const poly of tileMp) {
      for (const ring of poly) {
        totalPoints += ring.length;
      }
    }
    
    // If tile is very large (>100k points), simplify more aggressively
    let preClipped = tileMp;
    if (totalPoints > 100000) {
      // More aggressive simplification for large tiles
      const aggressiveEpsilon = safetyEpsilon * 10;
      preClipped = simplifyMultiPolygon(tileMp, aggressiveEpsilon, false);
    } else if (totalPoints > 50000) {
      preClipped = simplifyMultiPolygon(tileMp, safetyEpsilon * 5, false);
    } else {
      // Check if simplification is needed before clipping
      let needsSimplification = false;
      for (const poly of tileMp) {
        for (const ring of poly) {
          if (ring.length > MAX_POINTS_PER_RING) {
            needsSimplification = true;
            break;
          }
        }
        if (needsSimplification) break;
      }
      
      if (needsSimplification) {
        preClipped = simplifyMultiPolygon(tileMp, safetyEpsilon, false);
      }
    }


    // Clip tile to bbox
    // Try progressively more aggressive simplification if clipping fails
    let clippedRaw: MultiPolygon | null = null;
    let lastError: any = null;
    const simplificationAttempts = [
      { epsilon: 0, name: "none" },
      { epsilon: safetyEpsilon, name: "minimal" },
      { epsilon: safetyEpsilon * 5, name: "moderate" },
      { epsilon: safetyEpsilon * 20, name: "aggressive" },
    ];
    
    for (const attempt of simplificationAttempts) {
      try {
        const toClip = attempt.epsilon > 0 
          ? simplifyMultiPolygon(preClipped, attempt.epsilon, false)
          : preClipped;
        
        clippedRaw = polygonClipping.intersection(
          bboxMP as any,
          toClip as any
        ) as MultiPolygon;
        break; // Success!
      } catch (e: any) {
        lastError = e;
        // Only log if all attempts will fail
        if (attempt === simplificationAttempts[simplificationAttempts.length - 1]) {
          logger.warn("polygon_clip_failed", {
            tileId: id,
            error: e.message,
          });
        }
      }
    }
    
    // If all attempts failed, log error but try to use bbox as fallback
    if (!clippedRaw || !clippedRaw.length) {
      logger.error("tile_clipping_failed_all_attempts", {
        tileId: id,
        error: lastError?.message,
        fallback: "skipping_tile",
      });
      continue; // Skip this tile if we can't clip it
    }

    if (!clippedRaw || !clippedRaw.length) continue;

    // Process this clipped tile immediately - don't store all in memory
    // Subtract from waterMP right away
    if (!waterMP.length) break;
    
    // Simplify waterMP only if it's getting too complex (to prevent infinite loops)
    // More aggressive simplification for memory-constrained environments
    if (waterMP.length > 0) {
      const totalPoints = waterMP.reduce((sum, poly) => 
        sum + poly.reduce((s, ring) => s + ring.length, 0), 0
      );
      // Simplify more aggressively to keep memory usage down
      if (totalPoints > 30000) {
        waterMP = simplifyMultiPolygon(waterMP, safetyEpsilon * 3, false);
      }
    }
    
    let diff: MultiPolygon;
    try {
      diff = polygonClipping.difference(
        waterMP as any,
        clippedRaw as any
      ) as MultiPolygon;
    } catch (e: any) {
      logger.warn("polygon_difference_failed", {
        error: e.message,
      });
      // If difference fails, simplify more aggressively and try again
      const simplifiedWater = simplifyMultiPolygon(waterMP, safetyEpsilon * 5, false);
      const simplifiedLand = simplifyMultiPolygon(clippedRaw, safetyEpsilon * 5, false);
      try {
        diff = polygonClipping.difference(
          simplifiedWater as any,
          simplifiedLand as any
        ) as MultiPolygon;
      } catch (e2: any) {
        logger.error("polygon_difference_failed_retry", {
          error: e2.message,
        });
        // Skip this land piece if we can't subtract it
        continue;
      }
    }

    if (!diff || !diff.length) {
      waterMP = [];
      break;
    }
    waterMP = diff;
  }

  const features: ProjectedFeature[] = [];

  for (const poly of waterMP) {
    if (!poly.length) continue;
    const [outer, ...inners] = poly;

    if (outer && outer.length >= 3) {
      features.push({
        coords: outer,
        tags: {},
        role: "outer",
      });
    }

    for (const inner of inners) {
      if (inner.length < 3) continue;
      features.push({
        coords: inner,
        tags: {},
        role: "inner",
      });
    }
  }

  return features;
}
