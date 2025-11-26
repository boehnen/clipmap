// backend/src/index.ts
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { LOGS_DIR, METRICS_DIR } from "./fileLogger";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimiter } from "./middleware/rateLimiter";
import { securityHeaders } from "./middleware/securityHeaders";
import { requestId } from "./middleware/requestId";
import { requestTimeout } from "./middleware/requestTimeout";
import exportRouter from "./routes/exportRoute";
import healthRouter from "./routes/healthRoute";
import metricsRouter from "./routes/metricsRoute";
import { metrics } from "./metrics";

const app = express();

app.set("trust proxy", true);

// --- CORS ---
app.use(
  cors({
    origin: CONFIG.corsOrigins,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: false,
  })
);

// --- Core middleware ---
app.use(requestId); // Must be first to add request ID
app.use(securityHeaders);
app.use(requestTimeout);
app.use(bodyParser.json({ limit: "1mb" }));
app.use(rateLimiter);
app.use(requestLogger);

// --- Routes ---
app.use("/", healthRouter);
app.use("/", metricsRouter);
app.use("/", exportRouter);

// --- Error handler ---
app.use(errorHandler);

// --- Process-level error logging ---
process.on("unhandledRejection", (reason: any) => {
  logger.error("unhandled_rejection", {
    message: reason && reason.message,
    stack: reason && reason.stack,
  });
});

process.on("uncaughtException", (err: any) => {
  logger.error("uncaught_exception", {
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Periodic metrics snapshots (every minute)
const metricsInterval = setInterval(() => {
  metrics.toPrometheus(); // This triggers writeMetricsSnapshot
}, 60 * 1000); // Every minute

// Graceful shutdown handler
let server: ReturnType<typeof app.listen> | null = null;

function gracefulShutdown(signal: string) {
  logger.info("shutdown_initiated", { signal });

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      logger.info("server_closed", { signal });

      // Clear intervals
      clearInterval(metricsInterval);

      // Give time for in-flight requests to complete
      setTimeout(() => {
        logger.info("shutdown_complete", { signal });
        process.exit(0);
      }, 5000); // 5 second grace period
    });
  } else {
    process.exit(0);
  }
}

// Handle shutdown signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

server = app.listen(CONFIG.port, () => {
  logger.info("server_started", {
    port: CONFIG.port,
    nodeEnv: CONFIG.nodeEnv,
    logLevel: CONFIG.logLevel,
    logOutput: `files: ${LOGS_DIR}`,
    logFormat: "JSON",
    dailyLogs: "app-YYYY-MM-DD.log (last 10 days)",
    metricsLogs: `${METRICS_DIR} (1h, 3h, 6h, 1d, 1w, 1mo, all)`,
    metricsSnapshotInterval: "60s",
  });
});
