// backend/src/osm/bboxSplitter.ts
// Splits large bboxes into smaller chunks for Overpass API

/**
 * Splits a large bbox into smaller chunks
 * @param bbox [minLat, minLon, maxLat, maxLon]
 * @param maxSpanDeg Maximum span in degrees for each chunk
 * @returns Array of bbox chunks
 */
export function splitBbox(
  bbox: [number, number, number, number],
  maxSpanDeg: number = 2.0
): [number, number, number, number][] {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  
  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  
  // If bbox is already small enough, return as-is
  if (latSpan <= maxSpanDeg && lonSpan <= maxSpanDeg) {
    return [bbox];
  }
  
  // Calculate number of splits needed
  const latSplits = Math.ceil(latSpan / maxSpanDeg);
  const lonSplits = Math.ceil(lonSpan / maxSpanDeg);
  
  const chunks: [number, number, number, number][] = [];
  const latStep = latSpan / latSplits;
  const lonStep = lonSpan / lonSplits;
  
  for (let i = 0; i < latSplits; i++) {
    for (let j = 0; j < lonSplits; j++) {
      const chunkMinLat = minLat + i * latStep;
      const chunkMaxLat = i === latSplits - 1 ? maxLat : minLat + (i + 1) * latStep;
      const chunkMinLon = minLon + j * lonStep;
      const chunkMaxLon = j === lonSplits - 1 ? maxLon : minLon + (j + 1) * lonStep;
      
      chunks.push([chunkMinLat, chunkMinLon, chunkMaxLat, chunkMaxLon]);
    }
  }
  
  return chunks;
}

/**
 * Determines if a bbox should be split based on its size
 */
export function shouldSplitBbox(bbox: [number, number, number, number]): boolean {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const latMid = (maxLat + minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;
  const normalizedSpanDeg = Math.max(latSpan, Math.abs(lonSpan * Math.cos(latMidRad)));
  
  // Split if normalized span > 3 degrees (roughly 200+ miles)
  return normalizedSpanDeg > 3.0;
}

