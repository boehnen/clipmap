import { CONFIG } from "./config";

type Level = "debug" | "info" | "warn" | "error";

const levelOrder: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel = ((): Level => {
  const raw = CONFIG.logLevel as Level;
  if (raw in levelOrder) return raw;
  return "info";
})();

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (levelOrder[level] < levelOrder[minLevel]) return;

  const entry = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...meta,
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(entry));
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
