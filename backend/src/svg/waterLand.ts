import * as polygonClipping from "polygon-clipping";
import { ProjectedFeature } from "../types";
import { mercatorToSvg } from "../geo/projection";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

function ensureClosed(r: Ring): Ring {
  if (r.length < 3) return r;
  const [x0, y0] = r[0];
  const [xN, yN] = r[r.length - 1];
  if (Math.abs(x0 - xN) < 1e-6 && Math.abs(y0 - yN) < 1e-6) return r;
  return [...r, [x0, y0]];
}

function mpToPathD(
  mp: MultiPolygon,
  bboxMerc: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number }
): string {
  const { minx, maxx, miny, maxy } = bboxMerc;
  const { width, height } = canvas;

  let d = "";

  for (const poly of mp) {
    for (const ring of poly) {
      if (!ring.length) continue;
      ring.forEach(([mx, my], i) => {
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
      d += "Z ";
    }
  }

  return d.trim();
}

export function generateWaterAndLandSvgs(
  waterFeatures: ProjectedFeature[],
  bboxMercator: { minx: number; maxx: number; miny: number; maxy: number },
  canvas: { width: number; height: number }
): { waterSvg?: string; landSvg?: string } {
  const { minx, maxx, miny, maxy } = bboxMercator;
  const { width, height } = canvas;

  // ----- build polygons for water -----
  const outers: Polygon[] = [];
  const inners: Polygon[] = [];

  for (const f of waterFeatures) {
    if (!f.coords || f.coords.length < 3) continue;
    const ring = ensureClosed(f.coords as Ring);
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
    unionOuter = polygonClipping.union(
      outers[0] as any,
      ...outers.slice(1) as any[]
    ) as MultiPolygon;
  }

  if (inners.length > 0) {
    unionInner = polygonClipping.union(
      inners[0] as any,
      ...inners.slice(1) as any[]
    ) as MultiPolygon;
  }

  let waterMP: MultiPolygon = [];

  if (unionOuter) {
    waterMP = unionInner
      ? (polygonClipping.difference(
          unionOuter as any,
          unionInner as any
        ) as MultiPolygon)
      : unionOuter;
  }

  // ----- bbox as multipolygon -----
  const bboxRing: Ring = [
    [minx, miny],
    [maxx, miny],
    [maxx, maxy],
    [minx, maxy],
    [minx, miny],
  ];
  const bboxMP: MultiPolygon = [[bboxRing]];

  // NEW: clip water to bbox
  if (waterMP.length > 0) {
    const clipped = polygonClipping.intersection(
      bboxMP as any,
      waterMP as any
    ) as MultiPolygon;
    waterMP = clipped || [];
  }

  // land = bbox − water (already clipped)
  const landMP: MultiPolygon =
    waterMP.length === 0
      ? bboxMP
      : (polygonClipping.difference(
          bboxMP as any,
          waterMP as any
        ) as MultiPolygon);

  const waterPath = mpToPathD(waterMP, bboxMercator, canvas);
  const landPath = mpToPathD(landMP, bboxMercator, canvas);

  const waterSvg =
    waterPath.length > 0
      ? [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
          `<g id="layer-water">`,
          `<path d="${waterPath}" fill="#b3d9ff" stroke="none" stroke-width="0" fill-rule="evenodd" />`,
          `</g>`,
          `</svg>`,
        ].join("\n")
      : undefined;

  const landSvg =
    landPath.length > 0
      ? [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
          `<g id="layer-land">`,
          `<path d="${landPath}" fill="#f5f3ef" stroke="none" stroke-width="0" fill-rule="evenodd" />`,
          `</g>`,
          `</svg>`,
        ].join("\n")
      : undefined;

  return { waterSvg, landSvg };
}
