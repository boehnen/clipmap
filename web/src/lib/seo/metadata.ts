import { Metadata } from 'next';
import { Tool, City } from '@/types';

const SITE_NAME = 'ClipMap';
const SITE_URL = 'https://clipmap.io';
const DEFAULT_IMAGE = '/og/default.png';

export function createMetadata(options: {
  title: string;
  description: string;
  path?: string;
  image?: string;
  keywords?: string[];
  noIndex?: boolean;
}): Metadata {
  const url = options.path ? `${SITE_URL}${options.path}` : SITE_URL;
  const image = options.image || DEFAULT_IMAGE;

  return {
    title: options.title,
    description: options.description,
    keywords: options.keywords,
    openGraph: {
      title: options.title,
      description: options.description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image, width: 1200, height: 630 }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: options.title,
      description: options.description,
      images: [image],
    },
    alternates: {
      canonical: url,
    },
    robots: options.noIndex ? { index: false, follow: false } : undefined,
  };
}

export function createToolMetadata(tool: Tool): Metadata {
  return createMetadata({
    title: `${tool.name} | Free Online Tool | ${SITE_NAME}`,
    description: tool.metaDescription,
    path: `/tools/${tool.slug}`,
    image: `/og/tools/${tool.slug}.png`,
    keywords: tool.keywords,
  });
}

export function createCityMetadata(city: City): Metadata {
  const title = `${city.name} Map Generator | SVG, 3D & Poster Maps | ${SITE_NAME}`;
  const description = `Create custom ${city.name} maps for laser cutting, 3D printing, and wall art. Free instant download with roads, water, parks, and buildings.`;

  return createMetadata({
    title,
    description,
    path: `/maps/${city.slug}`,
    image: `/og/maps/${city.slug}.png`,
    keywords: [
      `${city.name.toLowerCase()} map`,
      `${city.name.toLowerCase()} svg`,
      `${city.name.toLowerCase()} laser cut`,
      `${city.name.toLowerCase()} 3d print`,
      `${city.name.toLowerCase()} wall art`,
    ],
  });
}

export function createBlogMetadata(post: {
  title: string;
  description: string;
  slug: string;
  image?: string;
}): Metadata {
  return createMetadata({
    title: `${post.title} | ${SITE_NAME} Blog`,
    description: post.description,
    path: `/blog/${post.slug}`,
    image: post.image || `/og/blog/${post.slug}.png`,
  });
}

export function createGuideMetadata(guide: {
  title: string;
  description: string;
  slug: string;
}): Metadata {
  return createMetadata({
    title: `${guide.title} | ${SITE_NAME} Guides`,
    description: guide.description,
    path: `/guides/${guide.slug}`,
  });
}

export const defaultMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - Free Map Generator for Makers`,
    template: `%s | ${SITE_NAME}`,
  },
  description: 'Create custom maps for laser cutting, 3D printing, and wall art. Free SVG, STL, and poster downloads.',
  keywords: [
    'map generator',
    'svg map',
    'laser cut map',
    '3d city model',
    'map poster',
    'custom map',
    'city map',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: DEFAULT_IMAGE, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};
