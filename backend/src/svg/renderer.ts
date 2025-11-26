import { LayerName, ProjectedFeature, DetailLevel } from "../types";
import { mercatorToSvg, defaultStrokeWidth } from "../geo/projection";
import { douglasPeucker } from "../geo/simplify";
import { logger } from "../logger";
import * as polygonClipping from "polygon-clipping";
import { simplifyMultipolygonToSize } from "./simplifyToSize";
import { simplifyLinesToSize, Line } from "./simplifyLinesToSize";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

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


/**
 * Simplify a line feature based on extent size and canvas size
 * Uses continuous extent-based calculation instead of discrete detail levels
 */
function simplifyLineFeature(
  coords: [number, number][],
  bboxMercator: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  detail: DetailLevel // Still passed but not used for simplification
): [number, number][] {
  if (coords.length <= 2) return coords;
  
  // Calculate simplification epsilon based on extent size (continuous)
  const { minx, maxx, miny, maxy } = bboxMercator;
  const { width, height } = canvas;
  const spanX = maxx - minx;
  const spanY = maxy - miny;
  const span = Math.max(spanX, spanY);
  const pixels = Math.max(width, height);
  const extentArea = spanX * spanY;
  
  // Base epsilon: target ~1 point per 2.5 pixels for small extents
  const baseEpsilon = span / (pixels * 2.5);
  
  // Scale epsilon smoothly with extent size (larger extents need more simplification)
  const extentRatio = Math.sqrt(extentArea / (span * span));
  const logScale = Math.log10(1 + extentRatio * 9);
  let epsilon = baseEpsilon * (1 + logScale * 0.3); // More scaling for lines than polygons
  
  // Only simplify if line has enough points
  if (coords.length <= 4) return coords;
  
  return douglasPeucker(coords, epsilon) as [number, number][];
}

export function generateSvgForLayer(
  layerName: LayerName,
  features: ProjectedFeature[],
  bboxMercator: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number },
  detail: DetailLevel = "medium"
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

  // PARKS: render as single multipolygon (like water/land) for consistent simplification
  // Parks are now unioned and clipped as a batch, so render them the same way
  if (layerName === "parks") {
    // Build multipolygon from features (same approach as water/land)
    const outers: Polygon[] = [];
    const inners: Polygon[] = [];

    for (const f of features) {
      if (!f.coords || f.coords.length < 3) continue;
      const ring = f.coords as Ring;
      const poly: Polygon = [ring];

      if (f.role === "inner") {
        inners.push(poly);
      } else {
        outers.push(poly);
      }
    }

    let unionOuter: MultiPolygon | null = null;
    let unionInner: MultiPolygon | null = null;

    if (outers.length > 0) {
      if (outers.length === 1) {
        unionOuter = [outers[0]];
      } else {
        unionOuter = polygonClipping.union(
          outers[0] as any,
          ...outers.slice(1) as any[]
        ) as MultiPolygon;
      }
    }

    if (inners.length > 0) {
      if (inners.length === 1) {
        unionInner = [inners[0]];
      } else {
        unionInner = polygonClipping.union(
          inners[0] as any,
          ...inners.slice(1) as any[]
        ) as MultiPolygon;
      }
    }

    let parksMP: MultiPolygon = [];

    if (unionOuter) {
      parksMP = unionInner
        ? (polygonClipping.difference(
            unionOuter as any,
            unionInner as any
          ) as MultiPolygon)
        : unionOuter;
    }

    // Use centralized file-size-driven simplification (same as water/land)
    const parksPath = simplifyMultipolygonToSize(parksMP, bboxMercator, canvas, "layer-parks");

    // Ensure valid SVG even if parksPath is empty
    if (parksPath.length > 0) {
      svgParts.push(
        `<path d="${parksPath}" fill="#cdeac0" stroke="none" stroke-width="0" fill-rule="evenodd" />`
      );
    }
    
    svgParts.push(`</g>`);
    svgParts.push("</svg>");
    return svgParts.join("\n");
  }

  // ROADS & RAILWAYS: Group by stroke width and render as multilines with file-size-driven simplification
  if (layerName === "roads" || layerName === "railways") {
    // Group features by stroke width (rounded to avoid floating point issues)
    // Each value is an array of lines (each line is [number, number][])
    const linesByStrokeWidth = new Map<number, Line[]>();

    for (const feat of features) {
      let coords = feat.coords;
      if (coords.length < 2) continue;

      // For roads at coarse detail, skip minor roads to reduce feature count
      if (layerName === "roads" && detail === "coarse") {
        const highway = feat.tags["highway"] || "";
        const minorRoads = ["service", "track", "path", "footway", "cycleway", "bridleway", "steps"];
        if (minorRoads.includes(highway)) {
          continue; // Skip minor roads at coarse detail
        }
      }

      // Skip closed paths (these are polygons, not lines)
      if (isClosed(coords)) continue;

      // Calculate stroke width
      let strokeWidth: number;
      if (layerName === "roads") {
        strokeWidth = roadStrokeWidth(feat.tags, canvas);
      } else {
        // Railways: use base width for grouping (we'll add dotted overlay later)
        strokeWidth = defaultStrokeWidth("railways", canvas);
      }

      // Round stroke width to avoid too many groups (round to 0.1 precision)
      const roundedWidth = Math.round(strokeWidth * 10) / 10;

      // Add to group
      if (!linesByStrokeWidth.has(roundedWidth)) {
        linesByStrokeWidth.set(roundedWidth, []);
      }
      linesByStrokeWidth.get(roundedWidth)!.push(coords);
    }


    // Simplify each group to fit within file size limit
    const simplifiedPaths = simplifyLinesToSize(
      linesByStrokeWidth,
      bboxMercator,
      canvas,
      `layer-${layerName}`
    );

    // Render each group as a single multiline path
    for (const [strokeWidth, pathD] of simplifiedPaths.entries()) {
      if (!pathD) continue;

      if (layerName === "railways") {
        // Railways: solid base + dotted overlay
        const baseWidth = strokeWidth;
        const dotWidth = baseWidth * 2;
        const gap = baseWidth * 3;

        // Base solid stroke
        svgParts.push(
          `<path d="${pathD}" stroke="#000" stroke-width="${baseWidth.toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
        );

        // Dotted overlay
        svgParts.push(
          `<path d="${pathD}" stroke="#000" stroke-width="${dotWidth.toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="0,${gap.toFixed(2)}" />`
        );
      } else {
        // Roads: single stroke with round caps and joins for smooth appearance
        svgParts.push(
          `<path d="${pathD}" stroke="#000" stroke-width="${strokeWidth.toFixed(2)}" fill="none" stroke-linecap="round" stroke-linejoin="round" />`
        );
      }
    }

    svgParts.push(`</g>`);
    svgParts.push("</svg>");
    return svgParts.join("\n");
  }

  // All other layers: standard path rendering
  let processedCount = 0;
  const logInterval = Math.max(1000, Math.floor(features.length / 10));
  
  for (const feat of features) {
    let coords = feat.coords;
    if (coords.length < 2) continue;

    const closed = isClosed(coords);
    

    let d = "";
    coords.forEach(([mx, my], i) => {
      const [sx, sy] = mercatorToSvg(mx, my, minx, maxx, miny, maxy, width, height);
      d += `${i === 0 ? "M" : "L"}${sx.toFixed(2)},${sy.toFixed(2)} `;
    });

    let stroke = "#000";
    let strokeWidth: number;
    let fill = "none";

      strokeWidth = defaultStrokeWidth(layerName, canvas);

    if (layerName === "buildings" && closed) {
      fill = "#222";
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
