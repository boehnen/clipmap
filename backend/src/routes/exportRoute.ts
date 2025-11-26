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
import { exportQueue } from "../queue/exportQueue";
import { validateExportRequest } from "../middleware/validateRequest";

const router = express.Router();

// Helper to send SSE progress event
function sendProgress(
  res: express.Response,
  step: string,
  progress?: number,
  queuePosition?: number
): boolean {
  if (res.closed || res.destroyed) {
    return false;
  }
  
  const data: any = { step, progress };
  if (queuePosition !== undefined) {
    data.queuePosition = queuePosition;
  }
  
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (err) {
    // Connection closed, can't send
    return false;
  }
}

// Send keepalive comment to prevent connection timeout
function sendKeepalive(res: express.Response): boolean {
  if (res.closed || res.destroyed) {
    return false;
  }
  
  try {
    res.write(`: keepalive\n\n`);
    return true;
  } catch (err) {
    return false;
  }
}

router.post("/export-zip", validateExportRequest, async (req, res, next) => {
  const body = req.body as MapExportRequest;

  // Get client IP address
  const clientIp = req.ip || req.socket.remoteAddress || "unknown";

  // Check if this IP already has a request in the queue
  if (exportQueue.hasRequestFromIp(clientIp)) {
    logger.warn("queue_duplicate_request_from_ip", { clientIp });
    return res.status(429).json({
      error: "Request Already Queued",
      message: "You already have an export request in the queue. Please wait for it to complete.",
    });
  }

  // Generate a unique request ID for tracking
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Set up SSE headers and send them immediately to establish connection
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  
  // Send headers immediately by writing status code
  // This establishes the SSE connection before we do anything else
  if (!res.headersSent) {
    res.writeHead(200);
  }
  
  // Send initial SSE comment to establish connection immediately
  // This flushes headers and opens the SSE stream
  try {
    res.write(`: connection established\n\n`);
  } catch (err) {
    // Connection failed immediately - return error
    logger.warn("queue_sse_connection_failed_immediately", { requestId, error: err });
    return res.status(500).json({ error: "Failed to establish SSE connection" });
  }

  // Track connection state
  let isConnected = true;
  let keepaliveInterval: NodeJS.Timeout | null = null;
  let isProcessing = false;
  let cleanupCalled = false;
  let sseEstablished = true; // Connection is established once we write

  // Cleanup function - removes from queue if waiting, but continues processing if started
  const cleanup = () => {
    if (cleanupCalled) {
      return;
    }
    cleanupCalled = true;
    
    isConnected = false;
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
    
    // Remove from queue if waiting (but NOT if already processing)
    if (!isProcessing && sseEstablished) {
      exportQueue.remove(requestId);
      logger.info("queue_request_removed_on_disconnect", { requestId });
    }
  };

  // Callback to notify client when queue position changes
  const onPositionChange = (newPosition: number) => {
    if (!isConnected || res.closed || res.destroyed) {
      return;
    }
    
    if (newPosition === 0) {
      sendProgress(res, "starting", 0, 0);
    } else {
      sendProgress(res, "queued", 0, newPosition);
    }
  };

  // Add request to queue with position change callback (include client IP)
  const initialPosition = exportQueue.enqueue(requestId, body.bbox, body.layers, clientIp, onPositionChange);
  
  logger.info("queue_request_enqueued", {
    requestId,
    position: initialPosition,
    queueLength: exportQueue.getLength(),
    isProcessing: exportQueue.getStatus().isProcessing,
  });

  // Send initial position - this establishes the SSE connection
  let initialMessageSent = false;
  if (initialPosition === 0) {
    initialMessageSent = sendProgress(res, "starting", 0, 0);
  } else {
    initialMessageSent = sendProgress(res, "queued", 0, initialPosition);
  }
  
  // If we couldn't send initial message, connection is broken - remove from queue
  if (!initialMessageSent) {
    exportQueue.remove(requestId);
    logger.warn("queue_request_failed_initial_send", { 
      requestId,
      resClosed: res.closed,
      resDestroyed: res.destroyed,
    });
    if (!res.closed) {
      res.end();
    }
    cleanup();
    return;
  }
  
  // SSE connection is fully established - start keepalive
  keepaliveInterval = setInterval(() => {
    if (!sendKeepalive(res) || res.closed || res.destroyed) {
      cleanup();
    }
  }, 30000);
  
  // Register disconnect handlers
  // NOTE: For SSE, req.on("close") fires immediately after Express reads the POST body - that's normal!
  // We should NOT listen to req.on("close") as it's a false positive.
  // We only care about res.on("close") which indicates the client disconnected from the SSE stream
  // We also check req.on("aborted") which means the client explicitly cancelled the request
  
  req.on("aborted", () => {
    // Client explicitly cancelled the request
    if (!cleanupCalled && sseEstablished && !isProcessing) {
      logger.info("queue_client_disconnected_req_aborted", { requestId });
      cleanup();
    }
  });
  
  res.on("close", () => {
    // Response stream closed - client disconnected from SSE
    if (!cleanupCalled && sseEstablished && !isProcessing) {
      logger.info("queue_client_disconnected_res_close", { requestId });
      cleanup();
    }
  });
  
  // Also check if response errors
  res.on("error", (err: any) => {
    if (!cleanupCalled && sseEstablished && !isProcessing) {
      logger.warn("queue_response_error", { requestId, error: err?.message });
      cleanup();
    }
  });

  // Wait until this request reaches position 0 (or gets removed externally)
  let lastPosition = initialPosition;
  
  while (true) {
    // Check connection state first
    if (!isConnected || res.closed || res.destroyed) {
      // Connection lost - cleanup already called, just exit
      return;
    }
    
    // Check if request still exists in queue
    const currentPosition = exportQueue.getPosition(requestId);
    if (currentPosition === null) {
      // Request was removed from queue
      cleanup();
      if (!res.closed) {
        res.end();
      }
      return;
    }

    // Check if we reached position 0
    if (currentPosition === 0) {
      // Try to dequeue - this is atomic
      const queued = exportQueue.dequeue();
      
      if (queued?.requestId === requestId) {
        // Success! We're now processing
        isProcessing = true;
        logger.info("queue_request_processing", { requestId });
        
        // Send starting message if still connected
        if (isConnected && !res.closed && !res.destroyed) {
          sendProgress(res, "starting", 0, 0);
        }
        break;
      } else if (queued) {
        // Someone else got dequeued - wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      } else {
        // No one could be dequeued - wait and check again
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }
    }

    // Update position if it changed (backup in case callback didn't fire)
    if (currentPosition !== lastPosition) {
      lastPosition = currentPosition;
      if (isConnected && !res.closed && !res.destroyed) {
        if (currentPosition === 0) {
          sendProgress(res, "starting", 0, 0);
        } else {
          sendProgress(res, "queued", 0, currentPosition);
        }
      }
    }

    // Wait before checking again (shorter wait when close to position 0)
    const waitTime = currentPosition <= 1 ? 200 : 500;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  // Stop keepalive interval - we're processing now
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }

  // Verify we're actually processing
  if (!exportQueue.isProcessing(requestId)) {
    logger.error("queue_not_processing_after_dequeue", {
      requestId,
      status: exportQueue.getStatus(),
    });
    if (!res.closed) {
      res.end();
    }
    cleanup();
    return;
  }

  // Now process the export
  try {
    const { bbox, layers } = body;

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
      // Check if client disconnected or request was cancelled
      if (!isConnected || res.closed || res.destroyed || !exportQueue.isProcessing(requestId)) {
        logger.info("queue_request_stopped_during_processing", { requestId, stage: "fetching_water_land" });
        cleanup();
        if (!res.closed) {
          res.end();
        }
        exportQueue.complete();
        return;
      }
      
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

        if (isConnected && !res.closed && !res.destroyed) {
          if (waterSvg) {
            sendProgress(res, "rendering_water", 20);
          }
          if (landSvg) {
            sendProgress(res, "rendering_land", 25);
          }
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

      // Check if client disconnected or request was cancelled
      if (!isConnected || res.closed || res.destroyed || !exportQueue.isProcessing(requestId)) {
        logger.info("queue_request_stopped_during_processing", { requestId, stage: `processing_${layer}` });
        cleanup();
        if (!res.closed) {
          res.end();
        }
        exportQueue.complete();
        return;
      }

      try {
        if (layer === "water" && waterSvgFromUnion) {
          zip.file("water.svg", waterSvgFromUnion);
          processedLayers++;
          if (isConnected && !res.closed && !res.destroyed) {
            sendProgress(res, "packaging", 30 + (processedLayers / totalLayers) * 60);
          }
          continue;
        }

        if (layer === "land" && landSvgFromUnion) {
          zip.file("land.svg", landSvgFromUnion);
          processedLayers++;
          if (isConnected && !res.closed && !res.destroyed) {
            sendProgress(res, "packaging", 30 + (processedLayers / totalLayers) * 60);
          }
          continue;
        }

        // Send fetching progress
        const fetchStep = `fetching_${layer}`;
        if (isConnected && !res.closed && !res.destroyed) {
          sendProgress(res, fetchStep, 30 + (processedLayers / totalLayers) * 30);
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

        // Convert to WebMercator
        let features: ProjectedFeature[] = rawFeatures.map(
          ({ coords, tags, role, relationId }) => ({
            coords: coords.map(([lat, lon]) => lonLatToWebMercator(lon, lat)),
            tags,
            role,
            relationId,
          })
        );

        // Clear rawFeatures after conversion to free memory
        rawFeatures = [];
        
        // Clip parks to land if land features are available
        if (layer === "parks" && landFeaturesForClipping && landFeaturesForClipping.length > 0) {
          if (isConnected && !res.closed && !res.destroyed) {
            sendProgress(res, "clipping_parks", 40 + (processedLayers / totalLayers) * 20);
          }
          features = clipParksToLand(features, landFeaturesForClipping);
        }

        // Send rendering progress
        const renderStep = `rendering_${layer}`;
        if (isConnected && !res.closed && !res.destroyed) {
          sendProgress(res, renderStep, 50 + (processedLayers / totalLayers) * 20);
        }

        let svg = generateSvgForLayer(
          layer,
          features,
          bboxMercator,
          canvas,
          detail
        );

        // Clear features after rendering to free memory
        features = [];

        // Optimize SVG size to stay under 3MB
        if (isConnected && !res.closed && !res.destroyed) {
          sendProgress(res, "optimizing", 70 + (processedLayers / totalLayers) * 10);
        }
        svg = optimizeSvgSize(svg);

        zip.file(`${layer}.svg`, svg);
        processedLayers++;
        if (isConnected && !res.closed && !res.destroyed) {
          sendProgress(res, "packaging", 80 + (processedLayers / totalLayers) * 15);
        }
      } catch (e: any) {
        logger.error("layer_render_failed", {
          layer: layerName,
          error: e.message,
        });
        continue;
      }
    }

    if (isConnected && !res.closed && !res.destroyed) {
      sendProgress(res, "packaging", 95);
    }
    
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    // Send final event with file as base64 (only if still connected)
    if (isConnected && !res.closed && !res.destroyed) {
      const base64 = zipBuffer.toString("base64");
      const finalData = JSON.stringify({ step: "complete", progress: 100, file: base64 });
      res.write(`data: ${finalData}\n\n`);
      res.end();
    } else {
      // Client disconnected, but we still finished processing
      logger.info("queue_request_completed_but_client_disconnected", { requestId });
      res.end();
    }

    // Mark request as complete (allows next request to process)
    logger.info("queue_request_completed", { 
      requestId,
      queueLength: exportQueue.getLength(),
    });
    exportQueue.complete();

  } catch (err: any) {
    logger.error("export_request_failed", {
      requestId,
      error: err.message,
      stack: err.stack,
    });

    // Mark request as complete even on error
    exportQueue.complete();

    if (isConnected && !res.closed && !res.destroyed) {
      sendProgress(res, "error", 0);
      const errorData = JSON.stringify({ step: "error", progress: 0, error: err?.message || "Export failed" });
      res.write(`data: ${errorData}\n\n`);
      res.end();
    } else {
      res.end();
    }
  } finally {
    cleanup();
  }
});

export default router;