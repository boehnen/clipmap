// backend/src/svg/simplifyLinesToSize.ts
// Centralized file-size-driven simplification for line features (roads, railways)

import { logger } from "../logger";
import { douglasPeucker } from "../geo/simplify";
import { mercatorToSvg } from "../geo/projection";

export type Line = [number, number][];
const MAX_SVG_SIZE_BYTES = 3 * 1024 * 1024; // 3MB target

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
 * Convert a line to SVG path data
 */
function lineToPathD(
  line: Line,
  bboxMerc: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  epsilon: number,
  precision: number
): string {
  const { minx, maxx, miny, maxy } = bboxMerc;
  const { width, height } = canvas;

  // Simplify line if epsilon is meaningful
  let simplified = line;
  if (epsilon > 1e-10 && line.length > 2) {
    simplified = douglasPeucker(line, epsilon) as Line;
  }

  let d = "";
  simplified.forEach(([mx, my], i) => {
    const [sx, sy] = mercatorToSvg(mx, my, minx, maxx, miny, maxy, width, height);
    d += `${i === 0 ? "M" : "L"}${sx.toFixed(precision)},${sy.toFixed(precision)} `;
  });

  return d.trim();
}

/**
 * Remove duplicate consecutive points from a line
 */
function removeDuplicatePoints(
  line: [number, number][],
  threshold: number
): [number, number][] {
  if (line.length <= 1) return line;
  
  const result: [number, number][] = [line[0]];
  const thresholdSq = threshold * threshold;
  
  for (let i = 1; i < line.length; i++) {
    const [x, y] = line[i];
    const [prevX, prevY] = result[result.length - 1];
    const dx = x - prevX;
    const dy = y - prevY;
    const distSq = dx * dx + dy * dy;
    
    if (distSq > thresholdSq) {
      result.push([x, y]);
    }
  }
  
  return result;
}

/**
 * Check if two points are the same (within threshold)
 */
function pointsEqual(
  p1: [number, number],
  p2: [number, number],
  threshold: number
): boolean {
  const dx = p1[0] - p2[0];
  const dy = p1[1] - p2[1];
  return (dx * dx + dy * dy) <= (threshold * threshold);
}

/**
 * Convert multiple lines to a single multiline path, connecting segments that share endpoints
 * Uses a greedy algorithm to sort lines and maximize connections
 */
function linesToMultilinePathD(
  lines: Line[],
  bboxMerc: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  epsilon: number,
  precision: number
): string {
  if (lines.length === 0) return "";
  
  const { minx, maxx, miny, maxy } = bboxMerc;
  const { width, height } = canvas;
  
  // Convert all lines to SVG coordinates, simplify, and remove duplicates
  // CRITICAL: Track every line to ensure nothing is lost
  const svgLines: [number, number][][] = [];
  let linesSkipped = 0;
  let linesSimplifiedAway = 0;
  
  for (const line of lines) {
    if (line.length < 2) {
      linesSkipped++;
      continue;
    }
    
    // Simplify line if needed
    let simplified = line;
    if (epsilon > 1e-10 && line.length > 2) {
      simplified = douglasPeucker(line, epsilon) as Line;
      if (simplified.length < 2) {
        linesSimplifiedAway++;
        continue; // Line was simplified away - this is acceptable
      }
    }
    
    // Convert to SVG coordinates
    const svgCoords: [number, number][] = simplified.map(([mx, my]) => {
      const [sx, sy] = mercatorToSvg(mx, my, minx, maxx, miny, maxy, width, height);
      return [sx, sy];
    });
    
    // Remove duplicate consecutive points (very small threshold - only true duplicates)
    const cleaned = removeDuplicatePoints(svgCoords, Math.pow(10, -precision - 2));
    
    if (cleaned.length >= 2) {
      svgLines.push(cleaned);
    } else {
      linesSimplifiedAway++;
    }
  }
  
  if (svgLines.length === 0) return "";
  
  // Log if significant number of lines were lost
  if (linesSkipped + linesSimplifiedAway > lines.length * 0.1) {
    logger.warn("lines_lost_in_processing", {
      original: lines.length,
      processed: svgLines.length,
      lost: linesSkipped + linesSimplifiedAway,
    });
  }
  
  // Build path string - each line becomes a separate path segment
  // Round caps/joins handle smooth appearance at intersections
  let pathD = "";
  let totalPoints = 0;
  
  for (const svgLine of svgLines) {
    if (svgLine.length < 2) continue;
    
    totalPoints += svgLine.length;
    
    // Each line starts with M, then L for remaining points
    for (let i = 0; i < svgLine.length; i++) {
      const [sx, sy] = svgLine[i];
      pathD += `${i === 0 ? "M" : "L"}${sx.toFixed(precision)},${sy.toFixed(precision)} `;
    }
  }
  
  // Verify all lines were included
  const mCount = (pathD.match(/M/g) || []).length;
  if (mCount !== svgLines.length) {
    logger.error("lines_count_mismatch", {
      expected: svgLines.length,
      actual: mCount,
    });
  }
  
  
  return pathD.trim();
}

/**
 * Build a test SVG string to measure file size
 */
function buildTestSvg(
  pathData: string,
  width: number,
  height: number,
  layerId: string,
  strokeWidth: number
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g id="${layerId}"><path d="${pathData}" stroke="#000" stroke-width="${strokeWidth}" fill="none" /></g></svg>`;
}

/**
 * Build complete SVG to measure total size across all stroke width groups
 */
function buildCompleteTestSvg(
  pathsByStrokeWidth: Map<number, string>,
  width: number,
  height: number,
  layerId: string,
  isRailway: boolean = false
): string {
  const paths: string[] = [];
  for (const [strokeWidth, pathD] of pathsByStrokeWidth.entries()) {
    if (!pathD) continue;
    
    if (isRailway) {
      // Railways: solid base + dotted overlay
      const baseWidth = strokeWidth;
      const dotWidth = baseWidth * 2;
      const gap = baseWidth * 3;
      paths.push(`<path d="${pathD}" stroke="#000" stroke-width="${baseWidth.toFixed(2)}" fill="none" />`);
      paths.push(`<path d="${pathD}" stroke="#000" stroke-width="${dotWidth.toFixed(2)}" fill="none" stroke-linecap="round" stroke-dasharray="0,${gap.toFixed(2)}" />`);
    } else {
      paths.push(`<path d="${pathD}" stroke="#000" stroke-width="${strokeWidth.toFixed(2)}" fill="none" />`);
    }
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g id="${layerId}">${paths.join("")}</g></svg>`;
}

/**
 * Simplify lines to fit within file size limit using binary search
 * Groups lines by stroke width and simplifies all groups together to meet total size limit
 */
export function simplifyLinesToSize(
  linesByStrokeWidth: Map<number, Line[]>,
  bboxMerc: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  layerId: string = "layer"
): Map<number, string> {
  const { minx, maxx, miny, maxy } = bboxMerc;
  const { width, height } = canvas;
  const spanX = maxx - minx;
  const spanY = maxy - miny;
  const span = Math.max(spanX, spanY);
  const pixels = Math.max(width, height);

  const precision = Math.round(calculatePrecision(span, pixels));

  // Epsilon range for line simplification
  const minEpsilon = span / (pixels * 1000.0); // Very small = preserve detail
  const maxEpsilon = span / (pixels * 2.0); // Maximum simplification

  const isRailway = layerId.includes("railway");

  // First, check if no simplification is needed
  const noSimplifyPaths = new Map<number, string>();
  for (const [strokeWidth, lines] of linesByStrokeWidth.entries()) {
    if (lines.length === 0) continue;
    const pathD = linesToMultilinePathD(lines, bboxMerc, canvas, 0, precision);
    noSimplifyPaths.set(strokeWidth, pathD);
  }
  
  const noSimplifySvg = buildCompleteTestSvg(noSimplifyPaths, width, height, layerId, isRailway);
  const noSimplifySize = Buffer.byteLength(noSimplifySvg, 'utf8');

  if (noSimplifySize <= MAX_SVG_SIZE_BYTES) {
    return noSimplifyPaths;
  }

  // Binary search for optimal epsilon across all groups
  let low = minEpsilon;
  let high = maxEpsilon;
  let bestEpsilon = minEpsilon;
  let bestPaths = new Map<number, string>();
  let attempts = 0;
  const maxAttempts = 12;

  while (attempts < maxAttempts && (high - low) > minEpsilon * 0.1) {
    const epsilon = (low + high) / 2;
    const currentPaths = new Map<number, string>();
    
    for (const [strokeWidth, lines] of linesByStrokeWidth.entries()) {
      if (lines.length === 0) continue;
      const pathD = linesToMultilinePathD(lines, bboxMerc, canvas, epsilon, precision);
      currentPaths.set(strokeWidth, pathD);
    }
    
    const testSvg = buildCompleteTestSvg(currentPaths, width, height, layerId, isRailway);
    const size = Buffer.byteLength(testSvg, 'utf8');

    attempts++;

    if (size <= MAX_SVG_SIZE_BYTES) {
      // Under limit - this epsilon works, try smaller
      bestEpsilon = epsilon;
      bestPaths = currentPaths;
      high = epsilon;
    } else {
      // Over limit - need more simplification
      low = epsilon;
    }
  }

  // Use best result found, or fallback to max epsilon
  if (bestPaths.size > 0) {
    return bestPaths;
  } else {
    // Fallback: use max epsilon
    logger.warn("lines_simplification_fallback", {
      layer: layerId,
      epsilon: maxEpsilon.toExponential(3),
    });
    
    const fallbackPaths = new Map<number, string>();
    for (const [strokeWidth, lines] of linesByStrokeWidth.entries()) {
      if (lines.length === 0) continue;
      const pathD = linesToMultilinePathD(lines, bboxMerc, canvas, maxEpsilon, precision);
      fallbackPaths.set(strokeWidth, pathD);
    }
    
    return fallbackPaths;
  }
}

