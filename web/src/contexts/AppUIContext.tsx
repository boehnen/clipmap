'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { AppUIState, AppUIAction, FlyToTarget } from '@/types/ui';
import { BBox } from '@/types';
import { TOUR_STEPS } from '@/data/tourSteps';

const TOUR_COMPLETED_KEY = 'clipmap-tour-completed';

const initialState: AppUIState = {
  isCommandPaletteOpen: false,
  isTourActive: false,
  currentTourStep: 0,
  tourCompleted: false,
  isPresetsOpen: false,
};

function appUIReducer(state: AppUIState, action: AppUIAction): AppUIState {
  switch (action.type) {
    case 'OPEN_COMMAND_PALETTE':
      return { ...state, isCommandPaletteOpen: true };
    case 'CLOSE_COMMAND_PALETTE':
      return { ...state, isCommandPaletteOpen: false };
    case 'TOGGLE_COMMAND_PALETTE':
      return { ...state, isCommandPaletteOpen: !state.isCommandPaletteOpen };
    case 'OPEN_PRESETS':
      return { ...state, isPresetsOpen: true };
    case 'CLOSE_PRESETS':
      return { ...state, isPresetsOpen: false };
    case 'START_TOUR':
      return { ...state, isTourActive: true, currentTourStep: 0 };
    case 'NEXT_TOUR_STEP':
      if (state.currentTourStep >= TOUR_STEPS.length - 1) {
        return { ...state, isTourActive: false, tourCompleted: true };
      }
      return { ...state, currentTourStep: state.currentTourStep + 1 };
    case 'PREV_TOUR_STEP':
      if (state.currentTourStep <= 0) return state;
      return { ...state, currentTourStep: state.currentTourStep - 1 };
    case 'SKIP_TOUR':
      return { ...state, isTourActive: false, tourCompleted: true };
    case 'COMPLETE_TOUR':
      return { ...state, isTourActive: false, tourCompleted: true };
    case 'SET_TOUR_STEP':
      return { ...state, currentTourStep: action.step };
    default:
      return state;
  }
}

interface AppUIContextValue {
  state: AppUIState;
  // Command palette
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  // Presets
  openPresets: () => void;
  closePresets: () => void;
  // Tour
  startTour: () => void;
  nextTourStep: () => void;
  prevTourStep: () => void;
  skipTour: () => void;
  // Navigation
  flyTo: (target: FlyToTarget) => void;
  setFlyToHandler: (handler: (target: FlyToTarget) => void) => void;
  // Bbox update (for presets)
  updateBbox: (bbox: BBox) => void;
  setBboxHandler: (handler: (bbox: BBox) => void) => void;
}

const AppUIContext = createContext<AppUIContextValue | null>(null);

export function AppUIProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appUIReducer, initialState);

  // Store handler references for map integration
  const flyToHandlerRef = React.useRef<((target: FlyToTarget) => void) | null>(null);
  const bboxHandlerRef = React.useRef<((bbox: BBox) => void) | null>(null);

  // Check localStorage for tour completion on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const completed = localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
      if (!completed) {
        // Auto-start tour for first-time users after a short delay
        const timer = setTimeout(() => {
          dispatch({ type: 'START_TOUR' });
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Persist tour completion to localStorage
  useEffect(() => {
    if (state.tourCompleted && typeof window !== 'undefined') {
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    }
  }, [state.tourCompleted]);

  const openCommandPalette = useCallback(() => dispatch({ type: 'OPEN_COMMAND_PALETTE' }), []);
  const closeCommandPalette = useCallback(() => dispatch({ type: 'CLOSE_COMMAND_PALETTE' }), []);
  const toggleCommandPalette = useCallback(() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' }), []);

  const openPresets = useCallback(() => dispatch({ type: 'OPEN_PRESETS' }), []);
  const closePresets = useCallback(() => dispatch({ type: 'CLOSE_PRESETS' }), []);

  const startTour = useCallback(() => dispatch({ type: 'START_TOUR' }), []);
  const nextTourStep = useCallback(() => dispatch({ type: 'NEXT_TOUR_STEP' }), []);
  const prevTourStep = useCallback(() => dispatch({ type: 'PREV_TOUR_STEP' }), []);
  const skipTour = useCallback(() => dispatch({ type: 'SKIP_TOUR' }), []);

  const flyTo = useCallback((target: FlyToTarget) => {
    flyToHandlerRef.current?.(target);
  }, []);

  const setFlyToHandler = useCallback((handler: (target: FlyToTarget) => void) => {
    flyToHandlerRef.current = handler;
  }, []);

  const updateBbox = useCallback((bbox: BBox) => {
    bboxHandlerRef.current?.(bbox);
  }, []);

  const setBboxHandler = useCallback((handler: (bbox: BBox) => void) => {
    bboxHandlerRef.current = handler;
  }, []);

  return (
    <AppUIContext.Provider
      value={{
        state,
        openCommandPalette,
        closeCommandPalette,
        toggleCommandPalette,
        openPresets,
        closePresets,
        startTour,
        nextTourStep,
        prevTourStep,
        skipTour,
        flyTo,
        setFlyToHandler,
        updateBbox,
        setBboxHandler,
      }}
    >
      {children}
    </AppUIContext.Provider>
  );
}

export function useAppUI() {
  const context = useContext(AppUIContext);
  if (!context) {
    throw new Error('useAppUI must be used within an AppUIProvider');
  }
  return context;
}
