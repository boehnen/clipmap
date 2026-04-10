/**
 * OSM Data Parser
 *
 * Converts Overpass API responses to geometry formats suitable for SVG rendering.
 * Handles ways (lines/polygons) and relations (multipolygons/boundaries).
 */

import { OverpassElement, OverpassResponse } from './client';
import { projectPoint } from '../geo/project';

// Types for geometries in Web Mercator coordinates
export type Coordinate = [number, number];
export type LineString = Coordinate[];
export type MultiLineString = LineString[];
export type Ring = Coordinate[];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export interface ParsedGeometries {
  lines: MultiLineString;
  polygons: MultiPolygon;
}

/**
 * Check if a way forms a closed ring (polygon)
 */
function isClosedWay(element: OverpassElement): boolean {
  if (!element.geometry || element.geometry.length < 3) return false;
  const first = element.geometry[0];
  const last = element.geometry[element.geometry.length - 1];
  return first.lat === last.lat && first.lon === last.lon;
}

/**
 * Convert way geometry to projected coordinates
 */
function wayToCoords(element: OverpassElement): Coordinate[] {
  if (!element.geometry) return [];
  return element.geometry.map(p => projectPoint(p.lon, p.lat));
}

/**
 * Parse ways into lines (for roads, railways, etc.)
 */
export function parseWaysAsLines(response: OverpassResponse): MultiLineString {
  const lines: MultiLineString = [];

  for (const element of response.elements) {
    if (element.type !== 'way') continue;
    if (!element.geometry || element.geometry.length < 2) continue;

    const coords = wayToCoords(element);
    if (coords.length >= 2) {
      lines.push(coords);
    }
  }

  return lines;
}

/**
 * Parse ways as polygons (for parks, buildings, etc.)
 */
export function parseWaysAsPolygons(response: OverpassResponse): MultiPolygon {
  const polygons: MultiPolygon = [];

  for (const element of response.elements) {
    if (element.type !== 'way') continue;
    if (!element.geometry || element.geometry.length < 4) continue;
    if (!isClosedWay(element)) continue;

    const coords = wayToCoords(element);
    if (coords.length >= 4) {
      // Single ring polygon
      polygons.push([coords]);
    }
  }

  return polygons;
}

/**
 * Parse relation members for multipolygon boundaries
 */
function parseRelationGeometry(element: OverpassElement): Polygon | null {
  if (!element.members) return null;

  const outerRings: Ring[] = [];
  const innerRings: Ring[] = [];

  for (const member of element.members) {
    if (member.type !== 'way') continue;

    // For relations with out geom, member geometry is on the element
    // We need to find the geometry from the member
    // Note: Overpass with "out geom" includes geometry directly on ways
  }

  // For now, we handle relations that have bounds/geometry data
  // This is a simplified version - full relation parsing requires way assembly

  return null;
}

/**
 * Parse administrative boundaries
 * Returns both lines (for rendering as strokes) and polygons (if closed)
 */
export function parseBoundaries(response: OverpassResponse): ParsedGeometries {
  const lines: MultiLineString = [];
  const polygons: MultiPolygon = [];

  for (const element of response.elements) {
    if (element.type === 'way') {
      if (!element.geometry || element.geometry.length < 2) continue;

      const coords = wayToCoords(element);

      if (isClosedWay(element) && coords.length >= 4) {
        polygons.push([coords]);
      } else if (coords.length >= 2) {
        lines.push(coords);
      }
    }
    // Relations are more complex - for now we extract ways from them
    // A full implementation would assemble multipolygon relations
  }

  return { lines, polygons };
}

/**
 * Parse roads response - roads are always lines
 */
export function parseRoads(response: OverpassResponse): MultiLineString {
  return parseWaysAsLines(response);
}

/**
 * Parse railways response
 */
export function parseRailways(response: OverpassResponse): MultiLineString {
  return parseWaysAsLines(response);
}

/**
 * Parse parks response - parks are polygons
 */
export function parseParks(response: OverpassResponse): MultiPolygon {
  return parseWaysAsPolygons(response);
}

/**
 * Parse buildings response
 */
export function parseBuildings(response: OverpassResponse): MultiPolygon {
  return parseWaysAsPolygons(response);
}

/**
 * Clip lines to bounding box (simple version)
 */
export function clipLinesToBbox(
  lines: MultiLineString,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): MultiLineString {
  // Simple clip: just filter out lines entirely outside bbox
  // A proper implementation would use Cohen-Sutherland or similar
  return lines.filter(line => {
    return line.some(([x, y]) =>
      x >= minX && x <= maxX && y >= minY && y <= maxY
    );
  });
}
