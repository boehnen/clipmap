'use client';

import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
  onCommandPalette?: () => void;
  onEscape?: () => void;
  onLayerToggle?: (layer: string) => void;
  onFitToView?: () => void;
  onCopyBbox?: () => void;
  onExport?: () => void;
  onStartTour?: () => void;
  onPresets?: () => void;
  onTogglePreview?: () => void;
}

export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  enabled: boolean = true
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Only allow Escape to work in inputs
        if (e.key === 'Escape' && handlers.onEscape) {
          handlers.onEscape();
          return;
        }
        return;
      }

      // Cmd/Ctrl + K - Open command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handlers.onCommandPalette?.();
        return;
      }

      // Escape - Close modals
      if (e.key === 'Escape') {
        handlers.onEscape?.();
        return;
      }

      // Single key shortcuts (only when not in command palette)
      switch (e.key.toLowerCase()) {
        case 'l':
          handlers.onLayerToggle?.('land');
          break;
        case 'w':
          handlers.onLayerToggle?.('water');
          break;
        case 'r':
          handlers.onLayerToggle?.('roads');
          break;
        case 'b':
          handlers.onLayerToggle?.('boundaries');
          break;
        case 'f':
          handlers.onFitToView?.();
          break;
        case 'c':
          handlers.onCopyBbox?.();
          break;
        case 'e':
          handlers.onExport?.();
          break;
        case 'p':
          handlers.onPresets?.();
          break;
        case 'v':
          handlers.onTogglePreview?.();
          break;
        case '?':
          handlers.onStartTour?.();
          break;
      }
    },
    [handlers, enabled]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Hook for command palette specific shortcuts
export function useCommandPaletteShortcuts(
  isOpen: boolean,
  onClose: () => void,
  onNavigate: (direction: 'up' | 'down') => void,
  onSelect: () => void
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowUp':
          e.preventDefault();
          onNavigate('up');
          break;
        case 'ArrowDown':
          e.preventDefault();
          onNavigate('down');
          break;
        case 'Enter':
          e.preventDefault();
          onSelect();
          break;
      }
    },
    [isOpen, onClose, onNavigate, onSelect]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
