import express from "express";
import JSZip from "jszip";
import { MapExportRequest, RawWay, ProjectedFeature } from "../types";
import { lonLatToWebMercator, autoCanvasFromMercator } from "../geo/projection";
import { fetchOsmLayer } from "../osm/layers";
import { fetchWaterPolygons } from "../osm/water";
import { fetchParkPolygons } from "../osm/parks";
import { generateSvgForLayer } from "../svg/renderer";
import { logger } from "../logger";

const router = express.Router();

router.post("/export-zip", async (req, res, next) => {
  const body = req.body as MapExportRequest;

  logger.info("export_request_received", {
    bbox: body.bbox,
    layers: body.layers.map(l => l.name),
  });

  try {
    const { bbox, layers } = body;
    const { minLat, minLon, maxLat, maxLon } = bbox;

    const [minx, miny] = lonLatToWebMercator(minLon, minLat);
    const [maxx, maxy] = lonLatToWebMercator(maxLon, maxLat);
    const bboxMercator = { minx, maxx, miny, maxy };
    const canvas = autoCanvasFromMercator(minx, miny, maxx, maxy);

    const zip = new JSZip();

    for (const layer of layers) {
      if (!layer.visible) continue;

      try {
        let rawFeatures: RawWay[];

        if (layer.name === "water") {
          rawFeatures = await fetchWaterPolygons(
            [minLat, minLon, maxLat, maxLon]
          );
        } else if (layer.name === "parks") {
          rawFeatures = await fetchParkPolygons(
            [minLat, minLon, maxLat, maxLon]
          );
        } else if (layer.name === "land") {
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
        } else {
          rawFeatures = await fetchOsmLayer(
            [minLat, minLon, maxLat, maxLon],
            layer.name
          );
        }

        logger.info("layer_render_start", {
          layer: layer.name,
          featureCount: rawFeatures.length,
        });

        const features: ProjectedFeature[] = rawFeatures.map(({ coords, tags }) => ({
          coords: coords.map(([lat, lon]) => lonLatToWebMercator(lon, lat)),
          tags,
        }));

        const svg = generateSvgForLayer(
          layer.name,
          features,
          bboxMercator,
          canvas
        );

        zip.file(`${layer.name}.svg`, svg);
      } catch (e: any) {
        logger.error("layer_render_failed", {
          layer: layer.name,
          error: e.message,
        });
        continue;
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="clipmap_layers.zip"');
    res.send(zipBuffer);

    logger.info("export_request_completed", { bbox, layers: layers.map(l => l.name) });
  } catch (err) {
    next(err);
  }
});

export default router;
