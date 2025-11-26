// frontend/src/App.tsx
import React, { useState, useEffect } from "react";
import { MapView, type ExportRegionInfo } from "./components/MapView";
import { LayerSelector } from "./components/LayerSelector";
import type {
  BBox,
  LayerConfig,
  LayerName,
  MapExportRequest,
} from "./types";
import { exportZipWithProgress, type ExportProgress } from "./api";
import TutorialModal, {
  getDontShowTutorialFlag,
  setDontShowTutorialFlag,
} from "./components/TutorialModal";

const INITIAL_LAYERS: LayerConfig[] = [
  { name: "land", visible: true },
  { name: "water", visible: true },
  { name: "parks", visible: true },
  { name: "roads", visible: true },
  { name: "railways", visible: true },
  { name: "buildings", visible: false },
  { name: "labels", visible: false },
];

const KM_TO_MILES = 0.621371;
const KM2_TO_MI2 = 0.386102;
const EARTH_RADIUS_KM = 6371;
const EXTENT_MAX_DEG = 4;

// Simple haversine distance in km between two lat/lon points
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

// Rebuild an ExportRegionInfo from a BBox so paste works even in a fresh session
// Rebuild an ExportRegionInfo from a BBox so paste works even in a fresh session
function buildExportRegionFromBBox(bbox: BBox): ExportRegionInfo {
  const { minLat, minLon, maxLat, maxLon } = bbox;

  const widthKm = haversineKm(minLat, minLon, minLat, maxLon);
  const heightKm = haversineKm(minLat, minLon, maxLat, minLon);
  const areaKm2 = widthKm * heightKm;

  const latSpan = Math.abs(maxLat - minLat);
  const lonSpan = Math.abs(maxLon - minLon);
  const latMid = (maxLat + minLat) / 2;
  const latMidRad = (latMid * Math.PI) / 180;
  const normalizedSpanDeg = Math.max(
    latSpan,
    Math.abs(lonSpan * Math.cos(latMidRad))
  );

  let detailLevel: "fine" | "medium" | "coarse";
  if (normalizedSpanDeg <= 0.2) {
    detailLevel = "fine";
  } else if (normalizedSpanDeg <= 0.8) {
    detailLevel = "medium";
  } else {
    detailLevel = "coarse";
  }

  const isTooBig = normalizedSpanDeg > EXTENT_MAX_DEG;

  return {
    bbox,
    widthKm,
    heightKm,
    areaKm2,
    normalizedSpanDeg,
    detailLevel,
    isTooBig,
  };
}


function flashState(
    setter: React.Dispatch<React.SetStateAction<"idle" | "success" | "error">>,
    value: "success" | "error",
    duration = 1400
  ) {
    setter(value);
    window.setTimeout(() => setter("idle"), duration);
  }

const App: React.FC = () => {
  const [layers, setLayers] = useState<LayerConfig[]>(INITIAL_LAYERS);
  const [exportRegion, setExportRegion] = useState<ExportRegionInfo | null>(
    null
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchToken, setSearchToken] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // For programmatic rectangle updates (paste area)
  const [externalBBox, setExternalBBox] = useState<BBox | null>(null);
  const [externalBBoxToken, setExternalBBoxToken] = useState(0);
  
  // For syncing export rectangle to current viewport
  const [syncToViewportToken, setSyncToViewportToken] = useState(0);

  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const [pasteState, setPasteState] = useState<"idle" | "success" | "error">("idle");

  const copyLabel =
  copyState === "success"
    ? "Copied!"
    : copyState === "error"
    ? "Copy failed"
    : "Copy area";

const pasteLabel =
  pasteState === "success"
    ? "Pasted!"
    : pasteState === "error"
    ? "Paste failed"
    : "Paste area";

  useEffect(() => {
    if (!getDontShowTutorialFlag()) {
      setShowTutorial(true);
    }
  }, []);

  const visibleLayerNames: LayerName[] = layers
    .filter((l) => l.visible)
    .map((l) => l.name);

  const handleExport = async () => {
    setError(null);
    if (!exportRegion) {
      setError("Export area not ready yet.");
      return;
    }
    if (visibleLayerNames.length === 0) {
      setError("Select at least one layer to export.");
      return;
    }
    if (exportRegion.isTooBig) {
      setError("Export area is too large. Please shrink the rectangle.");
      return;
    }

    const payload: MapExportRequest = {
      bbox: exportRegion.bbox,
      layers: visibleLayerNames,
    };

    try {
      setIsExporting(true);
      setExportProgress({ step: "Starting...", progress: 0 });
      setError(null);
      
      const blob = await exportZipWithProgress(payload, (progress) => {
        setExportProgress(progress);
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clipmap_layers.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      
      // Show success briefly before clearing
      setTimeout(() => {
        setExportProgress(null);
      }, 1000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Export failed");
      setExportProgress(null);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleAll = (visible: boolean) => {
    setLayers((prev) => prev.map((l) => ({ ...l, visible })));
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearchToken((t) => t + 1);
  };

  const handleCopyArea = async () => {
    setError(null);
    setCopyState("idle");

    if (!exportRegion) {
      setError("Export area not ready yet.");
      setCopyState("error");
      flashState(setCopyState, "error");
      return;
    }

    const text = JSON.stringify(exportRegion.bbox);

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      flashState(setCopyState, "success");
    } catch (err) {
      console.error(err);
      setError("Failed to copy area to clipboard.");
      flashState(setCopyState, "error");
    }
  };


  const handlePasteArea = async () => {
    setError(null);
    setPasteState("idle");

    try {
      let text: string;

      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      } else {
        const manual = window.prompt("Paste area string here:");
        if (!manual) return;
        text = manual;
      }

      text = text.trim();
      if (!text) return;

      let bbox: BBox | null = null;

      // Try JSON first
      try {
        const parsed = JSON.parse(text);
        if (
          parsed &&
          typeof parsed.minLat === "number" &&
          typeof parsed.minLon === "number" &&
          typeof parsed.maxLat === "number" &&
          typeof parsed.maxLon === "number"
        ) {
          bbox = {
            minLat: parsed.minLat,
            minLon: parsed.minLon,
            maxLat: parsed.maxLat,
            maxLon: parsed.maxLon,
          };
        }
      } catch {
        // Ignore JSON error, fall back to CSV-style
      }

      if (!bbox) {
        const parts = text.split(/[,\s]+/).filter(Boolean);
        if (parts.length < 4) {
          throw new Error("Clipboard text is not a valid area format.");
        }
        const [minLatStr, minLonStr, maxLatStr, maxLonStr] = parts;
        const minLat = parseFloat(minLatStr);
        const minLon = parseFloat(minLonStr);
        const maxLat = parseFloat(maxLatStr);
        const maxLon = parseFloat(maxLonStr);
        if ([minLat, minLon, maxLat, maxLon].some((v) => Number.isNaN(v))) {
          throw new Error("Clipboard text contains invalid numbers.");
        }
        bbox = { minLat, minLon, maxLat, maxLon };
      }

      const region = buildExportRegionFromBBox(bbox);
      setExportRegion(region);

      setExternalBBox(bbox);
      setExternalBBoxToken((t) => t + 1);

      flashState(setPasteState, "success");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to paste area from clipboard.");
      flashState(setPasteState, "error");
    }
  };


  const disabled =
    isExporting ||
    !exportRegion ||
    visibleLayerNames.length === 0 ||
    exportRegion.isTooBig;

  const widthMiles = exportRegion ? exportRegion.widthKm * KM_TO_MILES : null;
  const heightMiles = exportRegion ? exportRegion.heightKm * KM_TO_MILES : null;
  const areaMiles2 = exportRegion ? exportRegion.areaKm2 * KM2_TO_MI2 : null;

  const detailLevelLabel =
  exportRegion?.detailLevel === "fine"
    ? "Fine"
    : exportRegion?.detailLevel === "medium"
    ? "Medium"
    : exportRegion?.detailLevel === "coarse"
    ? "Coarse"
    : null;

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
      <TutorialModal
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        onDontShowAgain={() => {
          setDontShowTutorialFlag();
          setShowTutorial(false);
        }}
      />

      {/* Map layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
        }}
      >
        <MapView
          onExportRegionChange={setExportRegion}
          searchTerm={searchTerm}
          searchToken={searchToken}
          externalBBox={externalBBox}
          externalBBoxToken={externalBBoxToken}
          onSearchStateChange={setIsSearching}
          syncToViewportToken={syncToViewportToken}
        />
      </div>

      {/* Control panel */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          maxWidth: 380,
          padding: 16,
          borderRadius: 10,
          background: "rgba(15,15,15,0.9)",
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
          </div>
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #555",
              background: "#1b1b1b",
              color: "#ddd",
              cursor: "pointer",
              height: "fit-content",
            }}
          >
            How it works
          </button>
        </div>

        {/* Search */}
        <form onSubmit={onSearchSubmit} style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            placeholder="Search place (city, address...)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={isSearching}
            style={{
              flex: 1,
              fontSize: 12,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #444",
              background: "#111",
              color: "#f5f5f5",
              opacity: isSearching ? 0.6 : 1,
            }}
          />
          <button
            type="submit"
            disabled={isSearching || !searchTerm.trim()}
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 6,
              border: "none",
              background: isSearching || !searchTerm.trim() ? "#444" : "#f5f5f5",
              color: isSearching || !searchTerm.trim() ? "#999" : "#111",
              cursor: isSearching || !searchTerm.trim() ? "not-allowed" : "pointer",
              minWidth: 50,
            }}
          >
            {isSearching ? "..." : "Go"}
          </button>
        </form>

        {/* Layers */}
        <section>
          <h2 style={{ fontSize: 14, marginBottom: 6 }}>Layers</h2>
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
        </section>

        {/* Export area info */}
        <section style={{ fontSize: 11, color: "#cccccc" }}>
          <h2 style={{ fontSize: 14, marginBottom: 6 }}>Export Area</h2>
          {exportRegion ? (
            <>
              <div
                style={{
                  color: exportRegion.isTooBig ? "#ff8a80" : "#b2ffb2",
                  marginBottom: 2,
                }}
              >
                {widthMiles && heightMiles && areaMiles2 && (
                  <>
                    {widthMiles.toFixed(1)} × {heightMiles.toFixed(1)} miles (
                    {areaMiles2.toFixed(1)} sq mi)
                  </>
                )}
                {exportRegion.isTooBig && " — too large"}
              </div>

              {detailLevelLabel && (
                <div style={{ marginBottom: 2 }}>
                  Detail level:{" "}
                  <span style={{ fontWeight: 600 }}>{detailLevelLabel}</span>
                  {typeof exportRegion.normalizedSpanDeg === "number" && (
                    <> ({exportRegion.normalizedSpanDeg.toFixed(1)}° span)</>
                  )}
                </div>
              )}

              <div>
                South: {exportRegion.bbox.minLat.toFixed(5)}, West:{" "}
                {exportRegion.bbox.minLon.toFixed(5)}
              </div>

              <div>
                North: {exportRegion.bbox.maxLat.toFixed(5)}, East:{" "}
                {exportRegion.bbox.maxLon.toFixed(5)}
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={handleCopyArea}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border:
                      copyState === "success"
                        ? "1px solid #4caf50"
                        : copyState === "error"
                        ? "1px solid #f44336"
                        : "1px solid #444",
                    background:
                      copyState === "success"
                        ? "#224422"
                        : copyState === "error"
                        ? "#441818"
                        : "#222",
                    color: "#eee",
                    cursor: "pointer",
                    transition: "background 120ms ease, border-color 120ms ease",
                  }}
                >
                  {copyLabel}
                </button>

                <button
                  type="button"
                  onClick={handlePasteArea}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border:
                      pasteState === "success"
                        ? "1px solid #4caf50"
                        : pasteState === "error"
                        ? "1px solid #f44336"
                        : "1px solid #444",
                    background:
                      pasteState === "success"
                        ? "#224422"
                        : pasteState === "error"
                        ? "#441818"
                        : "#222",
                    color: "#eee",
                    cursor: "pointer",
                    transition: "background 120ms ease, border-color 120ms ease",
                  }}
                >
                  {pasteLabel}
                </button>

                <button
                  type="button"
                  onClick={() => setSyncToViewportToken((t) => t + 1)}
                  style={{
                    fontSize: 11,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid #444",
                    background: "#222",
                    color: "#eee",
                    cursor: "pointer",
                    transition: "background 120ms ease",
                  }}
                  title="Move export rectangle to current map view"
                >
                  Sync to view
                </button>
              </div>
            </>
          ) : (
            <div>Move the map a bit to initialize…</div>
          )}
        </section>

        {/* Export */}
        <section>
          <button
            type="button"
            onClick={handleExport}
            disabled={disabled || isExporting}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              background: disabled || isExporting ? "#444" : "#f5f5f5",
              color: disabled || isExporting ? "#999" : "#111",
              borderRadius: 6,
              border: "none",
              cursor: disabled || isExporting ? "not-allowed" : "pointer",
              width: "100%",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {isExporting && exportProgress ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                <div style={{ fontSize: 12, width: "100%", textAlign: "left" }}>
                  {exportProgress.step}
                </div>
                <div
                  style={{
                    width: "100%",
                    height: 4,
                    background: "rgba(0,0,0,0.2)",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${exportProgress.progress || 0}%`,
                      height: "100%",
                      background: "#4caf50",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            ) : (
              `Export ${visibleLayerNames.length} layer${
                visibleLayerNames.length === 1 ? "" : "s"
              } as ZIP`
            )}
          </button>
          {error && (
            <div style={{ color: "#ff8a80", fontSize: 11, marginTop: 6 }}>
              {error}
            </div>
          )}
        </section>

        {/* Support / Links */}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: 11,
          }}
        >
          <a
            href="https://www.buymeacoffee.com/boehnen"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #ffdd99",
              background: "#2b1a00",
              color: "#ffdd99",
              textDecoration: "none",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            ☕ Buy me a coffee
          </a>

          <a
            href="https://github.com/boehnen"
            target="_blank"
            rel="noreferrer"
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #444",
              background: "#1b1b1b",
              color: "#e0e0e0",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            Created by Justin Boehnen
          </a>
        </div>
      </div>
    </div>
  );
};

export default App;
