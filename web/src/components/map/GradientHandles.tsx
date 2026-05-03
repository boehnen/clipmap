'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BBox, LayerName } from '@/types';
import { LayerStyle, LinearGradient, RadialGradient, GradientFill } from '@/types/makerPresets';

interface GradientHandlesProps {
  bbox: BBox | null;
  layerStyles: Record<LayerName, LayerStyle>;
  onGradientChange: (layerName: LayerName, gradient: GradientFill) => void;
}

interface GradientLayer {
  name: LayerName;
  gradient: GradientFill;
}

// Get ALL layers with gradients
function getGradientLayers(
  layerStyles: Record<LayerName, LayerStyle>
): GradientLayer[] {
  const layers: GradientLayer[] = [];
  for (const [name, style] of Object.entries(layerStyles)) {
    if (style.visible && style.fillGradient) {
      layers.push({ name: name as LayerName, gradient: style.fillGradient });
    }
  }
  return layers;
}

export function GradientHandles({
  bbox,
  layerStyles,
  onGradientChange,
}: GradientHandlesProps) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<{
    layerName: LayerName;
    handle: 'start' | 'end' | 'inner' | 'outer';
  } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [colorPickerState, setColorPickerState] = useState<{
    layerName: LayerName;
    handle: 'start' | 'end' | 'inner' | 'outer';
    position: { x: number; y: number };
    color: string;
  } | null>(null);

  const gradientLayers = getGradientLayers(layerStyles);

  // Create container
  useEffect(() => {
    if (!map) return;

    const container = L.DomUtil.create('div', 'gradient-handles');
    container.style.position = 'absolute';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '450';
    containerRef.current = container;

    map.getPane('overlayPane')?.appendChild(container);

    return () => {
      if (container.parentNode) container.parentNode.removeChild(container);
      containerRef.current = null;
    };
  }, [map]);

  // Calculate handle positions for a single layer
  const getHandlePositions = useCallback((layer: GradientLayer, bounds: { left: number; top: number; width: number; height: number }) => {
    const { gradient } = layer;
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;

    if (gradient.type === 'linear') {
      const angleRad = ((gradient.angle - 90) * Math.PI) / 180;
      const radius = Math.min(bounds.width, bounds.height) * 0.4;
      const startX = centerX - Math.cos(angleRad) * radius;
      const startY = centerY - Math.sin(angleRad) * radius;
      const endX = centerX + Math.cos(angleRad) * radius;
      const endY = centerY + Math.sin(angleRad) * radius;

      return {
        type: 'linear' as const,
        start: { x: startX, y: startY },
        end: { x: endX, y: endY },
      };
    } else {
      const cx = (gradient.cx ?? 50) / 100;
      const cy = (gradient.cy ?? 50) / 100;
      return {
        type: 'radial' as const,
        center: { x: bounds.left + bounds.width * cx, y: bounds.top + bounds.height * cy },
      };
    }
  }, []);

  // Handle drag start
  const startDrag = useCallback((e: MouseEvent, layerName: LayerName, handle: 'start' | 'end' | 'inner' | 'outer') => {
    e.stopPropagation();
    e.preventDefault();
    setDragging({ layerName, handle });
    setColorPickerState(null);
    dragStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
    map.dragging.disable();
  }, [map]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging || !bbox || !dragStartRef.current) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStartRef.current.moved = true;
    }

    if (!dragStartRef.current.moved) return;

    const layer = gradientLayers.find(l => l.name === dragging.layerName);
    if (!layer) return;

    const sw = map.latLngToLayerPoint(L.latLng(bbox.minLat, bbox.minLon));
    const ne = map.latLngToLayerPoint(L.latLng(bbox.maxLat, bbox.maxLon));
    const bounds = {
      left: Math.min(sw.x, ne.x),
      top: Math.min(sw.y, ne.y),
      width: Math.abs(ne.x - sw.x),
      height: Math.abs(ne.y - sw.y),
    };

    const mouseLatLng = map.containerPointToLatLng(L.point(e.clientX, e.clientY));
    const mouseLayerPoint = map.latLngToLayerPoint(mouseLatLng);
    const mouseX = mouseLayerPoint.x;
    const mouseY = mouseLayerPoint.y;

    if (layer.gradient.type === 'linear' && (dragging.handle === 'start' || dragging.handle === 'end')) {
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;

      let angle: number;
      if (dragging.handle === 'end') {
        angle = Math.atan2(mouseY - centerY, mouseX - centerX) * (180 / Math.PI) + 90;
      } else {
        angle = Math.atan2(centerY - mouseY, centerX - mouseX) * (180 / Math.PI) + 90;
      }
      angle = ((angle % 360) + 360) % 360;

      const newGradient: LinearGradient = {
        ...layer.gradient,
        angle: Math.round(angle),
      };
      onGradientChange(dragging.layerName, newGradient);
    } else if (layer.gradient.type === 'radial' && dragging.handle === 'outer') {
      const cx = Math.max(0, Math.min(100, ((mouseX - bounds.left) / bounds.width) * 100));
      const cy = Math.max(0, Math.min(100, ((mouseY - bounds.top) / bounds.height) * 100));

      const newGradient: RadialGradient = {
        ...layer.gradient,
        cx: Math.round(cx),
        cy: Math.round(cy),
      };
      onGradientChange(dragging.layerName, newGradient);
    }
  }, [dragging, gradientLayers, bbox, onGradientChange, map]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    const wasDragging = dragging;
    const didMove = dragStartRef.current?.moved ?? false;

    setDragging(null);
    map.dragging.enable();

    if (wasDragging && !didMove) {
      const layer = gradientLayers.find(l => l.name === wasDragging.layerName);
      if (layer) {
        // start/inner = first stop, end/outer = last stop
        const stopIndex = (wasDragging.handle === 'start' || wasDragging.handle === 'inner') ? 0 :
                          (layer.gradient.stops.length - 1);
        const currentColor = layer.gradient.stops[stopIndex]?.color || '#ffffff';

        setColorPickerState({
          layerName: wasDragging.layerName,
          handle: wasDragging.handle,
          position: { x: e.clientX, y: e.clientY },
          color: currentColor,
        });
      }
    }

    dragStartRef.current = null;
  }, [map, dragging, gradientLayers]);

  // Add global mouse listeners when dragging
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Update container position and render handles for ALL gradient layers
  const updatePosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || !bbox || gradientLayers.length === 0) {
      if (container) container.style.display = 'none';
      return;
    }

    const sw = map.latLngToLayerPoint(L.latLng(bbox.minLat, bbox.minLon));
    const ne = map.latLngToLayerPoint(L.latLng(bbox.maxLat, bbox.maxLon));

    const bounds = {
      left: Math.min(sw.x, ne.x),
      top: Math.min(sw.y, ne.y),
      width: Math.abs(ne.x - sw.x),
      height: Math.abs(ne.y - sw.y),
    };

    if (bounds.width < 5 || bounds.height < 5) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.style.left = `${bounds.left}px`;
    container.style.top = `${bounds.top}px`;
    container.style.width = `${bounds.width}px`;
    container.style.height = `${bounds.height}px`;
    container.style.pointerEvents = 'auto';

    // Build SVG with handles for ALL gradient layers
    let svgContent = '';

    for (const layer of gradientLayers) {
      const positions = getHandlePositions(layer, bounds);
      const layerId = layer.name;

      if (positions.type === 'linear') {
        const relStart = { x: positions.start.x - bounds.left, y: positions.start.y - bounds.top };
        const relEnd = { x: positions.end.x - bounds.left, y: positions.end.y - bounds.top };

        svgContent += `
          <!-- ${layer.name} gradient line -->
          <line
            x1="${relStart.x}" y1="${relStart.y}"
            x2="${relEnd.x}" y2="${relEnd.y}"
            stroke="white" stroke-width="3" stroke-linecap="round"
          />
          <line
            x1="${relStart.x}" y1="${relStart.y}"
            x2="${relEnd.x}" y2="${relEnd.y}"
            stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,4" stroke-linecap="round"
          />
          <!-- ${layer.name} start handle -->
          <circle
            cx="${relStart.x}" cy="${relStart.y}" r="10"
            fill="${layer.gradient.stops[0]?.color || '#fff'}"
            stroke="white" stroke-width="2"
            style="cursor: grab; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));"
            class="gradient-handle" data-layer="${layerId}" data-handle="start"
          />
          <!-- ${layer.name} end handle -->
          <circle
            cx="${relEnd.x}" cy="${relEnd.y}" r="10"
            fill="${layer.gradient.stops[1]?.color || '#fff'}"
            stroke="white" stroke-width="2"
            style="cursor: grab; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));"
            class="gradient-handle" data-layer="${layerId}" data-handle="end"
          />
        `;
      } else {
        const relCenter = { x: positions.center.x - bounds.left, y: positions.center.y - bounds.top };

        svgContent += `
          <!-- ${layer.name} outer handle (drag to move, click for outer color) -->
          <circle
            cx="${relCenter.x}" cy="${relCenter.y}" r="14"
            fill="${layer.gradient.stops[1]?.color || '#fff'}"
            stroke="white" stroke-width="2"
            style="cursor: grab; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));"
            class="gradient-handle" data-layer="${layerId}" data-handle="outer"
          />
          <!-- ${layer.name} inner handle (click for inner color) -->
          <circle
            cx="${relCenter.x}" cy="${relCenter.y}" r="7"
            fill="${layer.gradient.stops[0]?.color || '#fff'}"
            stroke="white" stroke-width="1"
            style="cursor: pointer;"
            class="gradient-handle" data-layer="${layerId}" data-handle="inner"
          />
        `;
      }
    }

    container.innerHTML = `<svg width="100%" height="100%" style="overflow: visible;">${svgContent}</svg>`;

    // Add event listeners to all handles
    container.querySelectorAll('.gradient-handle').forEach(handle => {
      const layerName = handle.getAttribute('data-layer') as LayerName;
      const handleType = handle.getAttribute('data-handle') as 'start' | 'end' | 'inner' | 'outer';
      handle.addEventListener('mousedown', (e) => startDrag(e as MouseEvent, layerName, handleType));
    });
  }, [map, bbox, gradientLayers, getHandlePositions, startDrag]);

  // Update on map events
  useEffect(() => {
    if (!map) return;
    map.on('move', updatePosition);
    map.on('zoom', updatePosition);
    map.on('viewreset', updatePosition);
    return () => {
      map.off('move', updatePosition);
      map.off('zoom', updatePosition);
      map.off('viewreset', updatePosition);
    };
  }, [map, updatePosition]);

  // Update when gradients change
  useEffect(() => {
    updatePosition();
  }, [updatePosition, gradientLayers]);

  // Handle color change from picker
  const handleColorChange = useCallback((newColor: string) => {
    if (!colorPickerState) return;

    const layer = gradientLayers.find(l => l.name === colorPickerState.layerName);
    if (!layer) return;

    // start/inner = first stop, end/outer = last stop
    const stopIndex = (colorPickerState.handle === 'start' || colorPickerState.handle === 'inner') ? 0 :
                      (layer.gradient.stops.length - 1);

    const newStops = [...layer.gradient.stops];
    newStops[stopIndex] = { ...newStops[stopIndex], color: newColor };

    const newGradient = { ...layer.gradient, stops: newStops } as GradientFill;
    onGradientChange(colorPickerState.layerName, newGradient);
    setColorPickerState(prev => prev ? { ...prev, color: newColor } : null);
  }, [colorPickerState, gradientLayers, onGradientChange]);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!colorPickerState) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.gradient-color-picker')) {
        setColorPickerState(null);
      }
    };

    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [colorPickerState]);

  // Render color picker portal
  if (colorPickerState && typeof window !== 'undefined') {
    return createPortal(
      <div
        className="gradient-color-picker fixed z-[9999] bg-white rounded-lg shadow-xl border border-neutral-200 p-3"
        style={{
          left: colorPickerState.position.x,
          top: colorPickerState.position.y + 15,
          transform: 'translateX(-50%)',
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="text-xs text-neutral-500 capitalize">{colorPickerState.layerName}</div>
          <input
            type="color"
            value={colorPickerState.color}
            onChange={(e) => handleColorChange(e.target.value)}
            className="w-20 h-8 cursor-pointer border-0 p-0"
          />
          <input
            type="text"
            value={colorPickerState.color}
            onChange={(e) => {
              const val = e.target.value;
              if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                handleColorChange(val);
              }
            }}
            className="w-20 px-2 py-1 text-xs font-mono border border-neutral-300 rounded"
            placeholder="#ffffff"
          />
        </div>
      </div>,
      document.body
    );
  }

  return null;
}
