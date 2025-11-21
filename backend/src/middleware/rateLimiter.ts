// backend/src/middleware/rateLimiter.ts
import { Request, Response, NextFunction } from "express";
import { CONFIG } from "../config";
import { logger } from "../logger";

type Entry = {
  count: number;
  windowStart: number;
};

const buckets = new Map<string, Entry>();

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";

  const now = Date.now();
  const windowMs = CONFIG.rateLimitWindowMs;
  const maxReq = CONFIG.rateLimitMaxRequests;

  const entry = buckets.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    buckets.set(ip, { count: 1, windowStart: now });
    return next();
  }

  entry.count += 1;

  if (entry.count > maxReq) {
    const retryAfterSec = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    logger.warn("rate_limit_exceeded", { ip, count: entry.count });

    res.setHeader("Retry-After", String(retryAfterSec));
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    });
  }

  return next();
}
