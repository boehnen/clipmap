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
    // Use smaller chunks for roads (1.5°) since they're very dense
    const maxSpan = layer === "roads" ? 1.5 : 2.0;
    bboxes = splitBbox(bbox, maxSpan);
  } else {
    bboxes = [bbox];
  }

  const allWays: RawWay[] = [];
  const wayIds = new Set<string>();

  for (let i = 0; i < bboxes.length; i++) {
    const chunk = bboxes[i];
    try {
      const query = buildOverpassQuery(chunk, layer);
      const data = await runOverpassQuery(query, layer);
      const nodes = new Map<number, [number, number]>();
      const ways: RawWay[] = [];

      for (const el of data.elements) {
        if (el.type === "node") {
          nodes.set(el.id, [el.lat, el.lon]);
        }
      }

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
              ways.push({ coords, tags: el.tags || {} });
            }
          }
        }
      }

      allWays.push(...ways);
    } catch (e: any) {
      logger.warn("layer_chunk_failed", {
        layer,
        chunk: i + 1,
        error: e.message,
      });
      // Continue with other chunks
    }
  }

  return allWays;
}
