import { LayerName, ProjectedFeature } from "../types";
import { mercatorToSvg, defaultStrokeWidth } from "../geo/projection";

function roadStrokeWidth(
  tags: Record<string, string>,
  canvas: { width: number; height: number }
): number {
  const highway = tags["highway"] || "";
  const base = Math.max(canvas.width, canvas.height);
  const unit = base / 2048; // scale with export size

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
      return 1.8 * unit; // fallback for anything weird
  }
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

  for (const feat of features) {
    const coords = feat.coords;
    if (coords.length < 2) continue;

    let d = "";
    coords.forEach(([mx, my], i) => {
      const [sx, sy] = mercatorToSvg(mx, my, minx, maxx, miny, maxy, width, height);
      d += `${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)} `;
    });

    let stroke = "#000";
    let strokeWidth: number;
    let fill = "none";

    if (layerName === "roads") {
      strokeWidth = roadStrokeWidth(feat.tags, canvas);
    } else {
      strokeWidth = defaultStrokeWidth(layerName, canvas);
    }

    if (layerName === "buildings") {
      fill = "#222";
      stroke = "none";       // clean building blocks, no outlines
      strokeWidth = 0;       // irrelevant when stroke="none"
      d += "Z";
    } else if (layerName === "water") {
      fill = "#b3d9ff";
      stroke = "none";
      strokeWidth = 0;
      d += "Z";
    } else if (layerName === "land") {
      fill = "#f5f3ef";
      stroke = "none";
      strokeWidth = 0;
      d += "Z";
    } else if (layerName === "parks") {
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
  svgParts.push(
    `<text x="10" y="${height - 10}" font-size="12" fill="#777">© OpenStreetMap contributors</text>`
  );
  svgParts.push("</svg>");
  return svgParts.join("\n");
}
