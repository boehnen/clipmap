// backend/src/middleware/requestTimeout.ts
import { Request, Response, NextFunction } from "express";
import { CONFIG } from "../config";
import { logger } from "../logger";

export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  const timeout = CONFIG.requestTimeoutMs;
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      logger.warn("request_timeout", {
        method: req.method,
        path: req.path,
        requestId: req.requestId,
        timeoutMs: timeout,
      });

      res.status(408).json({
        error: "Request Timeout",
        message: "The request took too long to process.",
      });
    }
  }, timeout);

  // Clear timeout when response finishes
  res.on("finish", () => {
    clearTimeout(timer);
  });

  next();
}

