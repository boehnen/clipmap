import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { CONFIG } from "./config";
import { logger } from "./logger";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler } from "./middleware/errorHandler";
import { rateLimiter } from "./middleware/rateLimiter";
import exportRouter from "./routes/exportRoute";
import healthRouter from "./routes/healthRoute";
import metricsRouter from "./routes/metricsRoute";

const app = express();

app.set("trust proxy", true);

// --- CORS ---
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// --- Core middleware ---
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

app.listen(CONFIG.port, () => {
  logger.info("server_started", {
    port: CONFIG.port,
  });
});
