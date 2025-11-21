export type LayerName =
  | "roads"
  | "railways"
  | "water"
  | "buildings"
  | "land"
  | "parks";

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

export interface RawWay {
  coords: [number, number][];
  tags: Record<string, string>;
}

export interface ProjectedFeature {
  coords: [number, number][];
  tags: Record<string, string>;
}
