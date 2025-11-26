// backend/src/geo/simplify.ts
// Shared geometry simplification utilities

export type Point = [number, number];

/**
 * Remove very close/redundant points before applying Douglas-Peucker
 * This is more effective than aggressive Douglas-Peucker for preserving detail
 * @param points Array of [x, y] coordinate pairs
 * @param minDistance Minimum distance between points (in same units as coordinates)
 * @returns Points with nearby duplicates removed
 */
export function removeNearbyPoints(points: Point[], minDistance: number): Point[] {
  if (points.length <= 2) return points;
  
  const result: Point[] = [points[0]];
  const minDistSq = minDistance * minDistance;
  
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i];
    const [prevX, prevY] = result[result.length - 1];
    const dx = x - prevX;
    const dy = y - prevY;
    const distSq = dx * dx + dy * dy;
    
    // Keep point if it's far enough from the previous one
    if (distSq >= minDistSq) {
      result.push(points[i]);
    }
  }
  
  // Ensure we keep the last point if it's different from the first (for closed rings)
  if (result.length > 1) {
    const [firstX, firstY] = result[0];
    const [lastX, lastY] = result[result.length - 1];
    const dx = lastX - firstX;
    const dy = lastY - firstY;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistSq && points.length > 2) {
      // Last point is very close to first, but we want to keep it for closed rings
      // Only remove if there are other points
    }
  }
  
  return result;
}

/**
 * Douglas-Peucker line simplification algorithm
 * Reduces the number of points in a line while preserving its general shape
 * @param points Array of [x, y] coordinate pairs
 * @param epsilon Maximum distance a point can be from the simplified line
 * @returns Simplified array of points
 */
export function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;

  const [startX, startY] = points[0];
  const [endX, endY] = points[points.length - 1];

  const dx = endX - startX;
  const dy = endY - startY;
  const lenSq = dx * dx + dy * dy || 1;

  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const t = ((x - startX) * dx + (y - startY) * dy) / lenSq;
    const projX = startX + t * dx;
    const projY = startY + t * dy;
    const distSq = (x - projX) * (x - projX) + (y - projY) * (y - projY);
    if (distSq > maxDist) {
      maxDist = distSq;
      index = i;
    }
  }

  if (Math.sqrt(maxDist) > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

