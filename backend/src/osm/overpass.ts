import { LayerName } from "../types";
import { CONFIG } from "../config";
import { logger } from "../logger";
import { metrics } from "../metrics";
import fetch, { RequestInit } from "node-fetch";

export function buildOverpassQuery(
  bbox: [number, number, number, number],
  layer: LayerName
): string {
  const [minLat, minLon, maxLat, maxLon] = bbox;

  if (layer === "water") {
    return `
      [out:json][timeout:25];
      (
        way["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});
        relation["natural"="water"](${minLat},${minLon},${maxLat},${maxLon});

        way["waterway"="riverbank"](${minLat},${minLon},${maxLat},${maxLon});
        relation["waterway"="riverbank"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="reservoir"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="reservoir"](${minLat},${minLon},${maxLat},${maxLon});

        way["wetland"](${minLat},${minLon},${maxLat},${maxLon});
        relation["wetland"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="basin"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="basin"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="harbour"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="harbour"](${minLat},${minLon},${maxLat},${maxLon});

        way["harbour"](${minLat},${minLon},${maxLat},${maxLon});
        relation["harbour"](${minLat},${minLon},${maxLat},${maxLon});

        way["waterway"="dock"](${minLat},${minLon},${maxLat},${maxLon});
        relation["waterway"="dock"](${minLat},${minLon},${maxLat},${maxLon});

        way["natural"="bay"](${minLat},${minLon},${maxLat},${maxLon});
        relation["natural"="bay"](${minLat},${minLon},${maxLat},${maxLon});

        way["natural"="strait"](${minLat},${minLon},${maxLat},${maxLon});
        relation["natural"="strait"](${minLat},${minLon},${maxLat},${maxLon});

        way["natural"="coastline"](${minLat},${minLon},${maxLat},${maxLon});
      );
      (._;>;);
      out body;
    `;
  }

  if (layer === "parks") {
    return `
      [out:json][timeout:25];
      (
        way["leisure"="park"](${minLat},${minLon},${maxLat},${maxLon});
        relation["leisure"="park"](${minLat},${minLon},${maxLat},${maxLon});

        way["leisure"="garden"](${minLat},${minLon},${maxLat},${maxLon});
        relation["leisure"="garden"](${minLat},${minLon},${maxLat},${maxLon});

        way["leisure"="playground"](${minLat},${minLon},${maxLat},${maxLon});
        relation["leisure"="playground"](${minLat},${minLon},${maxLat},${maxLon});

        way["leisure"="pitch"](${minLat},${minLon},${maxLat},${maxLon});
        relation["leisure"="pitch"](${minLat},${minLon},${maxLat},${maxLon});

        way["leisure"="recreation_ground"](${minLat},${minLon},${maxLat},${maxLon});
        relation["leisure"="recreation_ground"](${minLat},${minLon},${maxLat},${maxLon});

        way["leisure"="nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});
        relation["leisure"="nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="grass"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="grass"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="meadow"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="meadow"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="forest"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="forest"](${minLat},${minLon},${maxLat},${maxLon});

        way["landuse"="village_green"](${minLat},${minLon},${maxLat},${maxLon});
        relation["landuse"="village_green"](${minLat},${minLon},${maxLat},${maxLon});

        way["natural"="wood"](${minLat},${minLon},${maxLat},${maxLon});
        relation["natural"="wood"](${minLat},${minLon},${maxLat},${maxLon});
      );
      (._;>;);
      out body;
    `;
  }

  if (layer === "labels") {
    return `
      [out:json][timeout:25];
      (
        node["place"]["name"](${minLat},${minLon},${maxLat},${maxLon});
      );
      out body;
    `;
  }

  let filterExpr = "";
  switch (layer) {
    case "roads":
      filterExpr = 'way["highway"]';
      break;
    case "railways":
      filterExpr = 'way["railway"]';
      break;
    case "buildings":
      filterExpr = 'way["building"]';
      break;
    default:
      throw new Error(`buildOverpassQuery not implemented for layer ${layer}`);
  }

  return `
    [out:json][timeout:25];
    (
      ${filterExpr}(${minLat},${minLon},${maxLat},${maxLon});
    );
    out body;
    >;
    out skel qt;
  `;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function runOverpassQuery(query: string, layerLabel: string) {
  const body = query;
  const endpoints = CONFIG.overpassEndpoints;
  const maxRetries = CONFIG.overpassMaxRetries;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const endpoint = endpoints[attempt % endpoints.length];

    try {
      logger.info("overpass_request", {
        layer: layerLabel,
        endpoint,
        attempt,
      });

      const resp = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          body,
          headers: { "Content-Type": "text/plain" },
        },
        CONFIG.overpassTimeoutMs
      );

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        logger.warn("overpass_bad_status", {
          layer: layerLabel,
          endpoint,
          status: resp.status,
          bodySnippet: text.slice(0, 200),
        });
        metrics.recordOverpassRequest(layerLabel, endpoint, resp.status);
        lastError = new Error(`Overpass status ${resp.status}`);
        continue;
      }

      metrics.recordOverpassRequest(layerLabel, endpoint, resp.status);
      const data: any = await resp.json();
      return data;
    } catch (err: any) {
      lastError = err;
      logger.warn("overpass_request_failed", {
        layer: layerLabel,
        endpoint,
        attempt,
        error: err.message,
      });
      metrics.recordOverpassRequest(layerLabel, endpoint, 599); // synthetic "network" status
    }
  }

  throw lastError || new Error("Overpass request failed");
}
