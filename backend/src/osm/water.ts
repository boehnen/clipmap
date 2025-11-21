import { RawWay } from "../types";
import { buildOverpassQuery, runOverpassQuery } from "./overpass";

function isWaterArea(tags: Record<string, string>): boolean {
  const natural = tags["natural"];
  const landuse = tags["landuse"];
  const waterway = tags["waterway"];
  const wetland = tags["wetland"];
  const water = tags["water"];
  const area = tags["area"];
  const harbour = tags["harbour"];

  if (area === "yes") return true;
  if (natural === "water") return true;
  if (landuse === "reservoir") return true;
  if (wetland) return true;
  if (waterway === "riverbank") return true;
  if (water && natural === "water") return true;

  if (landuse === "basin") return true;
  if (landuse === "harbour") return true;
  if (harbour) return true;
  if (waterway === "dock") return true;
  if (natural === "bay" || natural === "strait") return true;

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

export async function fetchWaterPolygons(
  bbox: [number, number, number, number]
): Promise<RawWay[]> {
  const query = buildOverpassQuery(bbox, "water");
  const data = await runOverpassQuery(query, "water");

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
    if (!isWaterArea(tags)) continue;
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
      polygons.push({ coords: ring, tags });
    }
  }

  for (const [wayId, nodeIds] of wayNodes) {
    if (usedWayIds.has(wayId)) continue;
    const tags = wayTags.get(wayId) || {};
    if (!isWaterArea(tags)) continue;

    const coords: [number, number][] = [];
    for (const nid of nodeIds) {
      const n = nodes.get(nid);
      if (n) coords.push(n);
    }
    if (coords.length < 3) continue;

    const closedCoords = coordsClosed(coords);
    polygons.push({ coords: closedCoords, tags });
  }

  console.log(`Built ${polygons.length} water polygons`);
  return polygons;
}
