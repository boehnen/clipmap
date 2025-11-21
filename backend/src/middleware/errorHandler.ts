// backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from "express";
import { logger } from "../logger";
import { metrics } from "../metrics";

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.statusCode && Number.isInteger(err.statusCode)
    ? err.statusCode
    : 500;

  logger.error("unhandled_error", {
    status,
    message: err.message || "Unknown error",
    stack: err.stack,
  });

  metrics.recordHttpError(err.message || "unknown");

  if (res.headersSent) return;

  res.status(status).json({
    error: "Internal Server Error",
    message: status === 500 ? "Unexpected server error" : err.message,
  });
}
