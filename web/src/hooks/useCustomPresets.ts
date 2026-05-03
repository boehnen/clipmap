'use client';

import { useState, useEffect, useCallback } from 'react';
import { LocationPreset } from '@/types/ui';
import { BBox, LayerName } from '@/types';
import { LayerStyle } from '@/types/makerPresets';

const STORAGE_KEY = 'clipmap-custom-presets';

// Generate a unique ID
function generateId(): string {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Generate a gradient from land and water colors
function generateGradient(landColor?: string, waterColor?: string): string {
  if (landColor && waterColor) {
    return `linear-gradient(135deg, ${waterColor} 0%, ${landColor} 100%)`;
  }
  // Fallback to random gradient
  const hue = Math.floor(Math.random() * 360);
  return `linear-gradient(135deg, hsl(${hue}, 60%, 40%), hsl(${(hue + 40) % 360}, 50%, 60%))`;
}

// Calculate appropriate zoom level from bbox span
function calculateZoom(bbox: BBox): number {
  const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
  const lonSpan = Math.abs(bbox.maxLon - bbox.minLon);
  const maxSpan = Math.max(latSpan, lonSpan);

  // Approximate zoom levels based on span
  if (maxSpan > 20) return 4;
  if (maxSpan > 10) return 5;
  if (maxSpan > 5) return 6;
  if (maxSpan > 2) return 8;
  if (maxSpan > 1) return 9;
  if (maxSpan > 0.5) return 10;
  if (maxSpan > 0.2) return 12;
  if (maxSpan > 0.1) return 13;
  if (maxSpan > 0.05) return 14;
  return 15;
}

export function useCustomPresets() {
  const [customPresets, setCustomPresets] = useState<LocationPreset[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as LocationPreset[];
        // Mark all as custom
        setCustomPresets(parsed.map(p => ({ ...p, isCustom: true })));
      }
    } catch (e) {
      console.warn('Failed to load custom presets:', e);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever presets change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customPresets));
      } catch (e) {
        console.warn('Failed to save custom presets:', e);
      }
    }
  }, [customPresets, isLoaded]);

  // Add a new custom preset
  const addPreset = useCallback((
    name: string,
    bbox: BBox,
    options?: {
      subtitle?: string;
      landColor?: string;
      waterColor?: string;
      layerStyles?: Partial<Record<LayerName, LayerStyle>>;
    }
  ) => {
    const { subtitle, landColor, waterColor, layerStyles } = options || {};

    const newPreset: LocationPreset = {
      id: generateId(),
      name,
      subtitle: subtitle || 'Custom Location',
      bbox,
      zoom: calculateZoom(bbox),
      tags: ['custom', 'saved'],
      gradient: generateGradient(landColor, waterColor),
      isCustom: true,
      landColor,
      waterColor,
      savedLayerStyles: layerStyles,
    };

    setCustomPresets(prev => [newPreset, ...prev]);
    return newPreset;
  }, []);

  // Delete a custom preset
  const deletePreset = useCallback((id: string) => {
    setCustomPresets(prev => prev.filter(p => p.id !== id));
  }, []);

  // Update a custom preset
  const updatePreset = useCallback((id: string, updates: Partial<LocationPreset>) => {
    setCustomPresets(prev =>
      prev.map(p => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  return {
    customPresets,
    isLoaded,
    addPreset,
    deletePreset,
    updatePreset,
  };
}
