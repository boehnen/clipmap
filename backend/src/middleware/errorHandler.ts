// backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";
import { metrics } from "../metrics";
import { CONFIG } from "../config";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.statusCode && Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  logger.error("unhandled_error", {
    status,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    message: err.message || "Unknown error",
    stack: CONFIG.isProduction ? undefined : err.stack, // Only log stack in dev
  });

  metrics.recordHttpError(err.message || "unknown");

  if (res.headersSent) return;

  // Don't expose stack traces in production
  const message = status === 500 && CONFIG.isProduction
    ? "Unexpected server error"
    : err.message || "An error occurred";

  res.status(status).json({
    error: status === 500 ? "Internal Server Error" : "Error",
    message,
    ...(CONFIG.isProduction ? {} : { stack: err.stack }), // Only include stack in dev
  });
}
