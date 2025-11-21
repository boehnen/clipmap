import { LayerName, ProjectedFeature } from "../types";
import { mercatorToSvg, defaultStrokeWidth } from "../geo/projection";

function roadStrokeWidth(
  tags: Record<string, string>,
  canvas: { width: number; height: number }
): number {
  const highway = tags["highway"] || "";
  const base = Math.max(canvas.width, canvas.height);
  const unit = base / 2048;

  switch (highway) {
    case "motorway":
    case "motorway_link":
      return 4.0 * unit;
    case "trunk":
    case "trunk_link":
      return 3.4 * unit;
    case "primary":
    case "primary_link":
      return 3.0 * unit;
    case "secondary":
    case "secondary_link":
      return 2.4 * unit;
    case "tertiary":
    case "tertiary_link":
      return 2.0 * unit;
    case "unclassified":
    case "residential":
    case "living_street":
    case "service":
      return 1.5 * unit;
    case "track":
    case "path":
    case "footway":
    case "cycleway":
    case "bridleway":
    case "steps":
      return 1.0 * unit;
    default:
      return 1.8 * unit;
  }
}

function isClosed(coords: [number, number][]): boolean {
  if (coords.length < 4) return false;
  const [x0, y0] = coords[0];
  const [x1, y1] = coords[coords.length - 1];
  return Math.abs(x0 - x1) < 1e-6 && Math.abs(y0 - y1) < 1e-6;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function generateSvgForLayer(
  layerName: LayerName,
  features: ProjectedFeature[],
  bboxMercator: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number }
): string {
  const { width, height } = canvas;
  const { minx, maxx, miny, maxy } = bboxMercator;

  const svgParts: string[] = [];
  svgParts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  );
  svgParts.push(`<g id="layer-${layerName}">`);

  // LABELS: render as <text>, not paths
  if (layerName === "labels") {
    const base = Math.max(width, height);
    const baseFont = Math.max(10, Math.min(28, base / 220));

    for (const feat of features) {
      if (!feat.coords.length) continue;
      const name = feat.tags["name"];
      if (!name) continue;

      const [mx, my] = feat.coords[0];
      const [sx, sy] = mercatorToSvg(mx, my, minx, maxx, miny, maxy, width, height);

      svgParts.push(
        `<text x="${sx.toFixed(2)}" y="${sy.toFixed(
          2
        )}" font-size="${baseFont.toFixed(
          1
        )}" text-anchor="middle" fill="#000">${escapeXml(name)}</text>`
      );
    }

    svgParts.push(`</g>`);
    svgParts.push("</svg>");
    return svgParts.join("\n");
  }

  // WATER + LAND: multipolygons with holes (evenodd)
  if (layerName === "water" || layerName === "land") {
    const fillColor = layerName === "water" ? "#b3d9ff" : "#f5f3ef";

    const grouped = new Map<string, ProjectedFeature[]>();
    const ungrouped: ProjectedFeature[] = [];

    for (const feat of features) {
      if (feat.relationId != null) {
        const key = String(feat.relationId);
        const arr = grouped.get(key);
        if (arr) arr.push(feat);
        else grouped.set(key, [feat]);
      } else {
        ungrouped.push(feat);
      }
    }

    const buildPathForCoords = (coords: [number, number][]) => {
      let d = "";
      coords.forEach(([mx, my], i) => {
        const [sx, sy] = mercatorToSvg(
          mx,
          my,
          minx,
          maxx,
          miny,
          maxy,
          width,
          height
        );
        d += `${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)} `;
      });
      if (isClosed(coords)) d += "Z";
      return d;
    };

    // Relation-based multipolygons: outers + inners
    for (const [, feats] of grouped) {
      const outers = feats.filter(f => f.role !== "inner");
      const inners = feats.filter(f => f.role === "inner");

      if (!outers.length) continue;

      let d = "";
      for (const f of outers) {
        d += buildPathForCoords(f.coords);
      }
      for (const f of inners) {
        d += buildPathForCoords(f.coords);
      }

      svgParts.push(
        `<path d="${d.trim()}" fill="${fillColor}" stroke="none" stroke-width="0" fill-rule="evenodd" />`
      );
    }

    // Ungrouped standalone polygons
    for (const feat of ungrouped) {
      if (feat.coords.length < 3) continue;
      let d = buildPathForCoords(feat.coords);
      svgParts.push(
        `<path d="${d.trim()}" fill="${fillColor}" stroke="none" stroke-width="0" />`
      );
    }

    svgParts.push(`</g>`);
    svgParts.push("</svg>");
    return svgParts.join("\n");
  }

  // All other layers: standard path rendering
  for (const feat of features) {
    const coords = feat.coords;
    if (coords.length < 2) continue;

    const closed = isClosed(coords);

    let d = "";
    coords.forEach(([mx, my], i) => {
      const [sx, sy] = mercatorToSvg(mx, my, minx, maxx, miny, maxy, width, height);
      d += `${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)} `;
    });

    // Special styling for railways: solid base + dotted overlay
    if (layerName === "railways") {
      const baseWidth = defaultStrokeWidth("railways", canvas);
      const dotWidth = baseWidth * 2;
      const gap = baseWidth * 3;

      // base solid stroke
      svgParts.push(
        `<path d="${d.trim()}" stroke="#000" stroke-width="${baseWidth}" fill="none" />`
      );

      // dotted overlay
      svgParts.push(
        `<path d="${d.trim()}" stroke="#000" stroke-width="${dotWidth}" fill="none" stroke-linecap="round" stroke-dasharray="0,${gap.toFixed(
          2
        )}" />`
      );

      // skip generic rendering
      continue;
    }

    let stroke = "#000";
    let strokeWidth: number;
    let fill = "none";

    if (layerName === "roads") {
      strokeWidth = roadStrokeWidth(feat.tags, canvas);
    } else {
      strokeWidth = defaultStrokeWidth(layerName, canvas);
    }

    if (layerName === "buildings" && closed) {
      fill = "#222";
      stroke = "none";
      strokeWidth = 0;
      d += "Z";
    } else if (layerName === "parks" && closed) {
      fill = "#cdeac0";
      stroke = "none";
      strokeWidth = 0;
      d += "Z";
    }

    svgParts.push(
      `<path d="${d.trim()}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" />`
    );
  }

  svgParts.push(`</g>`);
  svgParts.push("</svg>");
  return svgParts.join("\n");
}
