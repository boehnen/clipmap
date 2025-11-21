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
import { generateWaterAndLandSvgs } from "../svg/waterLand";
import { logger } from "../logger";

const router = express.Router();

// Must match frontend extent limit
const EXTENT_MAX_DEG = 13;

function isExtentTooLarge(bbox: BBox): boolean {
  const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
  const lonSpan = Math.abs(bbox.maxLon - bbox.minLon);
  const latMid = (bbox.maxLat + bbox.minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;

  const normalizedSpanDeg = Math.max(
    latSpan,
    Math.abs(lonSpan * Math.cos(latMidRad))
  );

  return normalizedSpanDeg > EXTENT_MAX_DEG;
}

router.post("/export-zip", async (req, res, next) => {
  const body = req.body as MapExportRequest;

  logger.info("export_request_received", {
    bbox: body.bbox,
    layers: body.layers,
  });

  try {
    const { bbox, layers } = body;

    if (isExtentTooLarge(bbox)) {
      return res.status(400).json({
        error: "Extent too large",
        message: "Selected area is too large. Please zoom in and try again.",
      });
    }

    const { minLat, minLon, maxLat, maxLon } = bbox;

    const [minx, miny] = lonLatToWebMercator(minLon, minLat);
    const [maxx, maxy] = lonLatToWebMercator(maxLon, maxLat);
    const bboxMercator = { minx, maxx, miny, maxy };
    const canvas = autoCanvasFromMercator(minx, miny, maxx, maxy);

    const zip = new JSZip();

    const needWaterOrLand =
      layers.includes("water") || layers.includes("land");

    let waterSvgFromUnion: string | undefined;
    let landSvgFromUnion: string | undefined;

    if (needWaterOrLand) {
      try {
        const rawWater: RawWay[] = await fetchWaterPolygons([
          minLat,
          minLon,
          maxLat,
          maxLon,
        ]);

        const waterFeatures: ProjectedFeature[] = rawWater.map(
          ({ coords, tags, role, relationId }) => ({
            coords: coords.map(([lat, lon]) => lonLatToWebMercator(lon, lat)),
            tags,
            role,
            relationId,
          })
        );

        const { waterSvg, landSvg } = generateWaterAndLandSvgs(
          waterFeatures,
          bboxMercator,
          canvas
        );

        waterSvgFromUnion = waterSvg;
        landSvgFromUnion = landSvg;

        logger.info("water_land_union_built", {
          waterFeatures: waterFeatures.length,
          hasWaterSvg: !!waterSvgFromUnion,
          hasLandSvg: !!landSvgFromUnion,
        });
      } catch (e: any) {
        logger.error("water_land_union_failed", {
          error: e.message,
        });
      }
    }

    for (const layerName of layers) {
      const layer: LayerName = layerName;

      try {
        if (layer === "water" && waterSvgFromUnion) {
          zip.file("water.svg", waterSvgFromUnion);
          continue;
        }

        if (layer === "land" && landSvgFromUnion) {
          zip.file("land.svg", landSvgFromUnion);
          continue;
        }

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

        logger.info("layer_render_start", {
          layer,
          featureCount: rawFeatures.length,
        });

        const features: ProjectedFeature[] = rawFeatures.map(
          ({ coords, tags, role, relationId }) => ({
            coords: coords.map(([lat, lon]) => lonLatToWebMercator(lon, lat)),
            tags,
            role,
            relationId,
          })
        );

        const svg = generateSvgForLayer(
          layer,
          features,
          bboxMercator,
          canvas
        );

        zip.file(`${layer}.svg`, svg);
      } catch (e: any) {
        logger.error("layer_render_failed", {
          layer: layerName,
          error: e.message,
        });
        continue;
      }
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="clipmap_layers.zip"'
    );
    res.send(zipBuffer);

    logger.info("export_request_completed", {
      bbox,
      layers,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
