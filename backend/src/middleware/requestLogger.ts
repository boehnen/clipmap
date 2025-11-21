import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";
import { metrics } from "../metrics";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;

    const method = req.method;
    const path = req.route?.path || req.originalUrl;
    const status = res.statusCode;

    logger.info("http_request", {
      method,
      path,
      status,
      durationMs: Math.round(durationMs * 10) / 10,
    });

    metrics.recordHttpRequest(method, path, status, durationMs);
  });

  next();
}
