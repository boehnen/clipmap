import Link from 'next/link';
import { TOOLS } from '@/data/tools';
import { getPopularCities } from '@/data/cities';
import { JsonLd } from '@/components/seo/JsonLd';
import { createHowToSchema, createFAQSchema } from '@/lib/seo/structured-data';

const POPULAR_CITIES = getPopularCities(6);

const HOW_TO_STEPS = [
  { name: 'Select your area', text: 'Use the interactive map to draw a rectangle around any location in the world.' },
  { name: 'Choose your layers', text: 'Select which map features to include: roads, water, buildings, parks, and more.' },
  { name: 'Download instantly', text: 'Get your custom map file ready for laser cutting, 3D printing, or wall art.' },
];

const FAQS = [
  {
    question: 'What formats can I download?',
    answer: 'Currently we offer SVG for laser cutting and design. STL for 3D printing and PNG for posters are coming soon.',
  },
  {
    question: 'Is ClipMap free to use?',
    answer: 'Yes! Map generation is free. Watch a short ad to download your files.',
  },
  {
    question: 'Can I use the maps commercially?',
    answer: 'Yes, all generated maps can be used for personal and commercial projects. Map data is from OpenStreetMap.',
  },
  {
    question: 'What cities are available?',
    answer: 'You can create maps of anywhere in the world. We have quick-start pages for popular cities.',
  },
];

export default function HomePage() {
  return (
    <>
      <JsonLd data={createHowToSchema('How to Create a Custom Map', HOW_TO_STEPS)} />
      <JsonLd data={createFAQSchema(FAQS)} />

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-white to-neutral-50 py-20">
        <div className="container-page text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-neutral-900 mb-6 text-balance">
            Create Custom Maps for Makers
          </h1>
          <p className="text-lg md:text-xl text-neutral-600 max-w-2xl mx-auto mb-8">
            Generate maps for laser cutting, 3D printing, and wall art.
            Choose any location, customize layers, download instantly.
          </p>
          <Link href="/tools/svg-map-generator" className="btn-primary text-lg px-8 py-3">
            Create Your Map
          </Link>
        </div>
      </section>

      {/* Tools Section */}
      <section className="py-16 bg-white">
        <div className="container-page">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-4 text-center">
            Choose Your Format
          </h2>
          <p className="text-neutral-600 text-center mb-12 max-w-xl mx-auto">
            Different tools for different projects. All powered by the same high-quality map data.
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TOOLS.map(tool => (
              <Link
                key={tool.slug}
                href={tool.available ? `/tools/${tool.slug}` : '#'}
                className={`card-hover p-6 ${!tool.available ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    tool.available ? 'bg-brand-100' : 'bg-neutral-100'
                  }`}>
                    <span className={`font-semibold text-sm ${
                      tool.available ? 'text-brand-600' : 'text-neutral-500'
                    }`}>
                      {tool.outputFormat}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900 mb-1">
                      {tool.shortName}
                      {!tool.available && (
                        <span className="ml-2 text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-neutral-600">{tool.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 bg-neutral-50">
        <div className="container-page">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-12 text-center">
            How It Works
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {HOW_TO_STEPS.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 bg-brand-600 text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {index + 1}
                </div>
                <h3 className="font-semibold text-neutral-900 mb-2">{step.name}</h3>
                <p className="text-neutral-600">{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Popular Cities */}
      <section className="py-16 bg-white">
        <div className="container-page">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900">
              Popular Cities
            </h2>
            <Link href="/maps" className="link text-sm">
              View all cities &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {POPULAR_CITIES.map(city => (
              <Link
                key={city.slug}
                href={`/maps/${city.slug}`}
                className="card-hover p-4 text-center"
              >
                <h3 className="font-medium text-neutral-900">{city.name}</h3>
                <p className="text-sm text-neutral-500">{city.country}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 bg-neutral-50">
        <div className="container-page max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 mb-8 text-center">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            {FAQS.map((faq, index) => (
              <div key={index} className="card p-6">
                <h3 className="font-semibold text-neutral-900 mb-2">{faq.question}</h3>
                <p className="text-neutral-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-brand-600">
        <div className="container-page text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Ready to Create Your Map?
          </h2>
          <p className="text-brand-100 mb-8 max-w-lg mx-auto">
            Join makers creating custom maps for laser cutting, 3D printing, and home decor.
          </p>
          <Link
            href="/tools/svg-map-generator"
            className="inline-flex items-center justify-center px-8 py-3 bg-white text-brand-600 font-semibold rounded-lg hover:bg-brand-50 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </>
  );
}
