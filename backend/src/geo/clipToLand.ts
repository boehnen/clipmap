// backend/src/geo/clipToLand.ts
// Utility to clip polygons (e.g., parks) to land areas
// Uses batch operations (like water/land) for better performance

import * as polygonClipping from "polygon-clipping";
import { ProjectedFeature } from "../types";
import { logger } from "../logger";

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

/**
 * Clips park polygons (or any polygons) to land areas using batch operations
 * This is much faster than individual intersections - similar to how water/land works
 * @param parkFeatures Park features in WebMercator coordinates
 * @param landFeatures Land features in WebMercator coordinates (from getBaseWaterFeaturesForBBox)
 * @returns Clipped park features as a single multipolygon (like water/land)
 */
export function clipParksToLand(
  parkFeatures: ProjectedFeature[],
  landFeatures: ProjectedFeature[]
): ProjectedFeature[] {
  if (parkFeatures.length === 0 || landFeatures.length === 0) {
    return [];
  }

  const totalParks = parkFeatures.length;
  logger.info("parks_clipping_start", {
    totalParks,
    landFeatures: landFeatures.length,
    approach: "batch_union_then_intersect",
  });

  // Build land multipolygon from land features (same as before)
  const landOuters: Polygon[] = [];
  const landInners: Polygon[] = [];
  
  for (const feat of landFeatures) {
    if (!feat.coords || feat.coords.length < 3) continue;
    const ring = feat.coords as Ring;
    const poly: Polygon = [ring];
    
    if (feat.role === "inner") {
      landInners.push(poly);
    } else {
      landOuters.push(poly);
    }
  }

  // Union all land outer rings to get the complete land area
  let landMP: MultiPolygon = [];
  if (landOuters.length > 0) {
    try {
      if (landOuters.length === 1) {
        landMP = [landOuters[0]];
      } else {
        landMP = polygonClipping.union(
          landOuters[0] as any,
          ...landOuters.slice(1) as any[]
        ) as MultiPolygon;
      }
      
      // Subtract inner rings (these represent water holes within land)
      if (landInners.length > 0) {
        const unionInner = polygonClipping.union(
          landInners[0] as any,
          ...landInners.slice(1) as any[]
        ) as MultiPolygon;
        
        if (landMP.length > 0 && unionInner.length > 0) {
          landMP = polygonClipping.difference(
            landMP as any,
            unionInner as any
          ) as MultiPolygon;
        }
      }
    } catch (e: any) {
      logger.warn("land_union_failed_for_parks", {
        error: e.message,
      });
      landMP = landOuters;
    }
  }

  if (landMP.length === 0) {
    logger.warn("no_land_geometry_for_park_clipping");
    return [];
  }

  // NEW APPROACH: Union all parks first, then intersect once with land
  // This is much faster than individual intersections (like water/land approach)
  const parkOuters: Polygon[] = [];
  
  for (const park of parkFeatures) {
    if (!park.coords || park.coords.length < 3) continue;
    const ring = park.coords as Ring;
    const poly: Polygon = [ring];
    parkOuters.push(poly);
  }

  if (parkOuters.length === 0) {
    return [];
  }


  // Union all parks into a single multipolygon
  let parksMP: MultiPolygon = [];
  try {
    if (parkOuters.length === 1) {
      parksMP = [parkOuters[0]];
    } else {
      // Union parks in batches to avoid memory issues with very large datasets
      // Process in chunks of 100 parks at a time
      const BATCH_SIZE = 100;
      let currentMP: MultiPolygon = [parkOuters[0]];
      
      for (let i = 1; i < parkOuters.length; i += BATCH_SIZE) {
        const batch = parkOuters.slice(i, i + BATCH_SIZE);
        
        // Union this batch
        let batchMP: MultiPolygon;
        if (batch.length === 1) {
          batchMP = [batch[0]];
        } else {
          batchMP = polygonClipping.union(
            batch[0] as any,
            ...batch.slice(1) as any[]
          ) as MultiPolygon;
        }
        
        // Union with accumulated result
        if (currentMP.length > 0 && batchMP.length > 0) {
          currentMP = polygonClipping.union(
            currentMP as any,
            batchMP as any
          ) as MultiPolygon;
        } else if (batchMP.length > 0) {
          currentMP = batchMP;
        }
        
      }
      
      parksMP = currentMP;
    }
  } catch (e: any) {
    logger.warn("parks_union_failed", {
      error: e.message,
      fallback: "using_individual_intersections",
    });
    // Fallback to individual intersections if union fails
    return clipParksIndividually(parkFeatures, landMP);
  }


  // Now intersect the unioned parks with land (single operation!)
  let clippedParksMP: MultiPolygon = [];
  try {
    clippedParksMP = polygonClipping.intersection(
      parksMP as any,
      landMP as any
    ) as MultiPolygon;
  } catch (e: any) {
    logger.warn("parks_intersection_failed", {
      error: e.message,
      fallback: "using_individual_intersections",
    });
    // Fallback to individual intersections if batch intersection fails
    return clipParksIndividually(parkFeatures, landMP);
  }

  // Convert result to ProjectedFeature[] (single multipolygon, like water/land)
  const clippedParks: ProjectedFeature[] = [];

  for (const poly of clippedParksMP) {
    if (!poly.length) continue;
    const [outer, ...inners] = poly;

    if (outer && outer.length >= 3) {
      clippedParks.push({
        coords: outer,
        tags: {}, // No individual tags since we unioned everything
        role: "outer",
      });
    }

    // Include inner rings (holes) - these are valid parts of the multipolygon
    for (const inner of inners) {
      if (inner.length >= 3) {
        clippedParks.push({
          coords: inner,
          tags: {},
          role: "inner",
        });
      }
    }
  }


  return clippedParks;
}

/**
 * Fallback: clip parks individually (slower but more robust)
 */
function clipParksIndividually(
  parkFeatures: ProjectedFeature[],
  landMP: MultiPolygon
): ProjectedFeature[] {
  
  const clippedParks: ProjectedFeature[] = [];
  let skippedCount = 0;

  for (const park of parkFeatures) {
    if (!park.coords || park.coords.length < 3) continue;
    
    const parkPoly: Polygon = [park.coords as Ring];
    const parkMP: MultiPolygon = [parkPoly];
    
    try {
      const intersection = polygonClipping.intersection(
        parkMP as any,
        landMP as any
      ) as MultiPolygon;
      
      if (intersection && intersection.length > 0) {
        for (const poly of intersection) {
          if (!poly.length) continue;
          const [outer] = poly;
          
          if (outer && outer.length >= 3) {
            const [x0, y0] = outer[0];
            const [xN, yN] = outer[outer.length - 1];
            let closedRing = outer;
            if (Math.abs(x0 - xN) > 1e-6 || Math.abs(y0 - yN) > 1e-6) {
              closedRing = [...outer, [x0, y0]];
            }
            
            clippedParks.push({
              coords: closedRing,
              tags: park.tags,
              role: "outer",
              relationId: park.relationId,
            });
          }
        }
      } else {
        skippedCount++;
      }
    } catch (e: any) {
      skippedCount++;
      continue;
    }
  }

  return clippedParks;
}
