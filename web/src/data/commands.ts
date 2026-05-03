import { Command } from '@/types/ui';
import { LOCATION_PRESETS } from './locationPresets';

export type CommandHandlers = {
  goToLocation: (locationId: string) => void;
  toggleLayer: (layer: string) => void;
  fitToView: () => void;
  copyBbox: () => void;
  exportSvg: () => void;
  startTour: () => void;
  openPresets: () => void;
  togglePreview: () => void;
};

export function createCommands(handlers: CommandHandlers): Command[] {
  const commands: Command[] = [];

  // Navigation commands - Go to preset locations
  LOCATION_PRESETS.forEach((preset) => {
    commands.push({
      id: `goto-${preset.id}`,
      label: `Go to ${preset.name}`,
      keywords: [preset.name.toLowerCase(), preset.subtitle.toLowerCase(), ...preset.tags],
      category: 'navigation',
      action: () => handlers.goToLocation(preset.id),
    });
  });

  // Layer toggle commands
  const layers = [
    { id: 'land', label: 'Land', shortcut: 'L' },
    { id: 'water', label: 'Water', shortcut: 'W' },
    { id: 'roads', label: 'Roads', shortcut: 'R' },
    { id: 'boundaries', label: 'Boundaries', shortcut: 'B' },
  ];

  layers.forEach((layer) => {
    commands.push({
      id: `toggle-${layer.id}`,
      label: `Toggle ${layer.label}`,
      keywords: [layer.id, layer.label.toLowerCase(), 'layer'],
      category: 'layers',
      shortcut: layer.shortcut,
      action: () => handlers.toggleLayer(layer.id),
    });
  });

  // View commands
  commands.push({
    id: 'fit-to-view',
    label: 'Fit Selection to View',
    keywords: ['fit', 'view', 'zoom', 'selection'],
    category: 'view',
    shortcut: 'F',
    action: handlers.fitToView,
  });

  commands.push({
    id: 'copy-bbox',
    label: 'Copy Bounding Box',
    keywords: ['copy', 'bbox', 'bounds', 'coordinates'],
    category: 'view',
    shortcut: 'C',
    action: handlers.copyBbox,
  });

  commands.push({
    id: 'open-presets',
    label: 'Browse Location Presets',
    keywords: ['presets', 'locations', 'cities', 'browse', 'gallery'],
    category: 'navigation',
    shortcut: 'P',
    action: handlers.openPresets,
  });

  // Export commands
  commands.push({
    id: 'export-svg',
    label: 'Export SVG',
    keywords: ['export', 'download', 'svg', 'save'],
    category: 'export',
    shortcut: 'E',
    action: handlers.exportSvg,
  });

  // View commands
  commands.push({
    id: 'toggle-preview',
    label: 'Toggle Preview',
    keywords: ['preview', 'show', 'hide', 'visibility'],
    category: 'view',
    shortcut: 'V',
    action: handlers.togglePreview,
  });

  // Help commands
  commands.push({
    id: 'start-tour',
    label: 'Start Guided Tour',
    keywords: ['tour', 'help', 'guide', 'tutorial', 'onboarding'],
    category: 'view',
    shortcut: '?',
    action: handlers.startTour,
  });

  return commands;
}

// Category labels for display
export const COMMAND_CATEGORIES: Record<string, string> = {
  navigation: 'Navigation',
  layers: 'Layers',
  view: 'View',
  export: 'Export',
};
