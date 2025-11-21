import axios from "axios";
import type { MapExportRequest } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export async function exportZip(payload: MapExportRequest): Promise<Blob> {
  const resp = await axios.post(`${API_BASE_URL}/export-zip`, payload, {
    responseType: "blob",
  });
  return resp.data;
}
