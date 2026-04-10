/**
 * Overpass API Client
 *
 * Fetches OSM data from Overpass API endpoints.
 * Uses multiple endpoints with fallback for reliability.
 */

import { BBox } from '@/types';

// Overpass API endpoints (primary + fallbacks)
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Request timeout (30 seconds)
const TIMEOUT_MS = 30000;

// Cache for Overpass responses
const responseCache = new Map<string, OverpassResponse>();
const CACHE_MAX_SIZE = 100;

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  members?: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
  }>;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

/**
 * Build bbox string for Overpass query (south,west,north,east)
 */
export function bboxToOverpass(bbox: BBox): string {
  return `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
}

/**
 * Cache a response
 */
function cacheResponse(key: string, response: OverpassResponse): void {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) responseCache.delete(firstKey);
  }
  responseCache.set(key, response);
}

/**
 * Execute an Overpass query with automatic endpoint fallback
 */
export async function queryOverpass(query: string): Promise<OverpassResponse> {
  // Check cache
  const cacheKey = query;
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey)!;
  }

  let lastError: Error | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OverpassResponse;

      // Cache successful response
      cacheResponse(cacheKey, data);

      return data;
    } catch (err) {
      lastError = err as Error;
      console.warn(`Overpass endpoint ${endpoint} failed:`, err);
      // Try next endpoint
    }
  }

  throw new Error(`All Overpass endpoints failed: ${lastError?.message}`);
}

/**
 * Clear the response cache
 */
export function clearOverpassCache(): void {
  responseCache.clear();
}
