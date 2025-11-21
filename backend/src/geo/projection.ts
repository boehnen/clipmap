import { LayerName } from "../types";

export const R = 6378137;

export function lonLatToWebMercator(lon: number, lat: number): [number, number] {
  const x = R * (lon * Math.PI / 180);
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  return [x, y];
}

export function mercatorToSvg(
  x: number,
  y: number,
  minx: number,
  maxx: number,
  miny: number,
  maxy: number,
  width: number,
  height: number
): [number, number] {
  const sx = (x - minx) / (maxx - minx) * width;
  const sy = (y - miny) / (maxy - miny) * height;
  return [sx, height - sy];
}

export function autoCanvasFromMercator(
  minx: number,
  miny: number,
  maxx: number,
  maxy: number
): { width: number; height: number } {
  const dataWidth = maxx - minx;
  const dataHeight = maxy - miny;
  const dataRatio = dataWidth / dataHeight;

  const CANONICAL_LONG_SIDE = 4096;

  let width: number;
  let height: number;

  if (dataWidth >= dataHeight) {
    width = CANONICAL_LONG_SIDE;
    height = Math.round(width / dataRatio);
  } else {
    height = CANONICAL_LONG_SIDE;
    width = Math.round(height * dataRatio);
  }

  console.log(`Auto canvas size: ${width} x ${height}`);
  return { width, height };
}

export function defaultStrokeWidth(
  layer: LayerName,
  canvas: { width: number; height: number }
): number {
  const base = Math.max(canvas.width, canvas.height);
  const unit = base / 2048;

  switch (layer) {
    case "roads": return 2.0 * unit;
    case "railways": return 1.4 * unit;
    case "water": return 1.8 * unit;
    case "buildings": return 0.9 * unit;
    default: return 1.0 * unit;
  }
}