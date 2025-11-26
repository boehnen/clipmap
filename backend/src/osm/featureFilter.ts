// backend/src/osm/featureFilter.ts
// Filters features by size/importance based on detail level
// Similar to how map zoom levels work - smaller features filtered out at lower zoom

import { RawWay, DetailLevel } from "../types";
import { computeDetailLevel } from "./overpass";

/**
 * Calculate approximate area of a polygon in square degrees
 * (rough approximation, good enough for filtering)
 */
function calculateAreaDeg2(coords: [number, number][]): number {
  if (coords.length < 3) return 0;
  
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lat1, lon1] = coords[i];
    const [lat2, lon2] = coords[i + 1];
    area += (lon1 * lat2 - lon2 * lat1);
  }
  return Math.abs(area) / 2;
}

/**
 * Filter parks by minimum area based on detail level
 * At coarse detail, only show larger parks (like zoomed out maps)
 */
export function filterParksBySize(
  parks: RawWay[],
  bbox: [number, number, number, number],
  detail: DetailLevel
): RawWay[] {
  if (parks.length === 0) return parks;
  
  // Calculate bbox area for scaling
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const bboxArea = Math.abs((maxLat - minLat) * (maxLon - minLon));
  
  // Minimum area thresholds (as fraction of bbox area)
  // At coarse detail, only show parks that are at least 0.01% of bbox area
  // At medium, 0.001%, at fine, include all
  let minAreaFraction: number;
  switch (detail) {
    case "coarse":
      minAreaFraction = 0.0001; // 0.01% of bbox - only large parks
      break;
    case "medium":
      minAreaFraction = 0.00001; // 0.001% of bbox - medium parks
      break;
    case "fine":
    default:
      return parks; // Include all parks at fine detail
  }
  
  const minArea = bboxArea * minAreaFraction;
  const filtered: RawWay[] = [];
  
  for (const park of parks) {
    const area = calculateAreaDeg2(park.coords);
    if (area >= minArea) {
      filtered.push(park);
    }
  }
  
  return filtered;
}

/**
 * Filter water features by minimum area based on detail level
 */
export function filterWaterBySize(
  waterFeatures: RawWay[],
  bbox: [number, number, number, number],
  detail: DetailLevel
): RawWay[] {
  if (waterFeatures.length === 0) return waterFeatures;
  
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const bboxArea = Math.abs((maxLat - minLat) * (maxLon - minLon));
  
  let minAreaFraction: number;
  switch (detail) {
    case "coarse":
      minAreaFraction = 0.0001; // Only large water bodies
      break;
    case "medium":
      minAreaFraction = 0.00001; // Medium water bodies
      break;
    case "fine":
    default:
      return waterFeatures; // Include all at fine detail
  }
  
  const minArea = bboxArea * minAreaFraction;
  const filtered: RawWay[] = [];
  
  for (const water of waterFeatures) {
    const area = calculateAreaDeg2(water.coords);
    if (area >= minArea) {
      filtered.push(water);
    }
  }
  
  return filtered;
}

