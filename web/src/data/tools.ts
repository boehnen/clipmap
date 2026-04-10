import { Tool } from '@/types';

export const TOOLS: Tool[] = [
  {
    slug: 'svg-map-generator',
    name: 'SVG Map Generator',
    shortName: 'SVG Maps',
    description: 'Create vector maps perfect for laser cutting, vinyl cutting, and design projects. Export roads, water, buildings, and more as clean SVG paths.',
    metaDescription: 'Free SVG map generator for laser cutting and design. Create custom vector maps with roads, water, parks, and buildings. Instant download.',
    keywords: ['svg map', 'laser cut map', 'vector map', 'city map svg', 'map for laser cutter'],
    icon: '/icons/svg.svg',
    outputFormat: 'SVG',
    available: true,
  },
  {
    slug: '3d-city-model',
    name: '3D City Model Generator',
    shortName: '3D Cities',
    description: 'Generate 3D printable city models with extruded buildings. Perfect for architectural models, gifts, and desk decorations.',
    metaDescription: 'Create 3D printable city models. Generate STL files with buildings extruded to scale. Perfect for 3D printing gifts and decor.',
    keywords: ['3d city model', '3d print city', 'stl city', 'city model 3d print', '3d map'],
    icon: '/icons/3d.svg',
    outputFormat: 'STL',
    available: false,
  },
  {
    slug: 'topographic-map',
    name: 'Topographic Relief Map',
    shortName: 'Topo Maps',
    description: 'Create 3D printable terrain models with accurate elevation data. Perfect for hiking areas, mountains, and landscape visualization.',
    metaDescription: 'Generate 3D topographic maps for printing. Create terrain models with real elevation data. STL files for 3D printing.',
    keywords: ['topographic map', 'terrain 3d print', 'elevation map', 'relief map', '3d terrain'],
    icon: '/icons/topo.svg',
    outputFormat: 'STL',
    available: false,
  },
  {
    slug: 'minimalist-poster',
    name: 'Minimalist Map Poster',
    shortName: 'Posters',
    description: 'Design beautiful minimalist map posters for your walls. Clean, modern aesthetic with customizable colors and styles.',
    metaDescription: 'Create minimalist map posters for wall art. Design custom city maps with modern styling. Download high-resolution images.',
    keywords: ['map poster', 'city map art', 'minimalist map', 'wall art map', 'map print'],
    icon: '/icons/poster.svg',
    outputFormat: 'PNG/PDF',
    available: false,
  },
  {
    slug: 'route-art',
    name: 'Route Art Generator',
    shortName: 'Route Art',
    description: 'Transform your running, cycling, or hiking routes into beautiful artwork. Upload GPX files or connect to Strava.',
    metaDescription: 'Turn running and cycling routes into art. Create Strava art and GPX visualizations. Beautiful route maps for athletes.',
    keywords: ['strava art', 'route art', 'running map', 'cycling art', 'gpx art'],
    icon: '/icons/route.svg',
    outputFormat: 'SVG/PNG',
    available: false,
  },
  {
    slug: 'star-map',
    name: 'Star Map Generator',
    shortName: 'Star Maps',
    description: 'Create personalized star maps showing the night sky at any location and date. Perfect for anniversaries, birthdays, and special moments.',
    metaDescription: 'Generate custom star maps for any date and location. Create personalized night sky prints. Perfect for gifts and memories.',
    keywords: ['star map', 'night sky map', 'constellation map', 'star map gift', 'custom star map'],
    icon: '/icons/stars.svg',
    outputFormat: 'SVG/PNG',
    available: false,
  },
];

export function getToolBySlug(slug: string): Tool | undefined {
  return TOOLS.find(t => t.slug === slug);
}

export function getAvailableTools(): Tool[] {
  return TOOLS.filter(t => t.available);
}
