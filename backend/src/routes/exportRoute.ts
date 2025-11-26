// backend/src/routes/exportRoute.ts
import express from "express";
import JSZip from "jszip";
import {
  BBox,
  MapExportRequest,
  RawWay,
  ProjectedFeature,
  LayerName,
} from "../types";
import {
  lonLatToWebMercator,
  autoCanvasFromMercator,
} from "../geo/projection";
import { fetchOsmLayer } from "../osm/layers";
import { fetchWaterPolygons } from "../osm/water";
import { fetchParkPolygons } from "../osm/parks";
import { fetchLabelFeatures } from "../osm/labels";
import { generateSvgForLayer } from "../svg/renderer";
import { generateWaterAndLandSvgs, computeLandFeaturesFromWater } from "../svg/waterLand";
import { getBaseWaterFeaturesForBBox } from "../geo/globalLand";
import { clipParksToLand } from "../geo/clipToLand";
import { optimizeSvgSize, getSvgSize } from "../svg/optimizer";
import { logger } from "../logger";
import { computeDetailLevel } from "../osm/overpass";
import type { DetailLevel } from "../types";
import { validateExportRequest } from "../middleware/validateRequest";

const router = express.Router();

// Helper to send SSE progress event
function sendProgress(res: express.Response, step: string, progress?: number) {
  const data = JSON.stringify({ step, progress });
  res.write(`data: ${data}\n\n`);
}

router.post("/export-zip", validateExportRequest, async (req, res, next) => {
  const body = req.body as MapExportRequest;

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { bbox, layers } = body;

    sendProgress(res, "starting", 0);

    const { minLat, minLon, maxLat, maxLon } = bbox;

    const rawBbox: [number, number, number, number] = [
      minLat,
      minLon,
      maxLat,
      maxLon,
    ];
    const detail: DetailLevel = computeDetailLevel(rawBbox);

    const [minx, miny] = lonLatToWebMercator(minLon, minLat);
    const [maxx, maxy] = lonLatToWebMercator(maxLon, maxLat);
    const bboxMercator = { minx, maxx, miny, maxy };
    const canvas = autoCanvasFromMercator(minx, miny, maxx, maxy);

    const zip = new JSZip();

    const needWaterOrLand = layers.includes("water") || layers.includes("land");
    const needParks = layers.includes("parks");

    let waterSvgFromUnion: string | undefined;
    let landSvgFromUnion: string | undefined;
    let landFeaturesForClipping: ProjectedFeature[] | undefined;

    if (needWaterOrLand) {
      sendProgress(res, "fetching_water_land", 10);
      try {
        const bboxLatLon = { minLat, minLon, maxLat, maxLon };

        // 1) Base water from global land polygons (oceans + seas)
        const baseWaterFeatures: ProjectedFeature[] =
          getBaseWaterFeaturesForBBox(bboxLatLon, bboxMercator, detail);

        // 2) Inland water from Overpass (lakes, reservoirs, riverbanks, basins...)
        const rawWater: RawWay[] = await fetchWaterPolygons([
          minLat,
          minLon,
          maxLat,
          maxLon,
        ]);

        const inlandWaterFeatures: ProjectedFeature[] = rawWater.map(
          ({ coords, tags, role, relationId }) => ({
            coords: coords.map(([lat, lon]) => lonLatToWebMercator(lon, lat)),
            tags,
            role,
            relationId,
          })
        );

        // 3) Combined water layer passed into generator
        const waterFeatures: ProjectedFeature[] = [
          ...baseWaterFeatures,
          ...inlandWaterFeatures,
        ];

        let { waterSvg, landSvg } = generateWaterAndLandSvgs(
          waterFeatures,
          bboxMercator,
          canvas,
          detail
        );
        
        // Compute land features for clipping parks (if needed)
        if (needParks) {
          landFeaturesForClipping = computeLandFeaturesFromWater(
            waterFeatures,
            bboxMercator
          );
        }

        // Optimize SVG sizes to stay under 3MB
        if (waterSvg) {
          waterSvg = optimizeSvgSize(waterSvg);
        }

        if (landSvg) {
          landSvg = optimizeSvgSize(landSvg);
        }

        waterSvgFromUnion = waterSvg;
        landSvgFromUnion = landSvg;

        if (waterSvg) {
          sendProgress(res, "rendering_water", 20);
        }
        if (landSvg) {
          sendProgress(res, "rendering_land", 25);
        }

      } catch (e: any) {
        logger.error("water_land_union_failed", {
          error: e.message,
        });
      }
    }

    const totalLayers = layers.length;
    let processedLayers = 0;

    for (const layerName of layers) {
      const layer: LayerName = layerName;

      try {
        if (layer === "water" && waterSvgFromUnion) {
          zip.file("water.svg", waterSvgFromUnion);
          processedLayers++;
          sendProgress(res, "packaging", 30 + (processedLayers / totalLayers) * 60);
          continue;
        }

        if (layer === "land" && landSvgFromUnion) {
          zip.file("land.svg", landSvgFromUnion);
          processedLayers++;
          sendProgress(res, "packaging", 30 + (processedLayers / totalLayers) * 60);
          continue;
        }

        // Send fetching progress
        const fetchStep = `fetching_${layer}`;
        sendProgress(res, fetchStep, 30 + (processedLayers / totalLayers) * 30);

        let rawFeatures: RawWay[];

        if (layer === "water") {
          rawFeatures = await fetchWaterPolygons([
            minLat,
            minLon,
            maxLat,
            maxLon,
          ]);
        } else if (layer === "parks") {
          rawFeatures = await fetchParkPolygons([
            minLat,
            minLon,
            maxLat,
            maxLon,
          ]);
        } else if (layer === "land") {
          const coordsLatLon: [number, number][] = [
            [minLat, minLon],
            [minLat, maxLon],
            [maxLat, maxLon],
            [maxLat, minLon],
            [minLat, minLon],
          ];
          rawFeatures = [
            {
              coords: coordsLatLon,
              tags: {},
            },
          ];
        } else if (layer === "labels") {
          rawFeatures = await fetchLabelFeatures([
            minLat,
            minLon,
            maxLat,
            maxLon,
          ]);
        } else {
          rawFeatures = await fetchOsmLayer(
            [minLat, minLon, maxLat, maxLon],
            layer
          );
        }


        // Convert to WebMercator
        let features: ProjectedFeature[] = rawFeatures.map(
          ({ coords, tags, role, relationId }) => ({
            coords: coords.map(([lat, lon]) => lonLatToWebMercator(lon, lat)),
            tags,
            role,
            relationId,
          })
        );
        
        // Clip parks to land if land features are available
        if (layer === "parks" && landFeaturesForClipping && landFeaturesForClipping.length > 0) {
          sendProgress(res, "clipping_parks", 40 + (processedLayers / totalLayers) * 20);
          features = clipParksToLand(features, landFeaturesForClipping);
        }

        // Send rendering progress
        const renderStep = `rendering_${layer}`;
        sendProgress(res, renderStep, 50 + (processedLayers / totalLayers) * 20);

        let svg = generateSvgForLayer(
          layer,
          features,
          bboxMercator,
          canvas,
          detail
        );

        // Optimize SVG size to stay under 3MB
        sendProgress(res, "optimizing", 70 + (processedLayers / totalLayers) * 10);
        svg = optimizeSvgSize(svg);

        zip.file(`${layer}.svg`, svg);
        processedLayers++;
        sendProgress(res, "packaging", 80 + (processedLayers / totalLayers) * 15);
      } catch (e: any) {
        logger.error("layer_render_failed", {
          layer: layerName,
          error: e.message,
        });
        continue;
      }
    }

    sendProgress(res, "packaging", 95);
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Send final event with file as base64
    const base64 = zipBuffer.toString("base64");
    const finalData = JSON.stringify({ step: "complete", progress: 100, file: base64 });
    res.write(`data: ${finalData}\n\n`);
    res.end();

  } catch (err: any) {
    sendProgress(res, "error", 0);
    const errorData = JSON.stringify({ step: "error", progress: 0, error: err?.message || "Export failed" });
    res.write(`data: ${errorData}\n\n`);
    res.end();
    next(err);
  }
});

export default router;
