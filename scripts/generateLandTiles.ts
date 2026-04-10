/**
 * Generate land tiles from water tiles
 *
 * For each water tile, computes: land = tile_bbox - water
 *
 * Usage:
 *   npx tsx scripts/generateLandTiles.ts
 *   npx tsx scripts/generateLandTiles.ts 5deg
 */

import * as fs from "fs";
import * as path from "path";
import * as polygonClipping from "polygon-clipping";

interface GeoJSONFeature {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: Record<string, any>;
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

function parseTileName(filename: string): { lon: number; lat: number } | null {
  const match = filename.match(/^(-?\d+)_(-?\d+)\.json$/);
  if (!match) return null;
  return { lon: parseInt(match[1]), lat: parseInt(match[2]) };
}

function createBboxPolygon(lon: number, lat: number, tileSize: number): polygonClipping.Polygon {
  return [[
    [lon, lat],
    [lon + tileSize, lat],
    [lon + tileSize, lat + tileSize],
    [lon, lat + tileSize],
    [lon, lat],
  ]];
}

function extractPolygons(geojson: GeoJSONCollection): polygonClipping.MultiPolygon {
  const polygons: polygonClipping.MultiPolygon = [];

  for (const feature of geojson.features) {
    if (feature.geometry.type === "Polygon") {
      polygons.push(feature.geometry.coordinates as polygonClipping.Polygon);
    } else if (feature.geometry.type === "MultiPolygon") {
      for (const poly of feature.geometry.coordinates) {
        polygons.push(poly as polygonClipping.Polygon);
      }
    }
  }

  return polygons;
}

function processFolder(waterFolder: string, landFolder: string, tileSize: number) {
  console.log(`Processing ${waterFolder} -> ${landFolder} (${tileSize}° tiles)`);

  if (!fs.existsSync(landFolder)) {
    fs.mkdirSync(landFolder, { recursive: true });
  }

  const files = fs.readdirSync(waterFolder).filter((f) => f.endsWith(".json"));
  console.log(`Found ${files.length} water tiles`);

  let processed = 0;
  let errors = 0;
  let emptyLand = 0;

  for (const file of files) {
    const coords = parseTileName(file);
    if (!coords) {
      // Handle world.json
      if (file === "world.json") {
        processWorldFile(waterFolder, landFolder);
      } else {
        console.warn(`Skipping invalid filename: ${file}`);
      }
      continue;
    }

    try {
      const waterPath = path.join(waterFolder, file);
      const landPath = path.join(landFolder, file);

      const waterData = JSON.parse(fs.readFileSync(waterPath, "utf-8")) as GeoJSONCollection;
      const waterPolygons = extractPolygons(waterData);

      const bbox = createBboxPolygon(coords.lon, coords.lat, tileSize);

      // Land = bbox - water
      let landPolygons: polygonClipping.MultiPolygon;
      if (waterPolygons.length === 0) {
        // No water = all land
        landPolygons = [bbox];
      } else {
        landPolygons = polygonClipping.difference([bbox], ...waterPolygons);
      }

      // Create GeoJSON
      const landGeojson: GeoJSONCollection = {
        type: "FeatureCollection",
        features: landPolygons.map((poly) => ({
          type: "Feature" as const,
          geometry: {
            type: "Polygon" as const,
            coordinates: poly,
          },
          properties: {},
        })),
      };

      // Only write if there's land
      if (landPolygons.length > 0) {
        fs.writeFileSync(landPath, JSON.stringify(landGeojson));
      } else {
        emptyLand++;
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`  Processed ${processed}/${files.length}`);
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err);
      errors++;
    }
  }

  console.log(`Done: ${processed} processed, ${errors} errors, ${emptyLand} all-water tiles`);
}

function processWorldFile(waterFolder: string, landFolder: string) {
  const waterPath = path.join(waterFolder, "world.json");
  const landPath = path.join(landFolder, "world.json");

  if (!fs.existsSync(waterPath)) {
    console.log("No world.json found, skipping");
    return;
  }

  console.log("Processing world.json...");

  try {
    const waterData = JSON.parse(fs.readFileSync(waterPath, "utf-8")) as GeoJSONCollection;
    const waterPolygons = extractPolygons(waterData);

    // World bbox
    const worldBbox: polygonClipping.Polygon = [[
      [-180, -90],
      [180, -90],
      [180, 90],
      [-180, 90],
      [-180, -90],
    ]];

    // Land = world - water
    let landPolygons: polygonClipping.MultiPolygon;
    if (waterPolygons.length === 0) {
      landPolygons = [worldBbox];
    } else {
      landPolygons = polygonClipping.difference([worldBbox], ...waterPolygons);
    }

    const landGeojson: GeoJSONCollection = {
      type: "FeatureCollection",
      features: landPolygons.map((poly) => ({
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: poly,
        },
        properties: {},
      })),
    };

    fs.writeFileSync(landPath, JSON.stringify(landGeojson));
    console.log(`  World land: ${landPolygons.length} polygons`);
  } catch (err) {
    console.error("Error processing world.json:", err);
  }
}

// Configuration
const TILES_DIR = path.join(__dirname, "tiles");

const configs = [
  { water: "water/1deg", land: "land/1deg", size: 1 },
  { water: "water/5deg", land: "land/5deg", size: 5 },
  { water: "water/10deg", land: "land/10deg", size: 10 },
  { water: "water/20deg", land: "land/20deg", size: 20 },
];

// Get LOD from command line or process all
const targetLod = process.argv[2];

// Process world files first
const waterWorldDir = path.join(TILES_DIR, "water");
const landWorldDir = path.join(TILES_DIR, "land");
if (!targetLod && fs.existsSync(path.join(waterWorldDir, "world.json"))) {
  if (!fs.existsSync(landWorldDir)) {
    fs.mkdirSync(landWorldDir, { recursive: true });
  }
  processWorldFile(waterWorldDir, landWorldDir);
}

// Process tile folders
for (const config of configs) {
  if (targetLod && !config.water.includes(targetLod)) continue;

  const waterFolder = path.join(TILES_DIR, config.water);
  const landFolder = path.join(TILES_DIR, config.land);

  if (fs.existsSync(waterFolder)) {
    processFolder(waterFolder, landFolder, config.size);
  } else {
    console.warn(`Water folder not found: ${waterFolder}`);
  }
}

console.log("\nAll done!");
