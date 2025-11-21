import React, { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  useMapEvents,
  Rectangle,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { LatLngBounds } from "leaflet";
import type { BBox } from "../types";

interface MapViewProps {
  onBoundsChange: (bbox: BBox) => void;
}

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]; // NYC
const DEFAULT_ZOOM = 12;

const BoundsTracker: React.FC<{ onBoundsChange: (bbox: BBox) => void }> = ({
  onBoundsChange,
}) => {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      reportBounds(b);
    },
    zoomend: () => {
      const b = map.getBounds();
      reportBounds(b);
    },
  });

  const reportBounds = (b: LatLngBounds) => {
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const bbox: BBox = {
      minLat: sw.lat,
      minLon: sw.lng,
      maxLat: ne.lat,
      maxLon: ne.lng,
    };
    onBoundsChange(bbox);
  };

  useEffect(() => {
    // initial
    reportBounds(map.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({ onBoundsChange }) => {
  const boundsRef = useRef<LatLngBounds | null>(null);

  const handleBoundsUpdate = (bbox: BBox) => {
    const sw = L.latLng(bbox.minLat, bbox.minLon);
    const ne = L.latLng(bbox.maxLat, bbox.maxLon);
    boundsRef.current = L.latLngBounds(sw, ne);
    onBoundsChange(bbox);
  };

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: "100%", height: "100%" }}
      preferCanvas
    >
      {/* Raster base (OSM) */}
      <TileLayer
        // you can swap this to any OSM-like server you prefer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />

      <BoundsTracker onBoundsChange={handleBoundsUpdate} />

      {/* Visual hint: show current bbox as a rectangle */}
      {boundsRef.current && (
        <Rectangle
          bounds={boundsRef.current}
          pathOptions={{
            color: "#ff6600",
            weight: 1,
            fillOpacity: 0,
          }}
        />
      )}
    </MapContainer>
  );
};
