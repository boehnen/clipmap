// backend/src/routes/healthRoute.ts
import express from "express";
import os from "os";

const router = express.Router();
const startedAt = Date.now();

// Liveness probe - is the server running?
router.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Readiness probe - is the server ready to accept requests?
router.get("/readyz", (_req, res) => {
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);
  const memUsage = process.memoryUsage();

  // Check if memory usage is reasonable (warn if > 1GB)
  const memUsageMB = memUsage.rss / 1024 / 1024;
  const isReady = memUsageMB < 2048; // 2GB threshold

  if (!isReady) {
    return res.status(503).json({
      status: "not ready",
      reason: "high_memory_usage",
      memoryMB: Math.round(memUsageMB),
    });
  }

  res.status(200).json({
    status: "ready",
    uptimeSec,
    pid: process.pid,
    memory: {
      rss: Math.round(memUsageMB),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    },
    hostname: os.hostname(),
  });
});

export default router;
