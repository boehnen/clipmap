// backend/src/osm/parks.ts
import { RawWay } from "../types";
import { buildOverpassQuery, runOverpassQuery, computeDetailLevel } from "./overpass";
import { splitBbox, shouldSplitBbox } from "./bboxSplitter";
import { filterParksBySize } from "./featureFilter";
import { logger } from "../logger";

function isParkArea(tags: Record<string, string>): boolean {
  const leisure = tags["leisure"];
  const landuse = tags["landuse"];
  const natural = tags["natural"];
  const area = tags["area"];

  if (area === "yes") return true;

  if (
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "playground" ||
    leisure === "pitch" ||
    leisure === "recreation_ground" ||
    leisure === "nature_reserve"
  ) {
    return true;
  }

  if (
    landuse === "grass" ||
    landuse === "meadow" ||
    landuse === "forest" ||
    landuse === "village_green"
  ) {
    return true;
  }

  if (natural === "wood") return true;

  return false;
}

function coordsClosed(coords: [number, number][]): [number, number][] {
  if (coords.length < 3) return coords;
  const [lat0, lon0] = coords[0];
  const [latN, lonN] = coords[coords.length - 1];
  if (Math.abs(lat0 - latN) < 1e-6 && Math.abs(lon0 - lonN) < 1e-6) return coords;
  return [...coords, [lat0, lon0]];
}

function buildRingsFromSegments(
  segments: [number, number][][]
): [number, number][][] {
  const rings: [number, number][][] = [];
  const remaining = segments.map(seg => seg.slice());
  const eq = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

  while (remaining.length > 0) {
    let ring = remaining.shift()!;
    let extended = true;

    while (extended) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const start = ring[0];
        const end = ring[ring.length - 1];
        const segStart = seg[0];
        const segEnd = seg[seg.length - 1];

        if (eq(end, segStart)) {
          ring = ring.concat(seg.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        } else if (eq(end, segEnd)) {
          const rev = seg.slice().reverse();
          ring = ring.concat(rev.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        } else if (eq(start, segEnd)) {
          const rev = seg.slice().reverse();
          ring = rev.slice(0, rev.length - 1).concat(ring);
          remaining.splice(i, 1);
          extended = true;
          break;
        } else if (eq(start, segStart)) {
          ring = seg.slice(0, seg.length - 1).concat(ring);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }

    if (ring.length >= 3) {
      ring = coordsClosed(ring);
      rings.push(ring);
    }
  }

  return rings;
}

export async function fetchParkPolygons(
  bbox: [number, number, number, number]
): Promise<RawWay[]> {
  // Split large bboxes into smaller chunks to avoid Overpass timeouts
  // Use same logic as roads: split if latSpan > 2.5 or lonSpan > 2.5
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  
  let bboxes: [number, number, number, number][];
  const shouldSplit = shouldSplitBbox(bbox) || latSpan > 2.5 || lonSpan > 2.5;
  if (shouldSplit) {
    // Use 1.5° chunks like roads for consistency
    bboxes = splitBbox(bbox, 1.5);
  } else {
    bboxes = [bbox];
  }
  
  // Fetch parks from all chunks in parallel
  const allPolygons: RawWay[] = [];
  const parkIds = new Set<string>(); // Deduplicate by relation ID or geometry
  
  for (let i = 0; i < bboxes.length; i++) {
    const chunk = bboxes[i];
    try {
      const query = buildOverpassQuery(chunk, "parks");
      const data = await runOverpassQuery(query, "parks");

      const nodes = new Map<number, [number, number]>();
      const wayNodes = new Map<number, number[]>();
      const wayTags = new Map<number, Record<string, string>>();
      const relations: any[] = [];

      for (const el of data.elements) {
        if (el.type === "node") {
          nodes.set(el.id, [el.lat, el.lon]);
        }
      }

      for (const el of data.elements) {
        if (el.type === "way") {
          wayNodes.set(el.id, el.nodes as number[]);
          wayTags.set(el.id, el.tags || {});
        } else if (el.type === "relation") {
          relations.push(el);
        }
      }

      const polygons: RawWay[] = [];
      const usedWayIds = new Set<number>();

      for (const rel of relations) {
        const tags: Record<string, string> = rel.tags || {};
        if (!isParkArea(tags)) continue;
        const members = rel.members || [];
        const outerMembers = members.filter(
          (m: any) => m.type === "way" && m.role === "outer"
        );

        const segments: [number, number][][] = [];

        for (const m of outerMembers) {
          const nodeIds = wayNodes.get(m.ref);
          if (!nodeIds) continue;
          const coords: [number, number][] = [];
          for (const nid of nodeIds) {
            const n = nodes.get(nid);
            if (n) coords.push(n);
          }
          if (coords.length >= 2) {
            segments.push(coords);
            usedWayIds.add(m.ref);
          }
        }

        if (segments.length === 0) continue;

        const rings = buildRingsFromSegments(segments);
        for (const ring of rings) {
          polygons.push({ coords: ring, tags, relationId: rel.id });
        }
      }

      for (const [wayId, nodeIds] of wayNodes) {
        if (usedWayIds.has(wayId)) continue;
        const tags = wayTags.get(wayId) || {};
        if (!isParkArea(tags)) continue;

        const coords: [number, number][] = [];
        for (const nid of nodeIds) {
          const n = nodes.get(nid);
          if (n) coords.push(n);
        }
        if (coords.length < 3) continue;

        const closedCoords = coordsClosed(coords);
        polygons.push({ coords: closedCoords, tags });
      }

      // Deduplicate: use relation ID or first coordinate as key
      for (const poly of polygons) {
        const key = poly.relationId 
          ? `rel_${poly.relationId}`
          : `coord_${poly.coords[0][0]}_${poly.coords[0][1]}`;
        if (!parkIds.has(key)) {
          parkIds.add(key);
          allPolygons.push(poly);
        }
      }
      
    } catch (e: any) {
      logger.warn("layer_chunk_failed", {
        layer: "parks",
        chunk: i + 1,
        error: e.message,
      });
      // Continue with other chunks
    }
  }
  
  // Filter by size based on detail level (like map zoom levels)
  // At coarse detail, only show larger parks that are meaningful at that scale
  const detail = computeDetailLevel(bbox);
  const filtered = filterParksBySize(allPolygons, bbox, detail);
  
  return filtered;
}
