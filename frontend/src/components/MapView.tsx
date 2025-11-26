// frontend/src/components/MapView.tsx
import React, { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Rectangle,
  Marker,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L, { LatLngBounds, LatLng } from "leaflet";
import type { BBox } from "../types";

const DEFAULT_CENTER: [number, number] = [40.7128, -74.006]; // NYC
const DEFAULT_ZOOM = 12;

const EXTENT_MAX_DEG = 4;

export type DetailLevel = "fine" | "medium" | "coarse";

export interface ExportRegionInfo {
  bbox: BBox;
  widthKm: number;
  heightKm: number;
  areaKm2: number;
  normalizedSpanDeg: number;
  detailLevel: DetailLevel;
  isTooBig: boolean;
}

interface MapViewProps {
  onExportRegionChange: (info: ExportRegionInfo) => void;
  searchTerm: string;
  searchToken: number; // incremented in App to trigger search
  externalBBox: BBox | null;
  externalBBoxToken: number;
  onSearchStateChange?: (isSearching: boolean) => void;
  syncToViewportToken?: number; // incremented in App to sync rectangle to viewport
}

// Simple haversine distance between two points (km)
function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h =
    sinDLat * sinDLat +
    sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

type HandleId =
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "w"
  | "e"
  | "center";

const handleIcon = L.divIcon({
  className: "export-handle",
  iconSize: [10, 10],
  html: `<div style="width:10px;height:10px;border-radius:2px;background:#fff;border:2px solid #111;box-sizing:border-box;"></div>`,
});

function ExportController({
  onExportRegionChange,
  searchTerm,
  searchToken,
  externalBBox,
  externalBBoxToken,
  onSearchStateChange,
  syncToViewportToken,
}: MapViewProps) {
  const map = useMap();
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  const [tooBig, setTooBig] = useState(false);

    const updateExportBounds = (b: LatLngBounds) => {
    setBounds(b);

    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const center = b.getCenter();

    const widthKm = haversineKm(
      L.latLng(center.lat, sw.lng),
      L.latLng(center.lat, ne.lng)
    );
    const heightKm = haversineKm(
      L.latLng(sw.lat, center.lng),
      L.latLng(ne.lat, center.lng)
    );
    const areaKm2 = widthKm * heightKm;

    // --- normalized span in degrees (same formula as backend) ---
    const latSpan = Math.abs(ne.lat - sw.lat);
    const lonSpan = Math.abs(ne.lng - sw.lng);
    const latMid = (ne.lat + sw.lat) / 2;
    const latMidRad = (latMid * Math.PI) / 180;
    const normalizedSpanDeg = Math.max(
      latSpan,
      Math.abs(lonSpan * Math.cos(latMidRad))
    );

    let detailLevel: DetailLevel;
    if (normalizedSpanDeg <= 0.2) {
      detailLevel = "fine";
    } else if (normalizedSpanDeg <= 0.8) {
      detailLevel = "medium";
    } else {
      detailLevel = "coarse";
    }

    const isTooBig = normalizedSpanDeg > EXTENT_MAX_DEG;
    setTooBig(isTooBig);

    const bbox: BBox = {
      minLat: sw.lat,
      minLon: sw.lng,
      maxLat: ne.lat,
      maxLon: ne.lng,
    };

    onExportRegionChange({
      bbox,
      widthKm,
      heightKm,
      areaKm2,
      normalizedSpanDeg,
      detailLevel,
      isTooBig,
    });
  };

  // initial rectangle (once map is ready)
  useEffect(() => {
    const initial = map.getBounds();
    const sw = initial.getSouthWest();
    const ne = initial.getNorthEast();

    const padLat = (ne.lat - sw.lat) * 0.2;
    const padLon = (ne.lng - sw.lng) * 0.2;

    const rect = L.latLngBounds(
      L.latLng(sw.lat + padLat, sw.lng + padLon),
      L.latLng(ne.lat - padLat, ne.lng - padLon)
    );
    updateExportBounds(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle search
  useEffect(() => {
    if (!searchTerm.trim()) {
      onSearchStateChange?.(false);
      return;
    }

    const doSearch = async () => {
      onSearchStateChange?.(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchTerm
        )}&limit=1`;
        const resp = await fetch(url, {
          headers: {
            "Accept-Language": "en",
          },
        });
        const data: any[] = await resp.json();
        if (!data.length) {
          onSearchStateChange?.(false);
          return;
        }

        const first = data[0];

        let south = parseFloat(first.boundingbox[0]);
        let north = parseFloat(first.boundingbox[1]);
        let west = parseFloat(first.boundingbox[2]);
        let east = parseFloat(first.boundingbox[3]);

        if (!isFinite(south) || !isFinite(north) || south === north) {
          const lat = parseFloat(first.lat);
          const lon = parseFloat(first.lon);
          const delta = 0.05;
          south = lat - delta;
          north = lat + delta;
          west = lon - delta;
          east = lon + delta;
        }

        const searchBounds = L.latLngBounds(
          L.latLng(south, west),
          L.latLng(north, east)
        );

        map.fitBounds(searchBounds, { maxZoom: 14 });

        const sbSw = searchBounds.getSouthWest();
        const sbNe = searchBounds.getNorthEast();
        const padLat = (sbNe.lat - sbSw.lat) * 0.25;
        const padLon = (sbNe.lng - sbSw.lng) * 0.25;

        const rect = L.latLngBounds(
          L.latLng(sbSw.lat + padLat, sbSw.lng + padLon),
          L.latLng(sbNe.lat - padLat, sbNe.lng - padLon)
        );
        updateExportBounds(rect);
      } catch (err) {
        console.error("Search failed", err);
      } finally {
        onSearchStateChange?.(false);
      }
    };

    void doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchToken]);

  // Handle external bbox changes (paste area)
  useEffect(() => {
    if (!externalBBox) return;

    const sw = L.latLng(externalBBox.minLat, externalBBox.minLon);
    const ne = L.latLng(externalBBox.maxLat, externalBBox.maxLon);
    const newBounds = L.latLngBounds(sw, ne);

    map.fitBounds(newBounds, { maxZoom: 14 });
    updateExportBounds(newBounds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalBBoxToken]);

  // Handle sync to viewport (move rectangle to current map view)
  useEffect(() => {
    if (syncToViewportToken === undefined || syncToViewportToken === 0) return;

    const viewportBounds = map.getBounds();
    const sw = viewportBounds.getSouthWest();
    const ne = viewportBounds.getNorthEast();

    // Apply 20% padding (same as initial rectangle)
    const padLat = (ne.lat - sw.lat) * 0.2;
    const padLon = (ne.lng - sw.lng) * 0.2;

    const rect = L.latLngBounds(
      L.latLng(sw.lat + padLat, sw.lng + padLon),
      L.latLng(ne.lat - padLat, ne.lng - padLon)
    );
    updateExportBounds(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncToViewportToken]);

  const applyHandleDrag = (handle: HandleId, pos: LatLng) => {
    setBounds((prev) => {
      if (!prev) return prev;

      const sw = prev.getSouthWest();
      const ne = prev.getNorthEast();

      let minLat = sw.lat;
      let minLon = sw.lng;
      let maxLat = ne.lat;
      let maxLon = ne.lng;

      switch (handle) {
        case "nw":
          maxLat = pos.lat;
          minLon = pos.lng;
          break;
        case "ne":
          maxLat = pos.lat;
          maxLon = pos.lng;
          break;
        case "sw":
          minLat = pos.lat;
          minLon = pos.lng;
          break;
        case "se":
          minLat = pos.lat;
          maxLon = pos.lng;
          break;
        case "n":
          maxLat = pos.lat;
          break;
        case "s":
          minLat = pos.lat;
          break;
        case "w":
          minLon = pos.lng;
          break;
        case "e":
          maxLon = pos.lng;
          break;
        case "center": {
          const center = prev.getCenter();
          const dLat = pos.lat - center.lat;
          const dLon = pos.lng - center.lng;
          minLat += dLat;
          maxLat += dLat;
          minLon += dLon;
          maxLon += dLon;
          break;
        }
      }

      const newSw = L.latLng(Math.min(minLat, maxLat), Math.min(minLon, maxLon));
      const newNe = L.latLng(Math.max(minLat, maxLat), Math.max(minLon, maxLon));
      const next = L.latLngBounds(newSw, newNe);
      updateExportBounds(next);
      return next;
    });
  };

  if (!bounds) return null;

  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const nw = L.latLng(ne.lat, sw.lng);
  const se = L.latLng(sw.lat, ne.lng);
  const center = bounds.getCenter();

  const nMid = L.latLng(ne.lat, (sw.lng + ne.lng) / 2);
  const sMid = L.latLng(sw.lat, (sw.lng + ne.lng) / 2);
  const wMid = L.latLng((sw.lat + ne.lat) / 2, sw.lng);
  const eMid = L.latLng((sw.lat + ne.lat) / 2, ne.lng);

  const color = tooBig ? "#ff3b3b" : "#00ff7b";

  const rectOpts = {
    color,
    weight: 2,
    fillOpacity: 0.12,
    fillColor: color,
  } as const;

  const makeHandle = (id: HandleId, position: LatLng) => (
    <Marker
      key={id}
      position={position}
      icon={handleIcon}
      draggable
      eventHandlers={{
        drag: (e) => {
          const m = e.target as L.Marker;
          applyHandleDrag(id, m.getLatLng());
        },
      }}
    />
  );

  return (
    <>
      <Rectangle bounds={bounds} pathOptions={rectOpts} />
      {makeHandle("nw", nw)}
      {makeHandle("ne", ne)}
      {makeHandle("sw", sw)}
      {makeHandle("se", se)}
      {makeHandle("n", nMid)}
      {makeHandle("s", sMid)}
      {makeHandle("w", wMid)}
      {makeHandle("e", eMid)}
      {makeHandle("center", center)}
    </>
  );
}

export const MapView: React.FC<MapViewProps> = (props) => {
  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      style={{ width: "100%", height: "100%" }}
      preferCanvas
      zoomControl={false}
    >
      <TileLayer
        url="https://api.maptiler.com/maps/base-v4/{z}/{x}/{y}.png?key=TsSgpJiZhqkLRefl11Kl&language=en"
        tileSize={512}
        zoomOffset={-1}
      />
      <ExportController {...props} />
    </MapContainer>
  );
};
