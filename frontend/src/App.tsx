import React, { useState } from "react";
import { MapView } from "./components/MapView";
import { LayerSelector } from "./components/LayerSelector";
import type { BBox, LayerConfig, MapExportRequest } from "./types";
import { exportZip } from "./api";

const INITIAL_LAYERS: LayerConfig[] = [
  { name: "land",      visible: true },
  { name: "water",     visible: true },
  { name: "parks",     visible: true },
  { name: "roads",     visible: true },
  { name: "railways",  visible: false },
  { name: "buildings", visible: true },
];

const App: React.FC = () => {
  const [bbox, setBbox] = useState<BBox | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>(INITIAL_LAYERS);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleExport = async () => {
    setError(null);
    if (!bbox) {
      setError("Map bounds not ready yet. Try moving/zooming the map.");
      return;
    }

    const payload: MapExportRequest = { bbox, layers };

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
      setError(e?.message || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const toggleAll = (visible: boolean) => {
    setLayers(prev => prev.map(l => ({ ...l, visible })));
  };

  const visibleLayerNames = layers.filter(l => l.visible).map(l => l.name);

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
      {/* Fullscreen map, explicitly behind controls */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <MapView onBoundsChange={setBbox} />
      </div>

      {/* Floating control panel, above everything */}
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
          zIndex: 2000, // make sure we sit on top of Leaflet
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 20, margin: 0 }}>ClipMap</h1>
            <p style={{ fontSize: 12, color: "#bbbbbb", marginTop: 4 }}>
              Pan &amp; zoom to frame your artwork. Visible area = export bbox.
            </p>
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: 14, marginBottom: 6 }}>Basic</h2>
          <div>
            <strong style={{ fontSize: 12 }}>Layers</strong>
            <div style={{ marginTop: 4 }}>
              <LayerSelector layers={layers} onChange={setLayers} />
            </div>

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

          <div style={{ marginTop: 8, fontSize: 11, color: "#cccccc" }}>
            <div>
              <strong>Current bbox</strong>
            </div>
            {bbox ? (
              <>
                <div>
                  minLat: {bbox.minLat.toFixed(5)}, minLon:{" "}
                  {bbox.minLon.toFixed(5)}
                </div>
                <div>
                  maxLat: {bbox.maxLat.toFixed(5)}, maxLon:{" "}
                  {bbox.maxLon.toFixed(5)}
                </div>
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
            disabled={isExporting || !bbox || visibleLayerNames.length === 0}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              background:
                isExporting || !bbox || visibleLayerNames.length === 0
                  ? "#444"
                  : "#f5f5f5",
              color:
                isExporting || !bbox || visibleLayerNames.length === 0
                  ? "#999"
                  : "#111",
              borderRadius: 6,
              border: "none",
              cursor:
                isExporting || !bbox || visibleLayerNames.length === 0
                  ? "not-allowed"
                  : "pointer",
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

        <section>
          <button
            type="button"
            onClick={() => setShowAdvanced(s => !s)}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #555",
              background: "#1b1b1b",
              color: "#ddd",
              cursor: "pointer",
            }}
          >
            {showAdvanced ? "Hide advanced options" : "Show advanced options"}
          </button>

          {showAdvanced && (
            <div
              style={{
                marginTop: 6,
                padding: 8,
                borderRadius: 4,
                border: "1px dashed #555",
                fontSize: 11,
                color: "#cccccc",
                background: "rgba(20,20,20,0.9)",
              }}
            >
              <p style={{ marginTop: 0 }}>Ideas for later:</p>
              <ul style={{ paddingLeft: 18, margin: 0 }}>
                <li>Theme presets (mono, blueprint, dark).</li>
                <li>Toggle attribution text.</li>
                <li>Road weight presets for huge prints.</li>
              </ul>
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
