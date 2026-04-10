import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CITIES, getCityBySlug } from '@/data/cities';
import { TOOLS, getAvailableTools } from '@/data/tools';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { createCityMetadata } from '@/lib/seo/metadata';
import { createCityPageSchema, createFAQSchema } from '@/lib/seo/structured-data';
import { formatPopulation } from '@/lib/utils/format';

interface CityPageProps {
  params: { city: string };
}

export async function generateStaticParams() {
  return CITIES.map(city => ({ city: city.slug }));
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const city = getCityBySlug(params.city);
  if (!city) return {};
  return createCityMetadata(city);
}

export default function CityPage({ params }: CityPageProps) {
  const city = getCityBySlug(params.city);
  if (!city) notFound();

  const availableTools = getAvailableTools();
  const relatedCities = city.relatedCities
    .map(slug => getCityBySlug(slug))
    .filter(Boolean)
    .slice(0, 4);

  const faqs = [
    {
      question: `How do I create a ${city.name} map for laser cutting?`,
      answer: `Use our SVG Map Generator to create a custom ${city.name} map. Select the area, choose your layers (roads, water, buildings), and download the SVG file ready for your laser cutter.`,
    },
    {
      question: `Can I 3D print a model of ${city.name}?`,
      answer: `Yes! Our 3D City Model tool generates STL files with extruded buildings. Perfect for creating a desk model of ${city.name}.`,
    },
    {
      question: `What landmarks are included in ${city.name} maps?`,
      answer: `${city.name} maps include major features like ${city.landmarks.slice(0, 3).join(', ')}. All roads, water bodies, parks, and buildings are included based on OpenStreetMap data.`,
    },
  ];

  return (
    <>
      <JsonLd data={createCityPageSchema(city)} />
      <JsonLd data={createFAQSchema(faqs)} />

      <div className="container-page py-8">
        <Breadcrumbs
          items={[
            { name: 'Cities', path: '/maps' },
            { name: city.name, path: `/maps/${city.slug}` },
          ]}
        />

        <div className="mt-6 mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-2">
            {city.name} Map Generator
          </h1>
          <p className="text-lg text-neutral-600">
            Create custom maps of {city.name}, {city.country} for laser cutting, 3D printing, and wall art.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {/* Quick Start Tools */}
            <section className="mb-12">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Create a {city.name} Map
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {availableTools.map(tool => (
                  <Link
                    key={tool.slug}
                    href={`/tools/${tool.slug}?city=${city.slug}`}
                    className="card-hover p-5"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
                        <span className="text-brand-600 font-semibold text-xs">
                          {tool.outputFormat}
                        </span>
                      </div>
                      <h3 className="font-semibold text-neutral-900">{tool.shortName}</h3>
                    </div>
                    <p className="text-sm text-neutral-600">{tool.description}</p>
                  </Link>
                ))}
                {TOOLS.filter(t => !t.available).slice(0, 2).map(tool => (
                  <div key={tool.slug} className="card p-5 opacity-60">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center">
                        <span className="text-neutral-500 font-semibold text-xs">
                          {tool.outputFormat}
                        </span>
                      </div>
                      <h3 className="font-semibold text-neutral-700">
                        {tool.shortName}
                        <span className="ml-2 text-xs bg-neutral-200 px-2 py-0.5 rounded">
                          Coming Soon
                        </span>
                      </h3>
                    </div>
                    <p className="text-sm text-neutral-500">{tool.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* City Info */}
            <section className="mb-12">
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                About {city.name}
              </h2>
              <div className="card p-6">
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-neutral-500">Country</dt>
                    <dd className="font-medium text-neutral-900">{city.country}</dd>
                  </div>
                  {city.state && (
                    <div>
                      <dt className="text-sm text-neutral-500">State/Region</dt>
                      <dd className="font-medium text-neutral-900">{city.state}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm text-neutral-500">Population</dt>
                    <dd className="font-medium text-neutral-900">
                      {formatPopulation(city.population)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-neutral-500">Notable Landmarks</dt>
                    <dd className="font-medium text-neutral-900">
                      {city.landmarks.slice(0, 3).join(', ')}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            {/* FAQ */}
            <section>
              <h2 className="text-xl font-semibold text-neutral-900 mb-4">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div key={index} className="card p-5">
                    <h3 className="font-medium text-neutral-900 mb-2">{faq.question}</h3>
                    <p className="text-neutral-600 text-sm">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Related Cities */}
            {relatedCities.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold text-neutral-900 mb-3">Nearby Cities</h3>
                <ul className="space-y-2">
                  {relatedCities.map(related => (
                    <li key={related!.slug}>
                      <Link
                        href={`/maps/${related!.slug}`}
                        className="text-neutral-600 hover:text-brand-600 transition-colors"
                      >
                        {related!.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Ad Placeholder */}
            <div className="card p-5 bg-neutral-50 min-h-[250px] flex items-center justify-center text-neutral-400 text-sm">
              Advertisement
            </div>

            {/* Quick Links */}
            <div className="card p-5">
              <h3 className="font-semibold text-neutral-900 mb-3">Get Started</h3>
              <Link
                href={`/tools/svg-map-generator?city=${city.slug}`}
                className="btn-primary w-full text-center"
              >
                Create {city.name} Map
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
