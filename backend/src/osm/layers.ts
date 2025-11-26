// backend/src/osm/layers.ts
import { LayerName, RawWay } from "../types";
import { buildOverpassQuery, runOverpassQuery, computeDetailLevel } from "./overpass";
import { splitBbox, shouldSplitBbox } from "./bboxSplitter";
import { logger } from "../logger";

/**
 * Check if bbox should be split for a specific layer
 * Roads are particularly dense and need more aggressive splitting
 */
function shouldSplitBboxForLayer(
  bbox: [number, number, number, number],
  layer: LayerName
): boolean {
  if (layer !== "roads") return false;
  
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  
  // For roads, split if either span is > 2.5 degrees
  // (more aggressive than the general 3.0 threshold)
  return latSpan > 2.5 || lonSpan > 2.5;
}

export async function fetchOsmLayer(
  bbox: [number, number, number, number],
  layer: LayerName
): Promise<RawWay[]> {
  if (layer === "water") {
    throw new Error("fetchOsmLayer is for non-water layers only");
  }

  const detail = computeDetailLevel(bbox);

  // For very large extents, buildings are both unreadable and too heavy.
  if (layer === "buildings" && detail !== "fine") {
    console.log("Skipping buildings layer for large extent");
    return [];
  }

  // Split large bboxes to avoid Overpass timeouts
  // Roads are particularly dense, so use smaller chunks
  let bboxes: [number, number, number, number][];
  const shouldSplit = shouldSplitBbox(bbox) || shouldSplitBboxForLayer(bbox, layer);
  if (shouldSplit) {
    // Use smaller chunks for roads (1.0°) since they're very dense and can cause stack overflow
    // Other layers can use 2.0° chunks
    const maxSpan = layer === "roads" ? 1.0 : 2.0;
    bboxes = splitBbox(bbox, maxSpan);
  } else {
    bboxes = [bbox];
  }

  const allWays: RawWay[] = [];
  const wayIds = new Set<string>();

  // Process chunks, retrying with smaller splits if a chunk fails
  const processChunk = async (chunkBbox: [number, number, number, number], attempt: number = 0): Promise<void> => {
    try {
      const query = buildOverpassQuery(chunkBbox, layer);
      const data = await runOverpassQuery(query, layer);
      
      // Check if response is too large (might cause stack overflow)
      if (data.elements && data.elements.length > 500000) {
        // Response is huge - split this chunk further
        const [minLat, minLon, maxLat, maxLon] = chunkBbox;
        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;
        
        // Only retry with smaller chunks if chunk is still splittable (>0.5°)
        if (attempt < 3 && (latSpan > 0.5 || lonSpan > 0.5)) {
          logger.warn("layer_chunk_too_large_splitting", {
            layer,
            elementCount: data.elements.length,
            chunkSize: `${latSpan.toFixed(3)}° x ${lonSpan.toFixed(3)}°`,
            attempt: attempt + 1,
          });
          
          const smallerChunks = splitBbox(chunkBbox, Math.max(latSpan, lonSpan) / 2);
          for (const smallerChunk of smallerChunks) {
            await processChunk(smallerChunk, attempt + 1);
          }
          return;
        }
      }
      
      const nodes = new Map<number, [number, number]>();

      // Process nodes first
      for (const el of data.elements) {
        if (el.type === "node") {
          nodes.set(el.id, [el.lat, el.lon]);
        }
      }

      // Process ways and add directly to allWays to avoid stack overflow from spread operator
      for (const el of data.elements) {
        if (el.type === "way") {
          const coords: [number, number][] = [];
          for (const id of el.nodes as number[]) {
            const n = nodes.get(id);
            if (n) coords.push(n);
          }
          if (coords.length >= 2) {
            // Deduplicate by way ID
            const wayKey = `way_${el.id}`;
            if (!wayIds.has(wayKey)) {
              wayIds.add(wayKey);
              allWays.push({ coords, tags: el.tags || {} });
            }
          }
        }
      }
      
      // Clear nodes map to free memory
      nodes.clear();
    } catch (e: any) {
      const [minLat, minLon, maxLat, maxLon] = chunkBbox;
      const latSpan = maxLat - minLat;
      const lonSpan = maxLon - minLon;
      const errorMsg = e?.message || String(e);
      const isStackOverflow = errorMsg.includes("Maximum call stack size exceeded") ||
                              errorMsg.includes("stack size exceeded") ||
                              errorMsg.includes("stack overflow");
      
      // If error is stack overflow and chunk is still splittable, try splitting further
      if (isStackOverflow && attempt < 4 && (latSpan > 0.25 || lonSpan > 0.25)) {
        logger.warn("layer_chunk_stack_overflow_splitting", {
          layer,
          chunkSize: `${latSpan.toFixed(3)}° x ${lonSpan.toFixed(3)}°`,
          attempt: attempt + 1,
          error: errorMsg.substring(0, 100),
        });
        
        const smallerChunks = splitBbox(chunkBbox, Math.max(latSpan, lonSpan) / 2);
        for (const smallerChunk of smallerChunks) {
          await processChunk(smallerChunk, attempt + 1);
        }
        return;
      }
      
      // Log error and skip this chunk (but don't fail the entire export)
      logger.warn("layer_chunk_failed", {
        layer,
        error: errorMsg.substring(0, 200),
        chunkSize: `${latSpan.toFixed(3)}° x ${lonSpan.toFixed(3)}°`,
        attempt,
        isStackOverflow,
      });
    }
  };

  for (let i = 0; i < bboxes.length; i++) {
    await processChunk(bboxes[i]);
  }

  return allWays;
}
