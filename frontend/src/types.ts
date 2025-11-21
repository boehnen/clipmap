// frontend/src/types.ts
export type LayerName =
  | "land"
  | "water"
  | "parks"
  | "roads"
  | "railways"
  | "buildings"
  | "labels";

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

// UI-only: what you keep in React state
export interface LayerConfig {
  name: LayerName;
  visible: boolean;
}

// What you send to the backend
export interface MapExportRequest {
  bbox: BBox;
  layers: LayerName[];  // <-- just the included layers
}
