/**
 * Coordinate projection utilities
 *
 * Converts between WGS84 (lat/lon) and Web Mercator (EPSG:3857)
 */

// Earth radius in meters
const EARTH_RADIUS = 6378137;

// Max latitude for Web Mercator
const MAX_LATITUDE = 85.051128779806604;

/**
 * Project a single point from WGS84 to Web Mercator
 * Input: [lon, lat] in degrees
 * Output: [x, y] in meters
 */
export function projectPoint(lon: number, lat: number): [number, number] {
  // Clamp latitude to valid range
  const clampedLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));

  const x = lon * (Math.PI / 180) * EARTH_RADIUS;
  const y = Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI / 180) / 2)) * EARTH_RADIUS;

  return [x, y];
}

/**
 * Unproject a point from Web Mercator to WGS84
 * Input: [x, y] in meters
 * Output: [lon, lat] in degrees
 */
export function unprojectPoint(x: number, y: number): [number, number] {
  const lon = (x / EARTH_RADIUS) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);

  return [lon, lat];
}

/**
 * Project a coordinate array
 */
export function projectCoords(coords: [number, number][]): [number, number][] {
  return coords.map(([lon, lat]) => projectPoint(lon, lat));
}

/**
 * Project a ring (for polygons)
 */
export function projectRing(ring: [number, number][]): [number, number][] {
  return projectCoords(ring);
}

/**
 * Project polygon coordinates (array of rings)
 */
export function projectPolygon(coords: [number, number][][]): [number, number][][] {
  return coords.map(ring => projectRing(ring));
}

/**
 * Project multipolygon coordinates
 */
export function projectMultiPolygon(coords: [number, number][][][]): [number, number][][][] {
  return coords.map(polygon => projectPolygon(polygon));
}

/**
 * Calculate viewport dimensions for a bounding box in Web Mercator
 */
export function getViewportDimensions(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
  targetWidth: number = 800
): {
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  scale: number;
} {
  const [minX, minY] = projectPoint(minLon, minLat);
  const [maxX, maxY] = projectPoint(maxLon, maxLat);

  const projWidth = maxX - minX;
  const projHeight = maxY - minY;

  const scale = targetWidth / projWidth;
  const height = projHeight * scale;

  return {
    width: targetWidth,
    height,
    minX,
    minY,
    maxX,
    maxY,
    scale,
  };
}

/**
 * Transform projected coordinates to SVG coordinates
 */
export function toSvgCoords(
  x: number,
  y: number,
  viewport: { minX: number; maxY: number; scale: number }
): [number, number] {
  // SVG Y-axis is inverted (0 at top)
  const svgX = (x - viewport.minX) * viewport.scale;
  const svgY = (viewport.maxY - y) * viewport.scale;

  return [svgX, svgY];
}

/**
 * Transform an array of projected coordinates to SVG coordinates
 */
export function toSvgCoordsArray(
  coords: [number, number][],
  viewport: { minX: number; maxY: number; scale: number }
): [number, number][] {
  return coords.map(([x, y]) => toSvgCoords(x, y, viewport));
}
