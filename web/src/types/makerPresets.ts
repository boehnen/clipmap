import { LayerName } from '@/types';

export type OutputMode = 'filled' | 'stroke-only' | 'combined';

export type MakerCategory =
  | 'laser-cutting'
  | 'vinyl-cutting'
  | 'cnc-routing'
  | 'print-poster'
  | 'engraving'
  | 'web-digital';

// Filter features by property values (e.g., only show motorways)
export interface LayerFilter {
  property: string;           // e.g., 'highway', 'railway'
  include?: string[];         // Only show these values
  exclude?: string[];         // Hide these values
}

// Gradient definitions for fills
export interface GradientStop {
  offset: number;  // 0-100
  color: string;
}

export interface LinearGradient {
  type: 'linear';
  angle: number;  // degrees, 0 = left-to-right, 90 = top-to-bottom
  stops: GradientStop[];
}

export interface RadialGradient {
  type: 'radial';
  cx?: number;  // center x (0-100), default 50
  cy?: number;  // center y (0-100), default 50
  stops: GradientStop[];
}

export type GradientFill = LinearGradient | RadialGradient;

export interface LayerStyle {
  visible: boolean;
  stroke: string;        // color or 'none'
  fill: string;          // color or 'none' (solid fill)
  fillGradient?: GradientFill;  // optional gradient fill (overrides fill if present)
  strokeWidth: number;   // multiplier (1.0 = default)
  opacity: number;
  dashArray?: string;
  filter?: LayerFilter;  // Optional sub-type filtering
}

// Common filter presets for roads
export const ROAD_FILTERS: Record<string, LayerFilter | undefined> = {
  all: undefined,
  majorRoads: { property: 'highway', include: ['motorway', 'trunk', 'primary', 'secondary'] },
  carRoads: { property: 'highway', include: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service'] },
  noFootpaths: { property: 'highway', exclude: ['footway', 'path', 'cycleway', 'pedestrian', 'track'] },
};

// Common filter presets for railways
export const RAILWAY_FILTERS: Record<string, LayerFilter | undefined> = {
  all: undefined,
  trainsOnly: { property: 'railway', include: ['rail'] },
  subwayOnly: { property: 'railway', include: ['subway'] },
  lightRail: { property: 'railway', include: ['light_rail', 'tram'] },
  heavyRail: { property: 'railway', include: ['rail', 'subway'] },
  noTram: { property: 'railway', exclude: ['tram'] },
};

export interface ColorScheme {
  id: string;
  name: string;
  colors: Partial<Record<LayerName, { stroke: string; fill: string }>>;
  background?: string;
}

export interface MakerPreset {
  id: string;
  name: string;
  category: MakerCategory;
  icon: string;
  description: string;
  layers: LayerName[];
  layerStyles: Partial<Record<LayerName, Partial<LayerStyle>>>;
  outputMode: OutputMode;
  colorScheme?: string;  // reference to a ColorScheme id
  machineType?: string;
  materialRecommendations?: string[];
  notes?: string;
}

export interface MakerCategoryInfo {
  id: MakerCategory;
  name: string;
  icon: string;
  description: string;
}

export const MAKER_CATEGORIES: MakerCategoryInfo[] = [
  {
    id: 'laser-cutting',
    name: 'Laser',
    icon: '✂️',
    description: 'Glowforge, K40, CO2 lasers',
  },
  {
    id: 'vinyl-cutting',
    name: 'Vinyl',
    icon: '📄',
    description: 'Cricut, Silhouette',
  },
  {
    id: 'cnc-routing',
    name: 'CNC',
    icon: '🔧',
    description: 'Shapeoko, X-Carve',
  },
  {
    id: 'print-poster',
    name: 'Print',
    icon: '🖼️',
    description: 'Wall art, posters',
  },
  {
    id: 'engraving',
    name: 'Engrave',
    icon: '🔥',
    description: 'Rotary, laser engrave',
  },
  {
    id: 'web-digital',
    name: 'Digital',
    icon: '🌐',
    description: 'Web backgrounds',
  },
];
