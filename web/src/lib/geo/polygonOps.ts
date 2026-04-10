/**
 * Polygon operations using polygon-clipping library.
 * Handles union, difference, intersection for water/land processing.
 */

import polygonClipping from "polygon-clipping";

export type Ring = [number, number][];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface BBoxMercator {
  minx: number;
  maxx: number;
  miny: number;
  maxy: number;
}

/**
 * Ensure a ring is closed (first point === last point).
 */
export function ensureClosed(ring: Ring): Ring {
  if (ring.length < 3) return ring;
  const [x0, y0] = ring[0];
  const [xN, yN] = ring[ring.length - 1];
  if (Math.abs(x0 - xN) < 1e-6 && Math.abs(y0 - yN) < 1e-6) return ring;
  return [...ring, [x0, y0]];
}

/**
 * Convert a bounding box to a MultiPolygon.
 */
export function bboxToMultiPolygon(bbox: BBoxMercator): MultiPolygon {
  const { minx, maxx, miny, maxy } = bbox;
  return [[[
    [minx, miny],
    [maxx, miny],
    [maxx, maxy],
    [minx, maxy],
    [minx, miny],
  ]]];
}

/**
 * Union multiple polygons into a single MultiPolygon.
 */
export function unionPolygons(polygons: Polygon[]): MultiPolygon {
  if (polygons.length === 0) return [];
  if (polygons.length === 1) return [polygons[0]];

  try {
    return polygonClipping.union(polygons[0], ...polygons.slice(1));
  } catch {
    // Fallback: return as separate polygons if union fails
    return polygons;
  }
}

/**
 * Union multiple MultiPolygons.
 */
export function union(...multiPolygons: MultiPolygon[]): MultiPolygon {
  const nonEmpty = multiPolygons.filter(mp => mp.length > 0);
  if (nonEmpty.length === 0) return [];
  if (nonEmpty.length === 1) return nonEmpty[0];

  try {
    return polygonClipping.union(nonEmpty[0], ...nonEmpty.slice(1));
  } catch {
    // Fallback: concatenate all polygons
    return nonEmpty.flat();
  }
}

/**
 * Compute difference: a - b
 */
export function difference(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0) return [];
  if (b.length === 0) return a;

  try {
    return polygonClipping.difference(a, b);
  } catch {
    return a; // Return original if difference fails
  }
}

/**
 * Compute intersection: a ∩ b
 */
export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];

  try {
    return polygonClipping.intersection(a, b);
  } catch {
    return a; // Return original if intersection fails
  }
}

/**
 * Clip a MultiPolygon to a bounding box.
 */
export function clipToBbox(mp: MultiPolygon, bbox: BBoxMercator): MultiPolygon {
  if (mp.length === 0) return [];
  return intersection(bboxToMultiPolygon(bbox), mp);
}
