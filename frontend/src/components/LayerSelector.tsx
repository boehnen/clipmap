import React from "react";
import type { LayerConfig, LayerName } from "../types";

const ALL_LAYERS: { name: LayerName; label: string }[] = [
  { name: "land",       label: "Land" },
  { name: "water",      label: "Water" },
  { name: "parks",      label: "Parks / Green" },
  { name: "roads",      label: "Roads" },
  { name: "railways",   label: "Railways" },
  { name: "buildings",  label: "Buildings" },
  { name: "labels",     label: "Labels" },
];

interface Props {
  layers: LayerConfig[];
  onChange: (layers: LayerConfig[]) => void;
}

export const LayerSelector: React.FC<Props> = ({ layers, onChange }) => {
  const toggleLayer = (name: LayerName) => {
    const next = layers.map(l =>
      l.name === name ? { ...l, visible: !l.visible } : l
    );
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {ALL_LAYERS.map(layer => {
        const current = layers.find(l => l.name === layer.name);
        const checked = current ? current.visible : true;
        return (
          <label
            key={layer.name}
            style={{
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggleLayer(layer.name)}
            />
            {layer.label}
          </label>
        );
      })}
    </div>
  );
};
