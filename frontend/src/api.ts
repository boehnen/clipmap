import axios from "axios";
import type { MapExportRequest } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export interface ExportProgress {
  step: string;
  progress?: number;
  file?: string;
  error?: string;
}

// Map backend steps to friendly user-facing messages
function getFriendlyStepName(step: string): string {
  const stepMap: Record<string, string> = {
    "starting": "🌍 Preparing your map...",
    "fetching_water_land": "🌊 Gathering land and water data...",
    "fetching_parks": "🌳 Finding parks and green spaces...",
    "fetching_roads": "🛣️ Collecting road networks...",
    "fetching_railways": "🚂 Locating railway lines...",
    "fetching_buildings": "🏢 Discovering buildings...",
    "fetching_labels": "🏷️ Gathering place names...",
    "clipping_parks": "✂️ Trimming parks to land boundaries...",
    "rendering_water": "💧 Drawing water features...",
    "rendering_land": "🌍 Drawing land areas...",
    "rendering_parks": "🌳 Drawing parks...",
    "rendering_roads": "🛣️ Drawing roads...",
    "rendering_railways": "🚂 Drawing railways...",
    "rendering_buildings": "🏢 Drawing buildings...",
    "rendering_labels": "🏷️ Placing labels...",
    "optimizing": "✨ Optimizing file sizes...",
    "packaging": "📦 Creating your download...",
    "complete": "✅ All done!",
    "error": "❌ Something went wrong",
  };
  return stepMap[step] || step;
}

export function exportZipWithProgress(
  payload: MapExportRequest,
  onProgress: (progress: ExportProgress) => void
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(`${API_BASE_URL}/export-zip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = line.slice(6);
              const progress: ExportProgress = JSON.parse(data);
              const originalStep = progress.step;
              progress.step = getFriendlyStepName(originalStep);
              onProgress(progress);

              if (originalStep === "complete" && progress.file) {
                // Convert base64 to blob
                const binaryString = atob(progress.file);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: "application/zip" });
                resolve(blob);
                return;
              } else if (originalStep === "error" || progress.error) {
                reject(new Error(progress.error || "Export failed"));
                return;
              }
            } catch (e) {
              console.error("Error parsing progress event:", e);
            }
          }
        }
      }

      reject(new Error("Export stream ended unexpectedly"));
    } catch (error: any) {
      reject(error);
    }
  });
}

// Legacy function for backwards compatibility (not used anymore)
export async function exportZip(payload: MapExportRequest): Promise<Blob> {
  const resp = await axios.post(`${API_BASE_URL}/export-zip`, payload, {
    responseType: "blob",
  });
  return resp.data;
}
