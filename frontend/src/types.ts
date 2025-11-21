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

// UI-only; backend never sees this
export interface LayerConfig {
  name: LayerName;
  visible: boolean;
}

export interface MapExportRequest {
  bbox: BBox;
  layers: LayerName[];
}
