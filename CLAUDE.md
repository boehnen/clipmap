# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClipMap is a client-side geospatial application that exports map regions as SVG files. Users select a rectangular area on an interactive map, choose which layers to include (roads, buildings, water, etc.), and download SVG files. All processing happens in the browser - tile data is fetched directly from CDN.

## Build & Development Commands

```bash
cd web
npm install        # Install dependencies
npm run dev        # Dev server at http://localhost:3000
npm run build      # Production build
npm run lint       # ESLint check
```

## Architecture

### Data Flow
1. User draws rectangle on map, selects layers
2. Client fetches water/land tiles directly from CDN (cdn.clipmap.io)
3. Client-side geospatial processing: clip to bbox, project coordinates
4. Client renders SVG for each layer
5. Download as individual SVGs or bundled ZIP

### Tile CDN Structure
Pre-generated GeoJSON tiles served from Cloudflare R2:
```
https://cdn.clipmap.io/
├── water-tiles-20deg/    # 162 tiles (20° × 20°)
├── water-tiles-10deg/    # 648 tiles
├── water-tiles-5deg/     # 2,592 tiles
├── water-tiles-2.5deg/   # 10,368 tiles
├── water-tiles-1deg/     # 64,800 tiles
├── land-tiles-20deg/
├── land-tiles-10deg/
├── land-tiles-5deg/
├── land-tiles-2.5deg/
└── land-tiles-1deg/
```

Tile naming: `{lon}_{lat}.geojson` (e.g., `-74_40.geojson` for NYC area)

### Key Directories
- `web/src/app/` - Next.js app router pages
- `web/src/components/` - React components (map, export panel, etc.)
- `web/src/lib/` - Utilities (tile fetching, SVG rendering, geo processing)
- `web/src/types/` - TypeScript type definitions
- `scripts/tile-work/` - Tile generation scripts (not part of web app)

### LOD (Level of Detail) Selection
Tile LOD is selected based on bbox span:
- Larger areas → coarser tiles (20deg, 10deg)
- Smaller areas → finer tiles (2.5deg, 1deg)

## Tile Generation

Tiles are pre-generated using scripts in `scripts/tile-work/`. See `scripts/tile-work/TILE_PIPELINE.md` for details.

Key scripts:
- `generate_land_all_lods.js` - Generate land tiles from water tiles
- `generate_water_from_land.js` - Generate dissolved water from land
- `upload_new_tiles_v3.js` - Upload to R2

## Deployment

- **Web App**: Cloudflare Pages or Vercel
- **Tile CDN**: Cloudflare R2 with custom domain (cdn.clipmap.io)
