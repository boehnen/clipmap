/**
 * Overpass Query Builders
 *
 * Builds Overpass QL queries for different map layers.
 * Queries are optimized based on detail level to avoid fetching too much data.
 */

import { BBox, DetailLevel } from '@/types';
import { bboxToOverpass } from './client';
import { getDetailLevel } from '../utils/geo';

/**
 * Build roads query based on detail level
 */
export function buildRoadsQuery(bbox: BBox): string {
  const bboxStr = bboxToOverpass(bbox);
  const detail = getDetailLevel(bbox);

  // Select highway types based on detail level
  let highwayTypes: string[];

  switch (detail) {
    case 'fine':
      // All roads including service roads and paths
      highwayTypes = [
        'motorway', 'motorway_link',
        'trunk', 'trunk_link',
        'primary', 'primary_link',
        'secondary', 'secondary_link',
        'tertiary', 'tertiary_link',
        'residential', 'unclassified',
        'living_street', 'pedestrian',
        'service', 'track', 'path', 'footway', 'cycleway',
      ];
      break;

    case 'medium':
      // Major and minor roads, no paths
      highwayTypes = [
        'motorway', 'motorway_link',
        'trunk', 'trunk_link',
        'primary', 'primary_link',
        'secondary', 'secondary_link',
        'tertiary', 'tertiary_link',
        'residential', 'unclassified',
        'living_street',
      ];
      break;

    case 'coarse':
      // Main roads only
      highwayTypes = [
        'motorway', 'motorway_link',
        'trunk', 'trunk_link',
        'primary', 'primary_link',
        'secondary', 'secondary_link',
        'tertiary',
      ];
      break;

    case 'regional':
      // Major roads
      highwayTypes = [
        'motorway', 'motorway_link',
        'trunk', 'trunk_link',
        'primary', 'primary_link',
        'secondary',
      ];
      break;

    case 'country':
    case 'continental':
      // Only motorways and trunk roads
      highwayTypes = [
        'motorway', 'motorway_link',
        'trunk', 'trunk_link',
        'primary',
      ];
      break;

    default:
      highwayTypes = ['motorway', 'trunk', 'primary'];
  }

  const highwayFilter = highwayTypes.map(t => `["highway"="${t}"]`).join('');

  return `
[out:json][timeout:25][bbox:${bboxStr}];
(
  way["highway"~"^(${highwayTypes.join('|')})$"];
);
out geom;
`.trim();
}

/**
 * Build administrative boundaries query
 */
export function buildBoundariesQuery(bbox: BBox): string {
  const bboxStr = bboxToOverpass(bbox);
  const detail = getDetailLevel(bbox);

  // Select admin levels based on detail level
  let adminLevels: number[];

  switch (detail) {
    case 'fine':
    case 'medium':
      // City neighborhoods, districts, cities
      adminLevels = [4, 5, 6, 7, 8, 9, 10];
      break;

    case 'coarse':
      // Counties, municipalities, cities
      adminLevels = [4, 5, 6, 7, 8];
      break;

    case 'regional':
      // States, provinces, counties
      adminLevels = [4, 5, 6];
      break;

    case 'country':
      // Countries, states
      adminLevels = [2, 3, 4];
      break;

    case 'continental':
      // Countries only
      adminLevels = [2, 3];
      break;

    default:
      adminLevels = [4, 6, 8];
  }

  const adminFilter = adminLevels.join('|');

  return `
[out:json][timeout:25][bbox:${bboxStr}];
(
  relation["boundary"="administrative"]["admin_level"~"^(${adminFilter})$"];
);
out geom;
`.trim();
}

/**
 * Build parks/green areas query
 */
export function buildParksQuery(bbox: BBox): string {
  const bboxStr = bboxToOverpass(bbox);
  const detail = getDetailLevel(bbox);

  // For smaller areas, include more detail
  const includeSmallParks = detail === 'fine' || detail === 'medium';

  let query = `
[out:json][timeout:25][bbox:${bboxStr}];
(
  way["leisure"="park"];
  relation["leisure"="park"];
  way["landuse"="recreation_ground"];
  way["landuse"="grass"];
  way["leisure"="garden"];
  way["leisure"="nature_reserve"];
  relation["leisure"="nature_reserve"];`;

  if (includeSmallParks) {
    query += `
  way["leisure"="playground"];
  way["leisure"="pitch"];`;
  }

  query += `
);
out geom;`;

  return query.trim();
}

/**
 * Build railways query
 */
export function buildRailwaysQuery(bbox: BBox): string {
  const bboxStr = bboxToOverpass(bbox);

  return `
[out:json][timeout:25][bbox:${bboxStr}];
(
  way["railway"="rail"];
  way["railway"="light_rail"];
  way["railway"="subway"];
  way["railway"="tram"];
);
out geom;
`.trim();
}

/**
 * Build buildings query (only for fine/medium detail)
 */
export function buildBuildingsQuery(bbox: BBox): string {
  const bboxStr = bboxToOverpass(bbox);
  const detail = getDetailLevel(bbox);

  // Buildings are only fetched at fine detail level
  if (detail !== 'fine' && detail !== 'medium') {
    return ''; // Return empty query - will result in no data
  }

  return `
[out:json][timeout:30][bbox:${bboxStr}];
(
  way["building"];
  relation["building"];
);
out geom;
`.trim();
}
