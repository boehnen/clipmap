import { MetadataRoute } from 'next';
import { CITIES } from '@/data/cities';
import { TOOLS } from '@/data/tools';

const SITE_URL = 'https://clipmap.io';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/tools`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/maps`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];

  const toolPages: MetadataRoute.Sitemap = TOOLS.filter(t => t.available).map(tool => ({
    url: `${SITE_URL}/tools/${tool.slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.9,
  }));

  const cityPages: MetadataRoute.Sitemap = CITIES.map(city => ({
    url: `${SITE_URL}/maps/${city.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [...staticPages, ...toolPages, ...cityPages];
}
