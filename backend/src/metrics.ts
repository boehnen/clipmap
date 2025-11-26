// backend/src/metrics.ts
import { CONFIG } from "./config";
import { writeMetricsSnapshot } from "./fileLogger";

type Labels = Record<string, string>;

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map(k => `${k}="${labels[k]}"`).join(",");
}

class Counter {
  private data = new Map<string, number>();

  inc(labels: Labels = {}, value = 1) {
    const key = labelKey(labels);
    const prev = this.data.get(key) ?? 0;
    this.data.set(key, prev + value);
  }

  toPrometheus(name: string, help: string): string {
    let out = `# HELP ${name} ${help}\n# TYPE ${name} counter\n`;
    for (const [key, value] of this.data.entries()) {
      const labelPart = key ? `{${key}}` : "";
      out += `${name}${labelPart} ${value}\n`;
    }
    return out;
  }
}

class Histogram {
  private buckets = CONFIG.metricsDurationBuckets;
  private counts = new Map<string, number[]>();
  private sum = new Map<string, number>();
  private total = new Map<string, number>();

  observe(labels: Labels = {}, value: number) {
    const key = labelKey(labels);
    if (!this.counts.has(key)) {
      this.counts.set(key, new Array(this.buckets.length).fill(0));
      this.sum.set(key, 0);
      this.total.set(key, 0);
    }
    const arr = this.counts.get(key)!;
    let idx = this.buckets.findIndex(b => value <= b);
    if (idx === -1) idx = this.buckets.length - 1;
    arr[idx] += 1;

    this.sum.set(key, (this.sum.get(key) ?? 0) + value);
    this.total.set(key, (this.total.get(key) ?? 0) + 1);
  }

  toPrometheus(name: string, help: string): string {
    let out = `# HELP ${name} ${help}\n# TYPE ${name} histogram\n`;
    for (const [key, arr] of this.counts.entries()) {
      const baseLabels = key ? `${key},` : "";
      let cumulative = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        cumulative += arr[i];
        const le = this.buckets[i];
        out += `${name}_bucket{${baseLabels}le="${le}"} ${cumulative}\n`;
      }
      const total = this.total.get(key) ?? 0;
      const sum = this.sum.get(key) ?? 0;
      out += `${name}_bucket{${baseLabels}le="+Inf"} ${total}\n`;
      out += `${name}_sum{${key}} ${sum}\n`;
      out += `${name}_count{${key}} ${total}\n`;
    }
    return out;
  }
}

const httpRequestsTotal = new Counter();
const httpErrorsTotal = new Counter();
const httpRequestDurationMs = new Histogram();
const overpassRequestsTotal = new Counter();

export const metrics = {
  recordHttpRequest(method: string, path: string, status: number, durationMs: number) {
    httpRequestsTotal.inc({ method, path, status: String(status) });
    httpRequestDurationMs.observe({ method, path }, durationMs);
    if (status >= 500) {
      httpErrorsTotal.inc({ method, path, status: String(status) });
    }
  },

  recordHttpError(reason: string) {
    httpErrorsTotal.inc({ reason });
  },

  recordOverpassRequest(layer: string, endpoint: string, status: number) {
    overpassRequestsTotal.inc({
      layer,
      endpoint,
      status: String(status),
    });
  },

  toPrometheus(): string {
    let out = "";
    out += httpRequestsTotal.toPrometheus(
      "clipmap_http_requests_total",
      "Total HTTP requests"
    );
    out += "\n";
    out += httpErrorsTotal.toPrometheus(
      "clipmap_http_errors_total",
      "Total HTTP errors (5xx + internal)"
    );
    out += "\n";
    out += httpRequestDurationMs.toPrometheus(
      "clipmap_http_request_duration_ms",
      "HTTP request duration in milliseconds"
    );
    out += "\n";
    out += overpassRequestsTotal.toPrometheus(
      "clipmap_overpass_requests_total",
      "Overpass requests by layer/endpoint/status"
    );
    
    // Write metrics snapshot to files
    writeMetricsSnapshot(out);
    
    return out;
  },
};
