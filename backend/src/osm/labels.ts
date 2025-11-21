// backend/src/osm/labels.ts
import { RawWay } from "../types";
import { buildOverpassQuery, runOverpassQuery } from "./overpass";

export async function fetchLabelFeatures(
  bbox: [number, number, number, number]
): Promise<RawWay[]> {
  const query = buildOverpassQuery(bbox, "labels");
  const data = await runOverpassQuery(query, "labels");

  const features: RawWay[] = [];

  for (const el of data.elements) {
    if (el.type === "node" && el.tags && el.tags.name) {
      const lat = el.lat;
      const lon = el.lon;
      features.push({
        coords: [[lat, lon]],
        tags: el.tags,
      });
    }
  }

  console.log(`Built ${features.length} label points`);
  return features;
}
