// backend/src/routes/metricsRoute.ts
import express from "express";
import { metrics } from "../metrics";

const router = express.Router();

router.get("/metrics", (_req, res) => {
  const body = metrics.toPrometheus();
  res.setHeader("Content-Type", "text/plain; version=0.0.4");
  res.send(body);
});

export default router;
