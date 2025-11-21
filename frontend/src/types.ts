export type LayerName =
  | "land"
  | "water"
  | "parks"
  | "roads"
  | "railways"
  | "buildings";

export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export interface LayerConfig {
  name: LayerName;
  visible: boolean;
}

export interface MapExportRequest {
  bbox: BBox;
  layers: LayerConfig[];
}
