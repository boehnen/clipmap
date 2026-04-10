/**
 * Overpass API Module
 *
 * Fetches and parses OSM data from Overpass API.
 */

export * from './client';
export * from './queries';
export * from './parser';

import { BBox } from '@/types';
import { queryOverpass } from './client';
import {
  buildRoadsQuery,
  buildBoundariesQuery,
  buildParksQuery,
  buildRailwaysQuery,
  buildBuildingsQuery,
} from './queries';
import {
  parseRoads,
  parseBoundaries,
  parseParks,
  parseRailways,
  parseBuildings,
  MultiLineString,
  MultiPolygon,
  ParsedGeometries,
} from './parser';

/**
 * Load roads for a bounding box
 */
export async function loadRoads(bbox: BBox): Promise<MultiLineString> {
  const query = buildRoadsQuery(bbox);
  const response = await queryOverpass(query);
  return parseRoads(response);
}

/**
 * Load administrative boundaries for a bounding box
 */
export async function loadBoundaries(bbox: BBox): Promise<ParsedGeometries> {
  const query = buildBoundariesQuery(bbox);
  const response = await queryOverpass(query);
  return parseBoundaries(response);
}

/**
 * Load parks/green areas for a bounding box
 */
export async function loadParks(bbox: BBox): Promise<MultiPolygon> {
  const query = buildParksQuery(bbox);
  const response = await queryOverpass(query);
  return parseParks(response);
}

/**
 * Load railways for a bounding box
 */
export async function loadRailways(bbox: BBox): Promise<MultiLineString> {
  const query = buildRailwaysQuery(bbox);
  const response = await queryOverpass(query);
  return parseRailways(response);
}

/**
 * Load buildings for a bounding box (only at fine/medium detail)
 */
export async function loadBuildings(bbox: BBox): Promise<MultiPolygon> {
  const query = buildBuildingsQuery(bbox);
  if (!query) return []; // No buildings at this zoom level
  const response = await queryOverpass(query);
  return parseBuildings(response);
}
