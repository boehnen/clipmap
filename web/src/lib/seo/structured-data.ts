import { Tool, City } from '@/types';

const SITE_URL = 'https://clipmap.io';
const SITE_NAME = 'ClipMap';

export interface HowToStep {
  name: string;
  text: string;
  image?: string;
}

export function createWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Create custom maps for laser cutting, 3D printing, and wall art.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/maps?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
    sameAs: [],
  };
}

export function createToolSchema(tool: Tool) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.name,
    description: tool.description,
    url: `${SITE_URL}/tools/${tool.slug}`,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: [
      'Custom map generation',
      `Export to ${tool.outputFormat}`,
      'Instant download',
      'No sign-up required',
    ],
  };
}

export function createHowToSchema(title: string, steps: HowToStep[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: title,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      image: step.image,
    })),
  };
}

export function createFAQSchema(faqs: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function createBreadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}

export function createCityPageSchema(city: City) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${city.name} Map Generator`,
    description: `Create custom ${city.name} maps for laser cutting, 3D printing, and wall art.`,
    url: `${SITE_URL}/maps/${city.slug}`,
    about: {
      '@type': 'City',
      name: city.name,
      containedInPlace: {
        '@type': 'Country',
        name: city.country,
      },
    },
  };
}

export function createArticleSchema(article: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
  author?: string;
  image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    url: `${SITE_URL}/blog/${article.slug}`,
    datePublished: article.datePublished,
    dateModified: article.dateModified || article.datePublished,
    author: {
      '@type': 'Organization',
      name: article.author || SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/logo.png`,
      },
    },
    image: article.image || `${SITE_URL}/og/blog/${article.slug}.png`,
  };
}
