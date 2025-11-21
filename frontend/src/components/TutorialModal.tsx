import React, { useState } from "react";

const STORAGE_KEY = "clipmap_hide_tutorial";

type Step = {
  title: string;
  description: string;
  movieSrc: string;
};

const STEPS: Step[] = [
  {
    title: "1. Find your city",
    description:
      "Use the search bar or pan the map to find the area you want to turn into artwork.",
    movieSrc: "/tutorial/step1-find-city.mp4",
  },
  {
    title: "2. Adjust the export area",
    description:
      "Drag the handles on the bright rectangle to set the exact area you want to export.",
    movieSrc: "/tutorial/step2-adjust-extent.mp4",
  },
  {
    title: "3. Choose layers",
    description:
      "Toggle land, water, parks, roads, railways, buildings, and labels to get exactly the SVGs you need.",
    movieSrc: "/tutorial/step3-choose-layers.mp4",
  },
  {
    title: "4. Export and edit",
    description:
      "Click Export to download a ZIP. Open the SVGs in Figma, Illustrator, Photoshop, or Canva and style them however you like.",
    movieSrc: "/tutorial/step4-export-edit.mp4",
  },
];

interface TutorialModalProps {
  open: boolean;
  onClose: () => void;
  onDontShowAgain: () => void;
}

export function setDontShowTutorialFlag() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // ignore
  }
}

export function getDontShowTutorialFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const TutorialModal: React.FC<TutorialModalProps> = ({
  open,
  onClose,
  onDontShowAgain,
}) => {
  const [index, setIndex] = useState(0);

  if (!open) return null;

  const step = STEPS[index];

  const goPrev = () => {
    setIndex((i) => (i === 0 ? STEPS.length - 1 : i - 1));
  };

  const goNext = () => {
    setIndex((i) => (i === STEPS.length - 1 ? 0 : i + 1));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
      }}
    >
      <div
        style={{
          width: "min(640px, 96vw)",
          maxHeight: "92vh",
          background: "#111",
          color: "#f5f5f5",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,0.55)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              How ClipMap works
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "#ddd",
              fontSize: 18,
              cursor: "pointer",
              padding: 4,
            }}
            aria-label="Close tutorial"
          >
            ✕
          </button>
        </div>

        {/* Step title + description */}
        <div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            {step.title}
          </div>
          <div style={{ fontSize: 13, color: "#dddddd" }}>{step.description}</div>
        </div>

        {/* GIF area */}
        <div
          style={{
            position: "relative",
            borderRadius: 10,
            overflow: "hidden",
            background: "#000",
            border: "1px solid #333",
          }}
        >
          <video
            key={step.movieSrc}
            src={step.movieSrc}
            style={{
              width: "100%",
              display: "block",
            }}
            autoPlay
            muted
            loop
          />

          {/* Simple previous/next buttons overlaid */}
          <button
            type="button"
            onClick={goPrev}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              borderRadius: "999px",
              border: "none",
              padding: "4px 8px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goNext}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              borderRadius: "999px",
              border: "none",
              padding: "4px 8px",
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ›
          </button>
        </div>

        {/* Dots + controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 4,
          }}
        >
          {/* Dots */}
          <div style={{ display: "flex", gap: 6 }}>
            {STEPS.map((_s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  border: "none",
                  padding: 0,
                  background: i === index ? "#ffffff" : "#555",
                  cursor: "pointer",
                }}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={onDontShowAgain}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                borderRadius: 999,
                border: "1px solid #555",
                background: "#1c1c1c",
                color: "#ccc",
                cursor: "pointer",
              }}
            >
              Don&apos;t show again
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                borderRadius: 999,
                border: "none",
                background: "#f5f5f5",
                color: "#111",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
