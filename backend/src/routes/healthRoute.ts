import express from "express";
import os from "os";

const router = express.Router();
const startedAt = Date.now();

router.get("/healthz", (_req, res) => {
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);

  res.json({
    status: "ok",
    uptimeSec,
    pid: process.pid,
    memory: process.memoryUsage().rss,
    hostname: os.hostname(),
  });
});

export default router;
