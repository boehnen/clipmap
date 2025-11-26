// backend/src/svg/simplifyToSize.ts
// Centralized file-size-driven simplification for SVG path generation

import { logger } from "../logger";
import { douglasPeucker } from "../geo/simplify";
import { mercatorToSvg } from "../geo/projection";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

const MAX_SVG_SIZE_BYTES = 3 * 1024 * 1024; // 3MB target

/**
 * Simplify a ring using Douglas-Peucker algorithm
 */
function simplifyRing(ring: Ring, epsilon: number): Ring {
  if (ring.length <= 4 || epsilon <= 1e-10) return ring;
  
  const simplified = douglasPeucker(ring, epsilon);
  
  // Ensure closed
  const [x0, y0] = simplified[0];
  const [xN, yN] = simplified[simplified.length - 1];
  if (Math.abs(x0 - xN) > 1e-6 || Math.abs(y0 - yN) > 1e-6) {
    simplified.push([x0, y0]);
  }
  return simplified as Ring;
}

/**
 * Calculate coordinate precision based on meters-per-pixel ratio
 */
function calculatePrecision(
  span: number,
  pixels: number
): number {
  const metersPerPixel = span / pixels;
  if (metersPerPixel <= 1.0) {
    return 2; // High precision for detailed views
  } else if (metersPerPixel <= 10.0) {
    return 2 - ((metersPerPixel - 1.0) / 9.0);
  } else {
    return Math.max(0, 1 - ((metersPerPixel - 10.0) / 50.0));
  }
}

/**
 * Convert multipolygon to SVG path data with given epsilon and precision
 */
function multipolygonToPathD(
  mp: MultiPolygon,
  bboxMerc: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  epsilon: number,
  precision: number
): string {
  const { minx, maxx, miny, maxy } = bboxMerc;
  const { width, height } = canvas;

  let d = "";

  for (const poly of mp) {
    for (let ring of poly) {
      if (!ring.length) continue;

      // Simplify ring with given epsilon
      ring = simplifyRing(ring, epsilon);
      
      ring.forEach(([mx, my], i) => {
        const [sx, sy] = mercatorToSvg(
          mx, my,
          minx, maxx,
          miny, maxy,
          width, height
        );
        d += `${i === 0 ? "M" : "L"}${sx.toFixed(precision)},${sy.toFixed(precision)} `;
      });
      d += "Z ";
    }
  }

  return d.trim();
}

/**
 * Build a test SVG string to measure file size
 */
function buildTestSvg(
  pathData: string,
  width: number,
  height: number,
  layerId: string
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g id="${layerId}"><path d="${pathData}" fill="#000" stroke="none" stroke-width="0" fill-rule="evenodd" /></g></svg>`;
}

/**
 * Centralized file-size-driven simplification for multipolygons
 * Uses binary search for efficient convergence (typically 5-8 passes)
 * 
 * @param mp - MultiPolygon to simplify
 * @param bboxMerc - Bounding box in Mercator coordinates
 * @param canvas - Canvas dimensions
 * @param layerId - Layer identifier for logging
 * @returns SVG path data string
 */
export function simplifyMultipolygonToSize(
  mp: MultiPolygon,
  bboxMerc: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  layerId: string = "layer"
): string {
  const { minx, maxx, miny, maxy } = bboxMerc;
  const { width, height } = canvas;
  const spanX = maxx - minx;
  const spanY = maxy - miny;
  const span = Math.max(spanX, spanY);
  const pixels = Math.max(width, height);

  // Calculate precision based on meters-per-pixel
  const precision = Math.round(calculatePrecision(span, pixels));

  // Epsilon range: start with minimal simplification, allow up to aggressive
  const minEpsilon = span / (pixels * 1000.0); // Very small = preserve detail
  const maxEpsilon = span / (pixels * 5.0); // Maximum simplification if needed

  // Binary search for optimal epsilon
  let low = minEpsilon;
  let high = maxEpsilon;
  let bestEpsilon = minEpsilon;
  let bestPathD = "";
  let attempts = 0;
  const maxAttempts = 12; // Binary search should converge in ~log2(1000) ≈ 10 passes

  // First, check if no simplification is needed
  const noSimplifyPathD = multipolygonToPathD(mp, bboxMerc, canvas, 0, precision);
  const noSimplifySvg = buildTestSvg(noSimplifyPathD, width, height, layerId);
  const noSimplifySize = Buffer.byteLength(noSimplifySvg, 'utf8');

  if (noSimplifySize <= MAX_SVG_SIZE_BYTES) {
    return noSimplifyPathD;
  }

  // Binary search for optimal epsilon
  while (attempts < maxAttempts && (high - low) > minEpsilon * 0.1) {
    const epsilon = (low + high) / 2;
    const pathD = multipolygonToPathD(mp, bboxMerc, canvas, epsilon, precision);
    const testSvg = buildTestSvg(pathD, width, height, layerId);
    const size = Buffer.byteLength(testSvg, 'utf8');

    attempts++;

    if (size <= MAX_SVG_SIZE_BYTES) {
      // Under limit - this epsilon works, try smaller
      bestEpsilon = epsilon;
      bestPathD = pathD;
      high = epsilon;
    } else {
      // Over limit - need more simplification
      low = epsilon;
    }
  }

  // If we found a good epsilon, use it; otherwise use the best we found
  if (bestPathD) {
    return bestPathD;
  }

  // Fallback: use max epsilon if binary search didn't converge
  logger.warn("simplification_fallback", {
    layer: layerId,
    epsilon: maxEpsilon.toExponential(3),
    attempts,
  });
  
  return multipolygonToPathD(mp, bboxMerc, canvas, maxEpsilon, precision);
}

