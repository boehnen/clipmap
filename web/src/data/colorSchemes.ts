import { ColorScheme } from '@/types/makerPresets';

export const COLOR_SCHEMES: ColorScheme[] = [
  // Classic map styles
  {
    id: 'classic',
    name: 'Classic',
    background: '#ffffff',
    colors: {
      land: { stroke: 'none', fill: '#f5f5f5' },
      water: { stroke: 'none', fill: '#b3d9ff' },
      parks: { stroke: 'none', fill: '#c8e6c9' },
      roads: { stroke: '#404040', fill: 'none' },
      railways: { stroke: '#666666', fill: 'none' },
      buildings: { stroke: '#888888', fill: '#e8e8e8' },
      places: { stroke: '#333333', fill: 'none' },
      boundaries: { stroke: '#9c27b0', fill: 'none' },
      transit: { stroke: '#ff9800', fill: 'none' },
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    background: '#ffffff',
    colors: {
      land: { stroke: 'none', fill: '#fafafa' },
      water: { stroke: 'none', fill: '#e3f2fd' },
      parks: { stroke: 'none', fill: '#e8f5e9' },
      roads: { stroke: '#333333', fill: 'none' },
      railways: { stroke: '#555555', fill: 'none' },
      buildings: { stroke: '#999999', fill: '#f5f5f5' },
      places: { stroke: '#222222', fill: 'none' },
      boundaries: { stroke: '#777777', fill: 'none' },
      transit: { stroke: '#666666', fill: 'none' },
    },
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    background: '#1a1a1a',
    colors: {
      land: { stroke: 'none', fill: '#2a2a2a' },
      water: { stroke: 'none', fill: '#1e3a5f' },
      parks: { stroke: 'none', fill: '#1b3d1e' },
      roads: { stroke: '#d0d0d0', fill: 'none' },
      railways: { stroke: '#888888', fill: 'none' },
      buildings: { stroke: '#555555', fill: '#333333' },
      places: { stroke: '#ffffff', fill: 'none' },
      boundaries: { stroke: '#7c4dff', fill: 'none' },
      transit: { stroke: '#ffa726', fill: 'none' },
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    background: '#1a237e',
    colors: {
      land: { stroke: 'none', fill: '#1a237e' },
      water: { stroke: '#64b5f6', fill: 'none' },
      parks: { stroke: '#81c784', fill: 'none' },
      roads: { stroke: '#ffffff', fill: 'none' },
      railways: { stroke: '#90caf9', fill: 'none' },
      buildings: { stroke: '#bbdefb', fill: 'none' },
      places: { stroke: '#ffffff', fill: 'none' },
      boundaries: { stroke: '#ce93d8', fill: 'none' },
      transit: { stroke: '#ffcc80', fill: 'none' },
    },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    background: '#faf3e3',
    colors: {
      land: { stroke: 'none', fill: '#faf3e3' },
      water: { stroke: 'none', fill: '#d4c4a8' },
      parks: { stroke: 'none', fill: '#d9d0b8' },
      roads: { stroke: '#5d4e37', fill: 'none' },
      railways: { stroke: '#7a6b54', fill: 'none' },
      buildings: { stroke: '#8b7355', fill: '#e8dcc8' },
      places: { stroke: '#3d3226', fill: 'none' },
      boundaries: { stroke: '#6b5344', fill: 'none' },
      transit: { stroke: '#8b6914', fill: 'none' },
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    background: '#ffffff',
    colors: {
      land: { stroke: 'none', fill: '#f0f0f0' },
      water: { stroke: 'none', fill: '#d0d0d0' },
      parks: { stroke: 'none', fill: '#e0e0e0' },
      roads: { stroke: '#000000', fill: 'none' },
      railways: { stroke: '#333333', fill: 'none' },
      buildings: { stroke: '#666666', fill: '#cccccc' },
      places: { stroke: '#000000', fill: 'none' },
      boundaries: { stroke: '#444444', fill: 'none' },
      transit: { stroke: '#555555', fill: 'none' },
    },
  },

  // Laser cutting schemes
  {
    id: 'laser-standard',
    name: 'Laser Standard',
    background: '#ffffff',
    colors: {
      land: { stroke: 'none', fill: 'none' },
      water: { stroke: '#0000ff', fill: 'none' },  // blue = score
      parks: { stroke: '#0000ff', fill: 'none' },
      roads: { stroke: '#000000', fill: 'none' },  // black = engrave
      railways: { stroke: '#000000', fill: 'none' },
      buildings: { stroke: '#ff0000', fill: 'none' },  // red = cut
      places: { stroke: '#000000', fill: 'none' },
      boundaries: { stroke: '#ff0000', fill: 'none' },
      transit: { stroke: '#000000', fill: 'none' },
    },
  },
  {
    id: 'laser-glowforge',
    name: 'Glowforge',
    background: '#ffffff',
    colors: {
      land: { stroke: '#ff0000', fill: 'none' },  // outline cut
      water: { stroke: '#0000ff', fill: 'none' },  // score
      parks: { stroke: '#00ff00', fill: 'none' },  // light engrave
      roads: { stroke: '#000000', fill: 'none' },  // engrave
      railways: { stroke: '#000000', fill: 'none' },
      buildings: { stroke: '#ff0000', fill: 'none' },  // cut
      places: { stroke: '#000000', fill: 'none' },
      boundaries: { stroke: '#0000ff', fill: 'none' },
      transit: { stroke: '#000000', fill: 'none' },
    },
  },

  // Vinyl cutting
  {
    id: 'vinyl-simple',
    name: 'Vinyl Simple',
    background: '#ffffff',
    colors: {
      land: { stroke: '#000000', fill: 'none' },
      water: { stroke: '#000000', fill: 'none' },
      parks: { stroke: '#000000', fill: 'none' },
      roads: { stroke: '#000000', fill: 'none' },
      railways: { stroke: '#000000', fill: 'none' },
      buildings: { stroke: '#000000', fill: 'none' },
      places: { stroke: '#000000', fill: 'none' },
      boundaries: { stroke: '#000000', fill: 'none' },
      transit: { stroke: '#000000', fill: 'none' },
    },
  },

  // Artistic styles
  {
    id: 'neon',
    name: 'Neon',
    background: '#0a0a0a',
    colors: {
      land: { stroke: 'none', fill: '#0a0a0a' },
      water: { stroke: '#00ffff', fill: 'none' },
      parks: { stroke: '#00ff00', fill: 'none' },
      roads: { stroke: '#ff00ff', fill: 'none' },
      railways: { stroke: '#ffff00', fill: 'none' },
      buildings: { stroke: '#ff6600', fill: 'none' },
      places: { stroke: '#ffffff', fill: 'none' },
      boundaries: { stroke: '#ff0066', fill: 'none' },
      transit: { stroke: '#00ff99', fill: 'none' },
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    background: '#fef9f3',
    colors: {
      land: { stroke: 'none', fill: '#fef9f3' },
      water: { stroke: 'none', fill: '#bfe3f7' },
      parks: { stroke: 'none', fill: '#d4edda' },
      roads: { stroke: '#b8a9c9', fill: 'none' },
      railways: { stroke: '#e8b4b8', fill: 'none' },
      buildings: { stroke: '#d4c4a8', fill: '#f5efe6' },
      places: { stroke: '#9e8b7d', fill: 'none' },
      boundaries: { stroke: '#c9b2d4', fill: 'none' },
      transit: { stroke: '#f7c59f', fill: 'none' },
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: '#e8f4f8',
    colors: {
      land: { stroke: 'none', fill: '#f5e6d3' },
      water: { stroke: 'none', fill: '#2196f3' },
      parks: { stroke: 'none', fill: '#81c784' },
      roads: { stroke: '#37474f', fill: 'none' },
      railways: { stroke: '#455a64', fill: 'none' },
      buildings: { stroke: '#546e7a', fill: '#cfd8dc' },
      places: { stroke: '#263238', fill: 'none' },
      boundaries: { stroke: '#0288d1', fill: 'none' },
      transit: { stroke: '#00796b', fill: 'none' },
    },
  },
];

export function getColorScheme(id: string): ColorScheme | undefined {
  return COLOR_SCHEMES.find(s => s.id === id);
}

export function getColorSchemesForCategory(category: string): ColorScheme[] {
  switch (category) {
    case 'laser-cutting':
      return COLOR_SCHEMES.filter(s =>
        s.id.startsWith('laser-') || s.id === 'monochrome'
      );
    case 'vinyl-cutting':
      return COLOR_SCHEMES.filter(s =>
        s.id.startsWith('vinyl-') || s.id === 'monochrome'
      );
    case 'print-poster':
      return COLOR_SCHEMES.filter(s =>
        !s.id.startsWith('laser-') && !s.id.startsWith('vinyl-')
      );
    default:
      return COLOR_SCHEMES;
  }
}
