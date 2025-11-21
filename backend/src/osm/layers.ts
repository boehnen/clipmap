import { LayerName, RawWay } from "../types";
import { buildOverpassQuery, runOverpassQuery } from "./overpass";

export async function fetchOsmLayer(
  bbox: [number, number, number, number],
  layer: LayerName
): Promise<RawWay[]> {
  if (layer === "water") {
    throw new Error("fetchOsmLayer is for non-water layers only");
  }

  const query = buildOverpassQuery(bbox, layer);
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
        ways.push({ coords, tags: el.tags || {} });
      }
    }
  }

  console.log(`Fetched ${ways.length} ways for ${layer}`);
  return ways;
}
