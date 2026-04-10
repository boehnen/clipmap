// backend/src/config.ts
import os from "os";

// Detect available system memory and calculate reasonable defaults
const totalMemoryMB = Math.floor(os.totalmem() / 1024 / 1024);
const freeMemoryMB = Math.floor(os.freemem() / 1024 / 1024);

// Estimate memory per export request (MB) - based on typical usage
// Large extents with many features can use 150-300MB peak
const DEFAULT_MEMORY_PER_REQUEST_MB = 200;

// Calculate max queue size based on available memory
// Reserve 512MB for system/Node overhead, use remaining for requests
function calculateMaxQueueSize(): number {
  const envValue = process.env.MAX_QUEUE_SIZE;
  if (envValue) {
    return Number(envValue);
  }

  // Auto-calculate: (available memory - overhead) / memory per request
  const availableForRequests = Math.max(0, totalMemoryMB - 512);
  const calculated = Math.floor(availableForRequests / DEFAULT_MEMORY_PER_REQUEST_MB);

  // Clamp to reasonable range (1-20)
  return Math.max(1, Math.min(20, calculated));
}

export const CONFIG = {
  port: Number(process.env.PORT || 4000),

  // CORS configuration
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim().replace(/\/+$/, "")) // Remove trailing slashes
    : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "http://localhost:3001", "http://localhost:3002"],

  // Environment
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",

  overpassEndpoints: [
    process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ],

  overpassTimeoutMs: Number(process.env.OVERPASS_TIMEOUT_MS || 25000),
  overpassMaxRetries: Number(process.env.OVERPASS_MAX_RETRIES || 2),

  logLevel: (process.env.LOG_LEVEL || "info").toLowerCase(),

  // rate limiting (per IP)
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 3_600_000), // 1 hour
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60), // per window per IP

  // Request timeout (ms)
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 300_000), // 5 minutes

  // simple metrics buckets for request durations (ms)
  metricsDurationBuckets: [50, 100, 250, 500, 1000, 2000, 5000],

  // PMTiles configuration
  // REQUIRED in production: set PMTILES_URL to your R2 bucket URL
  // e.g., https://your-bucket.r2.cloudflarestorage.com/basemap.pmtiles
  pmtilesUrl: process.env.PMTILES_URL || "https://build.protomaps.com/20260310.pmtiles",

  // Water tiles R2 URL (base URL without trailing slash)
  // Tiles are at: {tilesBaseUrl}/water-tiles-{X}deg/{lon}_{lat}.geojson
  tilesBaseUrl: process.env.TILES_BASE_URL || "https://pub-67de2abc00c045a1b215f19975a76520.r2.dev",

  // Memory management
  // Total system memory (for logging/monitoring)
  totalMemoryMB,
  // Estimated memory per export request
  memoryPerRequestMB: Number(process.env.MEMORY_PER_REQUEST_MB || DEFAULT_MEMORY_PER_REQUEST_MB),
  // Max queue size (auto-calculated or from env)
  maxQueueSize: calculateMaxQueueSize(),
  // Memory threshold - reject new requests if RSS exceeds this (MB)
  // Default: 80% of total memory or 1.5GB, whichever is smaller
  maxMemoryMB: Number(
    process.env.MAX_MEMORY_MB || Math.min(Math.floor(totalMemoryMB * 0.8), 1536)
  ),
};
