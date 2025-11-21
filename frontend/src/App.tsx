import React, { useState } from "react";
import { MapView } from "./components/MapView";
import { LayerSelector } from "./components/LayerSelector";
import type { BBox, LayerConfig, MapExportRequest, LayerName } from "./types";
import { exportZip } from "./api";

const INITIAL_LAYERS: LayerConfig[] = [
  { name: "land",      visible: true },
  { name: "water",     visible: true },
  { name: "parks",     visible: true },
  { name: "roads",     visible: true },
  { name: "railways",  visible: false },
  { name: "buildings", visible: true },
  { name: "labels",    visible: false },
];

// Must stay in sync (numerically) with backend extent limit
const EXTENT_MAX_DEG = 2.5;

function computeExtentStats(bbox: BBox) {
  const latSpan = Math.abs(bbox.maxLat - bbox.minLat);
  const lonSpan = Math.abs(bbox.maxLon - bbox.minLon);

  const latMid = (bbox.maxLat + bbox.minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;

  const kmPerDegLat = 111.32;
  const kmPerDegLon = Math.cos(latMidRad) * 111.32;

  const widthKm = Math.max(0, lonSpan * kmPerDegLon);
  const heightKm = Math.max(0, latSpan * kmPerDegLat);

  const normalizedSpanDeg = Math.max(
    latSpan,
    Math.abs(lonSpan * Math.cos(latMidRad))
  );

  const tooLarge = normalizedSpanDeg > EXTENT_MAX_DEG;

  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLon = (bbox.minLon + bbox.maxLon) / 2;

  return {
    widthKm,
    heightKm,
    centerLat,
    centerLon,
    tooLarge,
  };
}

const App: React.FC = () => {
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>(INITIAL_LAYERS);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    if (!bbox) {
      setError("Map area not ready yet. Try moving/zooming the map.");
      return;
    }

    const stats = computeExtentStats(bbox);
    if (stats.tooLarge) {
      setError("Selected area is too large. Zoom in for more detail.");
      return;
    }

    const visibleLayerNames: LayerName[] = layers
      .filter(l => l.visible)
      .map(l => l.name);

    if (visibleLayerNames.length === 0) {
      setError("Select at least one layer to export.");
      return;
    }

    const payload: MapExportRequest = {
      bbox,
      layers: visibleLayerNames,
    };

    try {
      setIsExporting(true);
      const blob = await exportZip(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clipmap_layers.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      setError(e?.response?.data?.message || e?.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const toggleAll = (visible: boolean) => {
    setLayers(prev => prev.map(l => ({ ...l, visible })));
  };

  const visibleLayerNames: LayerName[] = layers
    .filter(l => l.visible)
    .map(l => l.name);

  const extent = bbox ? computeExtentStats(bbox) : null;
  const extentTooLarge = extent?.tooLarge ?? false;

  const exportDisabled =
    isExporting || !bbox || visibleLayerNames.length === 0 || extentTooLarge;

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <MapView onBoundsChange={setBbox} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          maxWidth: 360,
          padding: 16,
          borderRadius: 10,
          background: "rgba(15,15,15,0.85)",
          color: "#f5f5f5",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          backdropFilter: "blur(6px)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 13,
          zIndex: 2000,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, margin: 0 }}>ClipMap</h1>
            <p style={{ fontSize: 12, color: "#bbbbbb", marginTop: 4 }}>
              Pan &amp; zoom to frame your artwork. Visible area = export region.
            </p>
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: 14, marginBottom: 6 }}>Layers</h2>
          <div>
            <LayerSelector layers={layers} onChange={setLayers} />

            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => toggleAll(true)}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid #444",
                  background: "#222",
                  color: "#eee",
                  cursor: "pointer",
                }}
              >
                Show all
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid #444",
                  background: "#222",
                  color: "#eee",
                  cursor: "pointer",
                }}
              >
                Hide all
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 10,
              fontSize: 11,
              color: extentTooLarge ? "#ff8a80" : "#cccccc",
            }}
          >
            <div>
              <strong>Current area</strong>
              {extentTooLarge && (
                <span style={{ marginLeft: 6 }}>
                  – too large, zoom in for better detail
                </span>
              )}
            </div>
            {bbox && extent ? (
              <>
                <div>
                  Center: {extent.centerLat.toFixed(4)},{" "}
                  {extent.centerLon.toFixed(4)}
                </div>
                <div>Approx width: {extent.widthKm.toFixed(1)} km</div>
                <div>Approx height: {extent.heightKm.toFixed(1)} km</div>
              </>
            ) : (
              <div>Move the map to initialize…</div>
            )}
          </div>
        </section>

        <section>
          <button
            type="button"
            onClick={handleExport}
            disabled={exportDisabled}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              background: exportDisabled ? "#444" : "#f5f5f5",
              color: exportDisabled ? "#999" : "#111",
              borderRadius: 6,
              border: "none",
              cursor: exportDisabled ? "not-allowed" : "pointer",
              width: "100%",
            }}
          >
            {isExporting
              ? "Exporting…"
              : `Export ${visibleLayerNames.length} layer${
                  visibleLayerNames.length === 1 ? "" : "s"
                } as ZIP`}
          </button>
          {error && (
            <div style={{ color: "#ff8a80", fontSize: 11, marginTop: 6 }}>
              {error}
            </div>
          )}
        </section>

        <div style={{ fontSize: 10, color: "#aaaaaa", marginTop: 4 }}>
          SVGs are designed to be edited in Figma, Illustrator, Photoshop, or
          Canva (recolor, clip, mask).
        </div>
      </div>
    </div>
  );
};

export default App;
