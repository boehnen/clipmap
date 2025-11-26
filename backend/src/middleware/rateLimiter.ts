// backend/src/middleware/rateLimiter.ts
import { Request, Response, NextFunction } from "express";
import { CONFIG } from "../config";
import { logger } from "../logger";

type Entry = {
  count: number;
  windowStart: number;
};

const buckets = new Map<string, Entry>();

// Clean up old buckets periodically to prevent unbounded growth
// Run cleanup every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupOldBuckets() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  
  const windowMs = CONFIG.rateLimitWindowMs;
  let removed = 0;
  
  for (const [ip, entry] of buckets.entries()) {
    if (now - entry.windowStart > windowMs * 2) {
      // Remove entries older than 2 windows
      buckets.delete(ip);
      removed++;
    }
  }
  
  lastCleanup = now;
  
  // Limit total bucket count to prevent memory issues
  if (buckets.size > 10000) {
    // If we have too many buckets, remove oldest 20%
    const entries = Array.from(buckets.entries())
      .map(([ip, entry]) => ({ ip, windowStart: entry.windowStart }))
      .sort((a, b) => a.windowStart - b.windowStart);
    
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      buckets.delete(entries[i].ip);
    }
  }
}

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  // Cleanup old buckets periodically
  cleanupOldBuckets();
  
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
