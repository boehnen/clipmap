'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer as LeafletMapContainer, TileLayer, Rectangle, Marker, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BBox, LayerName } from '@/types';
import { LayerStyle, OutputMode } from '@/types/makerPresets';
import { SvgPreview } from './SvgPreview';

// Handle icons
const handleIcon = L.divIcon({
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  html: `<div style="width:12px;height:12px;border-radius:2px;background:#fff;border:2px solid #22c55e;box-sizing:border-box;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
});

const centerHandleIcon = L.divIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#22c55e;border:2px solid #fff;box-sizing:border-box;cursor:move;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
});

interface MapContainerProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  onBoundsChange?: (bbox: BBox) => void;
  externalBounds?: BBox | null;
  onPaste?: (bbox: BBox) => void;
  className?: string;
  // Preview mode props
  showPreview?: boolean;
  layerStyles?: Record<LayerName, LayerStyle>;
  outputMode?: OutputMode;
  previewOpacity?: number;
}

type HandleId = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'center';

// Inner component that has access to map instance
function MapController({
  onBoundsChange,
  bounds,
  setBounds,
  onDragStart,
  onDragEnd,
}: {
  onBoundsChange?: (bbox: BBox) => void;
  bounds: L.LatLngBounds | null;
  setBounds: (b: L.LatLngBounds) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const map = useMap();
  const initializedRef = useRef(false);

  // Initialize rectangle on first render
  useEffect(() => {
    if (initializedRef.current) return;

    const initBounds = () => {
      const viewBounds = map.getBounds();
      if (!viewBounds.isValid()) {
        setTimeout(initBounds, 100);
        return;
      }

      const sw = viewBounds.getSouthWest();
      const ne = viewBounds.getNorthEast();
      const padLat = (ne.lat - sw.lat) * 0.2;
      const padLon = (ne.lng - sw.lng) * 0.2;

      const rectBounds = L.latLngBounds(
        [sw.lat + padLat, sw.lng + padLon],
        [ne.lat - padLat, ne.lng - padLon]
      );

      setBounds(rectBounds);
      initializedRef.current = true;
    };

    map.whenReady(() => {
      setTimeout(initBounds, 100);
    });
  }, [map, setBounds]);

  // Update bbox callback when bounds change
  useEffect(() => {
    if (bounds && bounds.isValid() && onBoundsChange) {
      onBoundsChange({
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
      });
    }
  }, [bounds, onBoundsChange]);

  const applyHandleDrag = useCallback((handle: HandleId, pos: L.LatLng) => {
    if (!bounds) return;

    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    let minLat = sw.lat;
    let minLon = sw.lng;
    let maxLat = ne.lat;
    let maxLon = ne.lng;

    switch (handle) {
      case 'nw': maxLat = pos.lat; minLon = pos.lng; break;
      case 'ne': maxLat = pos.lat; maxLon = pos.lng; break;
      case 'sw': minLat = pos.lat; minLon = pos.lng; break;
      case 'se': minLat = pos.lat; maxLon = pos.lng; break;
      case 'n': maxLat = pos.lat; break;
      case 's': minLat = pos.lat; break;
      case 'w': minLon = pos.lng; break;
      case 'e': maxLon = pos.lng; break;
      case 'center': {
        const center = bounds.getCenter();
        const dLat = pos.lat - center.lat;
        const dLon = pos.lng - center.lng;
        minLat += dLat; maxLat += dLat;
        minLon += dLon; maxLon += dLon;
        break;
      }
    }

    const newBounds = L.latLngBounds(
      [Math.min(minLat, maxLat), Math.min(minLon, maxLon)],
      [Math.max(minLat, maxLat), Math.max(minLon, maxLon)]
    );
    setBounds(newBounds);
  }, [bounds, setBounds]);

  if (!bounds) return null;

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const nw: [number, number] = [ne.lat, sw.lng];
  const se: [number, number] = [sw.lat, ne.lng];
  const center = bounds.getCenter();

  const handlePositions: Record<HandleId, [number, number]> = {
    nw: nw,
    ne: [ne.lat, ne.lng],
    sw: [sw.lat, sw.lng],
    se: se,
    n: [ne.lat, (sw.lng + ne.lng) / 2],
    s: [sw.lat, (sw.lng + ne.lng) / 2],
    w: [(sw.lat + ne.lat) / 2, sw.lng],
    e: [(sw.lat + ne.lat) / 2, ne.lng],
    center: [center.lat, center.lng],
  };

  return (
    <>
      <Rectangle
        bounds={bounds}
        pathOptions={{
          color: '#22c55e',
          weight: 3,
          fillColor: '#22c55e',
          fillOpacity: 0.1,
        }}
      />
      {Object.entries(handlePositions).map(([id, pos]) => (
        <Marker
          key={id}
          position={pos}
          icon={id === 'center' ? centerHandleIcon : handleIcon}
          draggable
          eventHandlers={{
            dragstart: () => onDragStart?.(),
            drag: (e) => {
              const marker = e.target as L.Marker;
              applyHandleDrag(id as HandleId, marker.getLatLng());
            },
            dragend: () => onDragEnd?.(),
          }}
        />
      ))}
    </>
  );
}

// Search component
function SearchControl({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const map = useMap();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await response.json();

      if (!data.length) {
        setError('Location not found');
        return;
      }

      const result = data[0];
      let south = parseFloat(result.boundingbox[0]);
      let north = parseFloat(result.boundingbox[1]);
      let west = parseFloat(result.boundingbox[2]);
      let east = parseFloat(result.boundingbox[3]);

      if (!isFinite(south) || south === north) {
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        south = lat - 0.05; north = lat + 0.05;
        west = lon - 0.05; east = lon + 0.05;
      }

      map.fitBounds([[south, west], [north, east]], { maxZoom: 14 });
      onSearch(query);
    } catch {
      setError('Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="absolute top-4 left-4 z-[1000] max-w-sm">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a location..."
          className="flex-1 px-4 py-2 rounded-lg bg-white border border-neutral-200 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm"
        >
          {isSearching ? '...' : 'Search'}
        </button>
      </form>
      {error && (
        <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

// Map controls (fit to view, copy, paste)
function MapControls({
  bounds,
  setBounds,
  onPaste,
}: {
  bounds: L.LatLngBounds | null;
  setBounds: (b: L.LatLngBounds) => void;
  onPaste?: (bbox: BBox) => void;
}) {
  const map = useMap();
  const [copyState, setCopyState] = useState<'idle' | 'success' | 'error'>('idle');
  const [pasteState, setPasteState] = useState<'idle' | 'success' | 'error'>('idle');

  const handleFitToView = () => {
    const viewBounds = map.getBounds();
    const sw = viewBounds.getSouthWest();
    const ne = viewBounds.getNorthEast();
    const padLat = (ne.lat - sw.lat) * 0.2;
    const padLon = (ne.lng - sw.lng) * 0.2;

    const rectBounds = L.latLngBounds(
      [sw.lat + padLat, sw.lng + padLon],
      [ne.lat - padLat, ne.lng - padLon]
    );
    setBounds(rectBounds);
  };

  const handleCopy = async () => {
    if (!bounds) return;

    try {
      const bbox = {
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
      };
      await navigator.clipboard.writeText(JSON.stringify(bbox));
      setCopyState('success');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 1500);
    }
  };

  const handlePaste = async () => {
    try {
      let text: string;

      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      } else {
        const manual = window.prompt('Paste area coordinates:');
        if (!manual) return;
        text = manual;
      }

      text = text.trim();
      if (!text) return;

      let pastedBbox: BBox | null = null;

      // Try JSON first
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          typeof parsed.minLat === 'number' &&
          typeof parsed.minLon === 'number' &&
          typeof parsed.maxLat === 'number' &&
          typeof parsed.maxLon === 'number'
        ) {
          pastedBbox = parsed as BBox;
        }
      } catch {
        // Fall back to CSV-style parsing
      }

      // Try comma/space separated
      if (!pastedBbox) {
        const parts = text.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 4) {
          const [minLat, minLon, maxLat, maxLon] = parts.map(parseFloat);
          if ([minLat, minLon, maxLat, maxLon].every(isFinite)) {
            pastedBbox = { minLat, minLon, maxLat, maxLon };
          }
        }
      }

      if (!pastedBbox) {
        throw new Error('Invalid format');
      }

      const newBounds = L.latLngBounds(
        [pastedBbox.minLat, pastedBbox.minLon],
        [pastedBbox.maxLat, pastedBbox.maxLon]
      );

      map.fitBounds(newBounds, { maxZoom: 16, padding: [20, 20] });
      setBounds(newBounds);
      onPaste?.(pastedBbox);

      setPasteState('success');
      setTimeout(() => setPasteState('idle'), 1500);
    } catch {
      setPasteState('error');
      setTimeout(() => setPasteState('idle'), 1500);
    }
  };

  const btnBase = "px-3 py-2 rounded-lg text-xs shadow-sm border transition-colors";
  const btnNormal = "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50";
  const btnSuccess = "bg-green-50 text-green-700 border-green-300";
  const btnError = "bg-red-50 text-red-700 border-red-300";

  return (
    <div className="absolute bottom-4 left-4 z-[1000] flex gap-2">
      <button onClick={handleFitToView} className={`${btnBase} ${btnNormal}`}>
        Fit to View
      </button>
      <button
        onClick={handleCopy}
        disabled={!bounds}
        className={`${btnBase} ${
          copyState === 'success' ? btnSuccess :
          copyState === 'error' ? btnError : btnNormal
        } disabled:opacity-50`}
      >
        {copyState === 'success' ? 'Copied!' : copyState === 'error' ? 'Failed' : 'Copy'}
      </button>
      <button
        onClick={handlePaste}
        className={`${btnBase} ${
          pasteState === 'success' ? btnSuccess :
          pasteState === 'error' ? btnError : btnNormal
        }`}
      >
        {pasteState === 'success' ? 'Pasted!' : pasteState === 'error' ? 'Invalid' : 'Paste'}
      </button>
    </div>
  );
}

// Handle external bounds changes (paste area)
function ExternalBoundsHandler({
  externalBounds,
  setBounds
}: {
  externalBounds?: BBox | null;
  setBounds: (b: L.LatLngBounds) => void;
}) {
  const map = useMap();
  const lastExternalRef = useRef<string | null>(null);

  useEffect(() => {
    if (!externalBounds) return;

    const key = JSON.stringify(externalBounds);
    if (key === lastExternalRef.current) return;
    lastExternalRef.current = key;

    const newBounds = L.latLngBounds(
      [externalBounds.minLat, externalBounds.minLon],
      [externalBounds.maxLat, externalBounds.maxLon]
    );

    map.fitBounds(newBounds, { maxZoom: 16, padding: [20, 20] });
    setBounds(newBounds);
  }, [externalBounds, map, setBounds]);

  return null;
}

export function MapContainer({
  initialCenter = [40.7128, -74.006],
  initialZoom = 12,
  onBoundsChange,
  externalBounds,
  onPaste,
  className = '',
  showPreview = false,
  layerStyles,
  outputMode = 'combined',
  previewOpacity = 0.9,
}: MapContainerProps) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [currentBbox, setCurrentBbox] = useState<BBox | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Track current bbox for preview
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      setCurrentBbox({
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
      });
    }
  }, [bounds]);

  return (
    <div className={`relative ${className}`} style={{ height: '100%', minHeight: '400px' }}>
      <LeafletMapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=TsSgpJiZhqkLRefl11Kl"
          tileSize={512}
          zoomOffset={-1}
        />
        <ZoomControl position="bottomright" />
        <MapController
          onBoundsChange={onBoundsChange}
          bounds={bounds}
          setBounds={setBounds}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => setIsDragging(false)}
        />
        <ExternalBoundsHandler externalBounds={externalBounds} setBounds={setBounds} />
        <SearchControl onSearch={() => {}} />
        <MapControls bounds={bounds} setBounds={setBounds} onPaste={onPaste} />
        {layerStyles && (
          <SvgPreview
            bbox={currentBbox}
            layerStyles={layerStyles}
            enabled={showPreview && !isDragging}
          />
        )}
      </LeafletMapContainer>
    </div>
  );
}
