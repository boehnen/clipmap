import { TourStep } from '@/types/ui';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="map"]',
    title: 'Welcome to ClipMap',
    description: 'Create beautiful SVG maps from any location in the world. Drag and resize the selection to choose your area.',
    placement: 'bottom',
  },
  {
    id: 'selection',
    target: '[data-tour="map"]',
    title: 'Draw Your Selection',
    description: 'Use the green handles to resize and position your selection. Drag the center handle to move the entire selection.',
    placement: 'bottom',
  },
  {
    id: 'layers',
    target: '[data-tour="layers"]',
    title: 'Toggle Layers',
    description: 'Choose which map layers to include in your export. Enable land, water, roads, and more.',
    placement: 'left',
  },
  {
    id: 'colors',
    target: '[data-tour="colors"]',
    title: 'Customize Colors',
    description: 'Click on the color pickers to customize the appearance of each layer.',
    placement: 'left',
  },
  {
    id: 'export',
    target: '[data-tour="export"]',
    title: 'Export Your Map',
    description: 'When ready, click Export SVG to download your map as a vector file. Perfect for design projects!',
    placement: 'top',
  },
];

// Simplified tour for mobile - focuses on map interactions only
export const MOBILE_TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="map"]',
    title: 'Welcome to ClipMap',
    description: 'Create beautiful SVG maps from any location. Use the search bar to find a location, then drag the green handles to select an area.',
    placement: 'bottom',
  },
  {
    id: 'selection',
    target: '[data-tour="map"]',
    title: 'Adjust Selection',
    description: 'Drag corner handles to resize. Drag the center handle to move. Pinch to zoom the map.',
    placement: 'bottom',
  },
  {
    id: 'menu',
    target: '[data-tour="map"]',
    title: 'Customize & Export',
    description: 'Tap the menu button (top right) to toggle layers, change colors, and access location presets. Then tap Export SVG at the bottom.',
    placement: 'bottom',
  },
];
