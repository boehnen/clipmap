import { BBox, DetailLevel } from '@/types';

const EARTH_RADIUS_KM = 6371;
const KM_TO_MILES = 0.621371;
const KM2_TO_MI2 = 0.386102;

const DETAIL_THRESHOLDS = {
  fine: 0.2,
  medium: 0.5,
  coarse: 1.0,
  regional: 5.0,
  country: 20.0,
} as const;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateNormalizedSpan(bbox: BBox): number {
  const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
  const lonSpan = Math.abs(bbox.maxLon - bbox.minLon);
  const latMid = (bbox.maxLat + bbox.minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;
  return Math.max(latSpan, Math.abs(lonSpan * Math.cos(latMidRad)));
}

export function getDetailLevel(bbox: BBox): DetailLevel {
  const span = calculateNormalizedSpan(bbox);
  if (span <= DETAIL_THRESHOLDS.fine) return 'fine';
  if (span <= DETAIL_THRESHOLDS.medium) return 'medium';
  if (span <= DETAIL_THRESHOLDS.coarse) return 'coarse';
  if (span <= DETAIL_THRESHOLDS.regional) return 'regional';
  if (span <= DETAIL_THRESHOLDS.country) return 'country';
  return 'continental';
}

export function getBboxDimensions(bbox: BBox): {
  widthKm: number;
  heightKm: number;
  areaKm2: number;
  widthMi: number;
  heightMi: number;
  areaMi2: number;
} {
  const widthKm = haversineKm(bbox.minLat, bbox.minLon, bbox.minLat, bbox.maxLon);
  const heightKm = haversineKm(bbox.minLat, bbox.minLon, bbox.maxLat, bbox.minLon);
  const areaKm2 = widthKm * heightKm;

  return {
    widthKm,
    heightKm,
    areaKm2,
    widthMi: widthKm * KM_TO_MILES,
    heightMi: heightKm * KM_TO_MILES,
    areaMi2: areaKm2 * KM2_TO_MI2,
  };
}

export function bboxToArray(bbox: BBox): [number, number, number, number] {
  return [bbox.minLat, bbox.minLon, bbox.maxLat, bbox.maxLon];
}

export function arrayToBbox(arr: [number, number, number, number]): BBox {
  return {
    minLat: arr[0],
    minLon: arr[1],
    maxLat: arr[2],
    maxLon: arr[3],
  };
}

export function bboxCenter(bbox: BBox): { lat: number; lon: number } {
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lon: (bbox.minLon + bbox.maxLon) / 2,
  };
}
