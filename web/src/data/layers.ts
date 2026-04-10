import { LayerConfig, LayerName } from '@/types';

export interface LayerInfo {
  name: LayerName;
  label: string;
  description: string;
  defaultVisible: boolean;
  defaultStrokeWidth: number;
}

export const LAYERS: LayerInfo[] = [
  {
    name: 'land',
    label: 'Land',
    description: 'Base land mass',
    defaultVisible: true,
    defaultStrokeWidth: 0.3,
  },
  {
    name: 'water',
    label: 'Water',
    description: 'Oceans, lakes, rivers',
    defaultVisible: true,
    defaultStrokeWidth: 0.3,
  },
  {
    name: 'parks',
    label: 'Parks',
    description: 'Parks and green spaces',
    defaultVisible: true,
    defaultStrokeWidth: 0.2,
  },
  {
    name: 'roads',
    label: 'Roads',
    description: 'Streets and highways',
    defaultVisible: true,
    defaultStrokeWidth: 0.5,
  },
  {
    name: 'railways',
    label: 'Railways',
    description: 'Train tracks and metro lines',
    defaultVisible: true,
    defaultStrokeWidth: 0.3,
  },
  {
    name: 'buildings',
    label: 'Buildings',
    description: 'Building footprints',
    defaultVisible: false,
    defaultStrokeWidth: 0.15,
  },
  {
    name: 'places',
    label: 'Places',
    description: 'City and place labels',
    defaultVisible: false,
    defaultStrokeWidth: 0.2,
  },
  {
    name: 'boundaries',
    label: 'Boundaries',
    description: 'Administrative borders',
    defaultVisible: false,
    defaultStrokeWidth: 0.3,
  },
  {
    name: 'transit',
    label: 'Transit',
    description: 'Bus and transit routes',
    defaultVisible: false,
    defaultStrokeWidth: 0.2,
  },
];

export function getDefaultLayers(): LayerConfig[] {
  return LAYERS.map(layer => ({
    name: layer.name,
    visible: layer.defaultVisible,
    strokeWidth: layer.defaultStrokeWidth,
  }));
}

export function getLayerInfo(name: LayerName): LayerInfo | undefined {
  return LAYERS.find(l => l.name === name);
}
