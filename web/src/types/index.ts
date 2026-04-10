export interface BBox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

export type LayerName =
  | 'land'
  | 'water'
  | 'parks'
  | 'roads'
  | 'railways'
  | 'ferries'
  | 'buildings'
  | 'places'
  | 'boundaries'
  | 'transit'
  | 'contours'
  | 'elevation';

export interface LayerConfig {
  name: LayerName;
  visible: boolean;
  strokeWidth: number;
}

export type DetailLevel =
  | 'fine'
  | 'medium'
  | 'coarse'
  | 'regional'
  | 'country'
  | 'continental';

export type ToolType =
  | 'svg'
  | '3d-city'
  | 'topo'
  | 'poster'
  | 'route'
  | 'stars'
  | 'transit';

export interface Tool {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  metaDescription: string;
  keywords: string[];
  icon: string;
  outputFormat: string;
  available: boolean;
}

export interface City {
  slug: string;
  name: string;
  country: string;
  countryCode: string;
  state?: string;
  population: number;
  bbox: [number, number, number, number];
  landmarks: string[];
  relatedCities: string[];
}

export interface ExportProgress {
  step: string;
  progress: number;
  message?: string;
}

export interface MapExportRequest {
  bbox: BBox;
  layers: LayerName[];
  format?: string;
}

export interface GlossaryTerm {
  slug: string;
  term: string;
  definition: string;
  relatedTerms: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  image?: string;
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  sections: string[];
}
