// backend/src/fileLogger.ts
// File-based logging with rotation and cleanup

import * as fs from "fs";
import * as path from "path";

const LOGS_DIR = path.join(process.cwd(), "logs");
const METRICS_DIR = path.join(LOGS_DIR, "metrics");

// Ensure directories exist
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}
if (!fs.existsSync(METRICS_DIR)) {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
}

type Level = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: Level;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

// Get current log file path (daily rotation)
function getLogFilePath(): string {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return path.join(LOGS_DIR, `app-${today}.log`);
}

// Write log entry to file
function writeLogEntry(entry: LogEntry) {
  const filePath = getLogFilePath();
  const line = JSON.stringify(entry) + "\n";
  
  try {
    fs.appendFileSync(filePath, line, "utf8");
  } catch (err) {
    // Fallback to console if file write fails
    // eslint-disable-next-line no-console
    console.error("Failed to write log file:", err);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  }
}

// Clean up old daily log files (keep last 10 days)
function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    const logFiles = files.filter(f => f.startsWith("app-") && f.endsWith(".log"));
    
    if (logFiles.length <= 10) return;
    
    // Sort by filename (which includes date)
    logFiles.sort().reverse();
    
    // Keep last 10, delete the rest
    const toDelete = logFiles.slice(10);
    for (const file of toDelete) {
      const filePath = path.join(LOGS_DIR, file);
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        // Ignore deletion errors
      }
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Metrics snapshot file paths
function getMetricsFilePath(period: string): string {
  return path.join(METRICS_DIR, `metrics-${period}.log`);
}

// Write metrics snapshot
export function writeMetricsSnapshot(metricsData: string) {
  const now = Date.now();
  const entry = {
    ts: new Date().toISOString(),
    timestamp: now,
    metrics: metricsData,
  };
  
  const line = JSON.stringify(entry) + "\n";
  
  // Write to all period files
  const periods = ["1h", "3h", "6h", "1d", "1w", "1mo", "all"];
  for (const period of periods) {
    const filePath = getMetricsFilePath(period);
    try {
      fs.appendFileSync(filePath, line, "utf8");
    } catch (err) {
      // Ignore write errors for individual files
    }
  }
  
  // Clean up old metrics entries based on retention
  cleanupOldMetrics();
}

// Clean up old metrics entries
function cleanupOldMetrics() {
  const now = Date.now();
  const retention: Record<string, number> = {
    "1h": 60 * 60 * 1000,        // 1 hour
    "3h": 3 * 60 * 60 * 1000,   // 3 hours
    "6h": 6 * 60 * 60 * 1000,   // 6 hours
    "1d": 24 * 60 * 60 * 1000,  // 1 day
    "1w": 7 * 24 * 60 * 60 * 1000, // 1 week
    "1mo": 30 * 24 * 60 * 60 * 1000, // 1 month
    "all": Infinity, // Never delete
  };
  
  for (const [period, maxAge] of Object.entries(retention)) {
    if (maxAge === Infinity) continue;
    
    const filePath = getMetricsFilePath(period);
    if (!fs.existsSync(filePath)) continue;
    
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      const cutoff = now - maxAge;
      
      const validLines = lines.filter(line => {
        try {
          const entry = JSON.parse(line);
          return entry.timestamp >= cutoff;
        } catch {
          return false;
        }
      });
      
      if (validLines.length < lines.length) {
        fs.writeFileSync(filePath, validLines.join("\n") + (validLines.length > 0 ? "\n" : ""), "utf8");
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  }
}

// Run cleanup on startup and then daily
cleanupOldLogs();
setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000); // Daily

export { writeLogEntry, getLogFilePath, LOGS_DIR, METRICS_DIR };

