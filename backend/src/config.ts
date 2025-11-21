export const CONFIG = {
  port: Number(process.env.PORT || 4000),

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

  // simple metrics buckets for request durations (ms)
  metricsDurationBuckets: [50, 100, 250, 500, 1000, 2000, 5000],
};
