'use client';

import { BBox, LayerName } from './index';
import { LayerStyle } from './makerPresets';

export interface LocationPreset {
  id: string;
  name: string;
  subtitle: string;
  bbox: BBox;
  zoom: number;
  tags: string[];
  gradient: string; // CSS gradient for placeholder card
  isCustom?: boolean; // True for user-created presets
  // Saved layer colors (custom presets only)
  landColor?: string;
  waterColor?: string;
  // Full layer styles (custom presets only) - includes gradients
  savedLayerStyles?: Partial<Record<LayerName, LayerStyle>>;
}

export interface Command {
  id: string;
  label: string;
  keywords: string[];
  category: 'navigation' | 'layers' | 'view' | 'export';
  shortcut?: string;
  action: () => void;
}

export interface TourStep {
  id: string;
  target: string; // CSS selector
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

export interface FlyToTarget {
  center: [number, number];
  zoom: number;
  bbox?: BBox;
}

export interface AppUIState {
  // Command palette
  isCommandPaletteOpen: boolean;
  // Tour
  isTourActive: boolean;
  currentTourStep: number;
  tourCompleted: boolean;
  // Presets modal
  isPresetsOpen: boolean;
}

export type AppUIAction =
  | { type: 'OPEN_COMMAND_PALETTE' }
  | { type: 'CLOSE_COMMAND_PALETTE' }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'OPEN_PRESETS' }
  | { type: 'CLOSE_PRESETS' }
  | { type: 'START_TOUR' }
  | { type: 'NEXT_TOUR_STEP' }
  | { type: 'PREV_TOUR_STEP' }
  | { type: 'SKIP_TOUR' }
  | { type: 'COMPLETE_TOUR' }
  | { type: 'SET_TOUR_STEP'; step: number };
