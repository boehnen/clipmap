/**
 * Elevation band calculator for topographic layer generation
 *
 * Workflow:
 * 1. User selects bbox
 * 2. We query elevation range (min/max) for that area
 * 3. User picks layer count with slider
 * 4. We calculate optimal band intervals
 * 5. Each band becomes a separate cut layer
 */

import { BBox } from '@/types';

export interface ElevationRange {
  min: number;  // meters
  max: number;  // meters
}

export interface ElevationBand {
  index: number;
  minElevation: number;
  maxElevation: number;
  color: string;  // For preview visualization
  label: string;  // e.g., "0-100m"
}

export interface TopoConfig {
  layerCount: number;      // Number of physical layers (slider value)
  baseElevation?: number;  // Optional: override min (e.g., start at sea level)
  roundTo?: number;        // Round intervals to nice numbers (e.g., 10, 50, 100)
}

/**
 * Calculate elevation bands based on terrain range and desired layer count
 */
export function calculateElevationBands(
  range: ElevationRange,
  config: TopoConfig
): ElevationBand[] {
  const { layerCount, baseElevation, roundTo = 10 } = config;

  const min = baseElevation ?? range.min;
  const max = range.max;
  const totalRange = max - min;

  // Calculate raw interval
  let interval = totalRange / layerCount;

  // Round to nice number if specified
  if (roundTo > 0) {
    interval = Math.ceil(interval / roundTo) * roundTo;
  }

  // Generate bands
  const bands: ElevationBand[] = [];
  const colors = generateColorRamp(layerCount);

  for (let i = 0; i < layerCount; i++) {
    const bandMin = min + (i * interval);
    const bandMax = i === layerCount - 1 ? max : min + ((i + 1) * interval);

    bands.push({
      index: i,
      minElevation: Math.round(bandMin),
      maxElevation: Math.round(bandMax),
      color: colors[i],
      label: `${Math.round(bandMin)}-${Math.round(bandMax)}m`,
    });
  }

  return bands;
}

/**
 * Generate a color ramp for visualization (brown/green terrain colors)
 */
function generateColorRamp(count: number): string[] {
  // Low = green/dark, High = brown/white
  const colors: string[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1); // 0 to 1

    // Interpolate from dark green to light brown to white
    let r, g, b;

    if (t < 0.5) {
      // Green to brown
      const t2 = t * 2;
      r = Math.round(34 + t2 * (139 - 34));
      g = Math.round(139 + t2 * (90 - 139));
      b = Math.round(34 + t2 * (43 - 34));
    } else {
      // Brown to light/white
      const t2 = (t - 0.5) * 2;
      r = Math.round(139 + t2 * (255 - 139));
      g = Math.round(90 + t2 * (250 - 90));
      b = Math.round(43 + t2 * (240 - 43));
    }

    colors.push(`rgb(${r},${g},${b})`);
  }

  return colors;
}

/**
 * Suggest optimal layer count based on elevation range and material thickness
 */
export function suggestLayerCount(
  range: ElevationRange,
  materialThicknessMm: number = 3,
  targetScaleVertical: number = 1/50000  // 1:50000 vertical exaggeration
): number {
  const totalRange = range.max - range.min;

  // How tall would the model be at this scale?
  const modelHeightMm = totalRange * 1000 * targetScaleVertical;

  // Divide by material thickness
  const suggestedLayers = Math.round(modelHeightMm / materialThicknessMm);

  // Clamp to reasonable range
  return Math.max(3, Math.min(30, suggestedLayers));
}

/**
 * Get elevation range for a bbox
 *
 * Options:
 * 1. Query pre-computed tile metadata
 * 2. Sample terrain tiles API
 * 3. Use approximate database
 *
 * For now, returns a placeholder - needs actual elevation data source
 */
export async function getElevationRange(bbox: BBox): Promise<ElevationRange> {
  // TODO: Implement actual elevation lookup
  // Options:
  // - Mapzen Terrarium tiles on AWS
  // - Pre-computed min/max per tile
  // - OpenTopoData API

  // Placeholder: return typical range
  // In production, query actual elevation data
  console.warn('getElevationRange: Using placeholder data. Implement actual elevation lookup.');

  return {
    min: 0,
    max: 500,
  };
}

/**
 * Fetch elevation range from OpenTopoData API (free, rate-limited)
 * https://www.opentopodata.org/
 */
export async function getElevationRangeFromAPI(bbox: BBox): Promise<ElevationRange> {
  // Sample points across the bbox
  const samples = 5; // 5x5 grid = 25 points
  const points: { lat: number; lon: number }[] = [];

  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      points.push({
        lat: bbox.minLat + (bbox.maxLat - bbox.minLat) * (i / (samples - 1)),
        lon: bbox.minLon + (bbox.maxLon - bbox.minLon) * (j / (samples - 1)),
      });
    }
  }

  // Format for API: lat,lon|lat,lon|...
  const locations = points.map(p => `${p.lat},${p.lon}`).join('|');

  try {
    // Using SRTM dataset via OpenTopoData
    const response = await fetch(
      `https://api.opentopodata.org/v1/srtm30m?locations=${locations}`
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const elevations = data.results
      .map((r: any) => r.elevation)
      .filter((e: number | null) => e !== null);

    if (elevations.length === 0) {
      throw new Error('No elevation data found');
    }

    return {
      min: Math.min(...elevations),
      max: Math.max(...elevations),
    };
  } catch (error) {
    console.error('Failed to fetch elevation data:', error);
    throw error;
  }
}
