// backend/src/middleware/validateRequest.ts
import { Request, Response, NextFunction } from "express";
import { BBox, MapExportRequest, LayerName } from "../types";
import { logger } from "../logger";

const VALID_LAYERS: Set<LayerName> = new Set([
  "roads",
  "railways",
  "water",
  "buildings",
  "land",
  "parks",
  "labels",
]);

const EXTENT_MAX_DEG = 1;
const MIN_LAT = -90;
const MAX_LAT = 90;
const MIN_LON = -180;
const MAX_LON = 180;

function isValidBBox(bbox: any): bbox is BBox {
  if (!bbox || typeof bbox !== "object") return false;

  const { minLat, minLon, maxLat, maxLon } = bbox;

  // Check all required fields are numbers
  if (
    typeof minLat !== "number" ||
    typeof minLon !== "number" ||
    typeof maxLat !== "number" ||
    typeof maxLon !== "number"
  ) {
    return false;
  }

  // Check valid latitude range
  if (
    minLat < MIN_LAT ||
    minLat > MAX_LAT ||
    maxLat < MIN_LAT ||
    maxLat > MAX_LAT
  ) {
    return false;
  }

  // Check valid longitude range
  if (
    minLon < MIN_LON ||
    minLon > MAX_LON ||
    maxLon < MIN_LON ||
    maxLon > MAX_LON
  ) {
    return false;
  }

  // Check min < max
  if (minLat >= maxLat || minLon >= maxLon) {
    return false;
  }

  // Check extent size
  const latSpan = Math.abs(maxLat - minLat);
  const lonSpan = Math.abs(maxLon - minLon);
  const latMid = (maxLat + minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;

  const normalizedSpanDeg = Math.max(
    latSpan,
    Math.abs(lonSpan * Math.cos(latMidRad))
  );

  if (normalizedSpanDeg > EXTENT_MAX_DEG) {
    return false;
  }

  return true;
}

function isValidLayers(layers: any): layers is LayerName[] {
  if (!Array.isArray(layers)) return false;
  if (layers.length === 0) return false;
  if (layers.length > VALID_LAYERS.size) return false;

  // Check all layers are valid and unique
  const seen = new Set<LayerName>();
  for (const layer of layers) {
    if (typeof layer !== "string") return false;
    if (!VALID_LAYERS.has(layer as LayerName)) return false;
    if (seen.has(layer as LayerName)) return false; // No duplicates
    seen.add(layer as LayerName);
  }

  return true;
}

export function validateExportRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const body = req.body as MapExportRequest;

  if (!isValidBBox(body.bbox)) {
    logger.warn("invalid_bbox", {
      requestId: req.requestId,
      bbox: body.bbox,
    });

    return res.status(400).json({
      error: "Invalid Bounding Box",
      message: "Bounding box must be valid coordinates with min < max and extent <= 6 degrees.",
    });
  }

  if (!isValidLayers(body.layers)) {
    logger.warn("invalid_layers", {
      requestId: req.requestId,
      layers: body.layers,
    });

    return res.status(400).json({
      error: "Invalid Layers",
      message: "Layers must be a non-empty array of valid layer names with no duplicates.",
    });
  }

  next();
}

