// shared/mapConfig.ts

export type DetailLevel = "fine" | "medium" | "coarse";

export interface LatLonBBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

// Breakpoints for detail levels (in normalized degrees)
export const DETAIL_FINE_MAX_DEG = 1.0;
export const DETAIL_MEDIUM_MAX_DEG = 5.0;

// Absolute maximum normalized extent allowed (in degrees)
export const EXTENT_MAX_DEG = 4.0;

// --- Helpers ---

// Accept either your LatLonBBox shape or [minLat, minLon, maxLat, maxLon]
type BBoxLike = LatLonBBox | [number, number, number, number];

function unpackBBox(bbox: BBoxLike): LatLonBBox {
  if (Array.isArray(bbox)) {
    const [minLat, minLon, maxLat, maxLon] = bbox;
    return { minLat, minLon, maxLat, maxLon };
  }
  return bbox;
}

export function computeNormalizedSpanDeg(bbox: BBoxLike): number {
  const { minLat, minLon, maxLat, maxLon } = unpackBBox(bbox);

  const latSpan = Math.abs(maxLat - minLat);
  const lonSpan = Math.abs(maxLon - minLon);
  const latMid = (maxLat + minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;

  // same formula everywhere (frontend/backend)
  return Math.max(latSpan, Math.abs(lonSpan * Math.cos(latMidRad)));
}

export function computeDetailLevelFromSpan(spanDeg: number): DetailLevel {
  if (spanDeg <= DETAIL_FINE_MAX_DEG) return "fine";
  if (spanDeg <= DETAIL_MEDIUM_MAX_DEG) return "medium";
  return "coarse";
}

export function computeDetailLevelFromBBox(bbox: BBoxLike): DetailLevel {
  const span = computeNormalizedSpanDeg(bbox);
  return computeDetailLevelFromSpan(span);
}

export function isExtentTooLarge(bbox: BBoxLike): boolean {
  return computeNormalizedSpanDeg(bbox) > EXTENT_MAX_DEG;
}
