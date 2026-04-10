/**
 * Geometry clipping utilities
 *
 * Clips GeoJSON features to a bounding box
 */

import { BBox } from '@/types';
import { GeoJSONFeature, GeoJSONFeatureCollection } from '../tiles/tileLoader';

/**
 * Cohen-Sutherland outcodes
 */
const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

function computeOutcode(x: number, y: number, bbox: BBox): number {
  let code = INSIDE;
  if (x < bbox.minLon) code |= LEFT;
  else if (x > bbox.maxLon) code |= RIGHT;
  if (y < bbox.minLat) code |= BOTTOM;
  else if (y > bbox.maxLat) code |= TOP;
  return code;
}

/**
 * Clip a line segment to a bounding box using Cohen-Sutherland
 * Returns null if entirely outside, or clipped segment
 */
function clipLineSegment(
  x0: number, y0: number,
  x1: number, y1: number,
  bbox: BBox
): [[number, number], [number, number]] | null {
  let outcode0 = computeOutcode(x0, y0, bbox);
  let outcode1 = computeOutcode(x1, y1, bbox);

  while (true) {
    if (!(outcode0 | outcode1)) {
      // Both inside
      return [[x0, y0], [x1, y1]];
    } else if (outcode0 & outcode1) {
      // Both outside same region
      return null;
    } else {
      // At least one outside, clip to edge
      const outcodeOut = outcode0 ? outcode0 : outcode1;
      let x: number, y: number;

      if (outcodeOut & TOP) {
        x = x0 + (x1 - x0) * (bbox.maxLat - y0) / (y1 - y0);
        y = bbox.maxLat;
      } else if (outcodeOut & BOTTOM) {
        x = x0 + (x1 - x0) * (bbox.minLat - y0) / (y1 - y0);
        y = bbox.minLat;
      } else if (outcodeOut & RIGHT) {
        y = y0 + (y1 - y0) * (bbox.maxLon - x0) / (x1 - x0);
        x = bbox.maxLon;
      } else {
        y = y0 + (y1 - y0) * (bbox.minLon - x0) / (x1 - x0);
        x = bbox.minLon;
      }

      if (outcodeOut === outcode0) {
        x0 = x;
        y0 = y;
        outcode0 = computeOutcode(x0, y0, bbox);
      } else {
        x1 = x;
        y1 = y;
        outcode1 = computeOutcode(x1, y1, bbox);
      }
    }
  }
}

/**
 * Clip a LineString to a bounding box
 * May return multiple line segments
 */
function clipLineString(
  coords: [number, number][],
  bbox: BBox
): [number, number][][] {
  const segments: [number, number][][] = [];
  let currentSegment: [number, number][] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];

    const clipped = clipLineSegment(x0, y0, x1, y1, bbox);

    if (clipped) {
      if (currentSegment.length === 0) {
        currentSegment.push(clipped[0]);
      }
      currentSegment.push(clipped[1]);

      // Check if the original endpoint was clipped (meaning line exits bbox)
      if (clipped[1][0] !== x1 || clipped[1][1] !== y1) {
        if (currentSegment.length >= 2) {
          segments.push(currentSegment);
        }
        currentSegment = [];
      }
    } else {
      // Segment entirely outside
      if (currentSegment.length >= 2) {
        segments.push(currentSegment);
      }
      currentSegment = [];
    }
  }

  if (currentSegment.length >= 2) {
    segments.push(currentSegment);
  }

  return segments;
}

/**
 * Sutherland-Hodgman polygon clipping
 */
function clipPolygonRing(
  ring: [number, number][],
  bbox: BBox
): [number, number][] {
  let output = ring;

  // Clip against each edge
  const edges: Array<{ inside: (p: [number, number]) => boolean; intersect: (p1: [number, number], p2: [number, number]) => [number, number] }> = [
    { // Left edge
      inside: (p) => p[0] >= bbox.minLon,
      intersect: (p1, p2) => {
        const t = (bbox.minLon - p1[0]) / (p2[0] - p1[0]);
        return [bbox.minLon, p1[1] + t * (p2[1] - p1[1])];
      }
    },
    { // Right edge
      inside: (p) => p[0] <= bbox.maxLon,
      intersect: (p1, p2) => {
        const t = (bbox.maxLon - p1[0]) / (p2[0] - p1[0]);
        return [bbox.maxLon, p1[1] + t * (p2[1] - p1[1])];
      }
    },
    { // Bottom edge
      inside: (p) => p[1] >= bbox.minLat,
      intersect: (p1, p2) => {
        const t = (bbox.minLat - p1[1]) / (p2[1] - p1[1]);
        return [p1[0] + t * (p2[0] - p1[0]), bbox.minLat];
      }
    },
    { // Top edge
      inside: (p) => p[1] <= bbox.maxLat,
      intersect: (p1, p2) => {
        const t = (bbox.maxLat - p1[1]) / (p2[1] - p1[1]);
        return [p1[0] + t * (p2[0] - p1[0]), bbox.maxLat];
      }
    },
  ];

  for (const edge of edges) {
    if (output.length === 0) break;

    const input = output;
    output = [];

    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const next = input[(i + 1) % input.length];

      if (edge.inside(current)) {
        if (edge.inside(next)) {
          output.push(next);
        } else {
          output.push(edge.intersect(current, next));
        }
      } else if (edge.inside(next)) {
        output.push(edge.intersect(current, next));
        output.push(next);
      }
    }
  }

  return output;
}

/**
 * Check if a point is inside a bounding box
 */
function pointInBbox(point: [number, number], bbox: BBox): boolean {
  return (
    point[0] >= bbox.minLon &&
    point[0] <= bbox.maxLon &&
    point[1] >= bbox.minLat &&
    point[1] <= bbox.maxLat
  );
}

/**
 * Check if any part of a feature's bounding box intersects the clip bbox
 */
function featureMightIntersect(feature: GeoJSONFeature, bbox: BBox): boolean {
  const coords = feature.geometry.coordinates;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  function updateBounds(coord: number[]) {
    if (coord[0] < minX) minX = coord[0];
    if (coord[0] > maxX) maxX = coord[0];
    if (coord[1] < minY) minY = coord[1];
    if (coord[1] > maxY) maxY = coord[1];
  }

  function processCoords(c: any) {
    if (typeof c[0] === 'number') {
      updateBounds(c);
    } else {
      for (const sub of c) {
        processCoords(sub);
      }
    }
  }

  processCoords(coords);

  // Check if bounding boxes intersect
  return !(
    maxX < bbox.minLon ||
    minX > bbox.maxLon ||
    maxY < bbox.minLat ||
    minY > bbox.maxLat
  );
}

/**
 * Clip a single feature to a bounding box
 */
export function clipFeature(
  feature: GeoJSONFeature,
  bbox: BBox
): GeoJSONFeature | null {
  // Quick reject
  if (!featureMightIntersect(feature, bbox)) {
    return null;
  }

  const geom = feature.geometry;

  switch (geom.type) {
    case 'Point': {
      if (pointInBbox(geom.coordinates, bbox)) {
        return feature;
      }
      return null;
    }

    case 'LineString': {
      const clipped = clipLineString(geom.coordinates, bbox);
      if (clipped.length === 0) return null;
      if (clipped.length === 1) {
        return {
          ...feature,
          geometry: { type: 'LineString', coordinates: clipped[0] },
        };
      }
      return {
        ...feature,
        geometry: { type: 'MultiLineString', coordinates: clipped },
      };
    }

    case 'MultiLineString': {
      const allClipped: [number, number][][] = [];
      for (const line of geom.coordinates) {
        allClipped.push(...clipLineString(line, bbox));
      }
      if (allClipped.length === 0) return null;
      return {
        ...feature,
        geometry: { type: 'MultiLineString', coordinates: allClipped },
      };
    }

    case 'Polygon': {
      const clippedRings: [number, number][][] = [];
      for (const ring of geom.coordinates) {
        const clipped = clipPolygonRing(ring, bbox);
        if (clipped.length >= 3) {
          // Close the ring
          if (clipped[0][0] !== clipped[clipped.length - 1][0] ||
              clipped[0][1] !== clipped[clipped.length - 1][1]) {
            clipped.push([...clipped[0]]);
          }
          clippedRings.push(clipped);
        }
      }
      if (clippedRings.length === 0) return null;
      return {
        ...feature,
        geometry: { type: 'Polygon', coordinates: clippedRings },
      };
    }

    case 'MultiPolygon': {
      const clippedPolygons: [number, number][][][] = [];
      for (const polygon of geom.coordinates) {
        const clippedRings: [number, number][][] = [];
        for (const ring of polygon) {
          const clipped = clipPolygonRing(ring, bbox);
          if (clipped.length >= 3) {
            if (clipped[0][0] !== clipped[clipped.length - 1][0] ||
                clipped[0][1] !== clipped[clipped.length - 1][1]) {
              clipped.push([...clipped[0]]);
            }
            clippedRings.push(clipped);
          }
        }
        if (clippedRings.length > 0) {
          clippedPolygons.push(clippedRings);
        }
      }
      if (clippedPolygons.length === 0) return null;
      if (clippedPolygons.length === 1) {
        return {
          ...feature,
          geometry: { type: 'Polygon', coordinates: clippedPolygons[0] },
        };
      }
      return {
        ...feature,
        geometry: { type: 'MultiPolygon', coordinates: clippedPolygons },
      };
    }

    default:
      // Unknown geometry type, return as-is
      return feature;
  }
}

/**
 * Clip a GeoJSON FeatureCollection to a bounding box
 */
export function clipFeatureCollection(
  fc: GeoJSONFeatureCollection,
  bbox: BBox
): GeoJSONFeatureCollection {
  const clippedFeatures: GeoJSONFeature[] = [];

  for (const feature of fc.features) {
    const clipped = clipFeature(feature, bbox);
    if (clipped) {
      clippedFeatures.push(clipped);
    }
  }

  return {
    type: 'FeatureCollection',
    features: clippedFeatures,
  };
}
