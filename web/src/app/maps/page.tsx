import Link from 'next/link';
import { Metadata } from 'next';
import { CITIES, getCitiesByCountry } from '@/data/cities';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { createMetadata } from '@/lib/seo/metadata';
import { formatPopulation } from '@/lib/utils/format';

export const metadata: Metadata = createMetadata({
  title: 'City Maps | Create Custom Maps for Any City',
  description: 'Browse our collection of city map generators. Create custom SVG, 3D, and poster maps for hundreds of cities worldwide.',
  path: '/maps',
  keywords: ['city maps', 'map generator', 'custom city map', 'laser cut city'],
});

const COUNTRIES = Array.from(new Set(CITIES.map(c => c.country))).sort();

export default function MapsIndexPage() {
  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ name: 'Cities', path: '/maps' }]} />

      <div className="mt-6 mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
          City Map Generators
        </h1>
        <p className="text-lg text-neutral-600 max-w-2xl">
          Create custom maps for any city in the world. Choose from SVG for laser cutting,
          STL for 3D printing, or beautiful posters for wall art.
        </p>
      </div>

      {COUNTRIES.map(country => {
        const countryCities = getCitiesByCountry(
          CITIES.find(c => c.country === country)?.countryCode || ''
        ).sort((a, b) => b.population - a.population);

        if (countryCities.length === 0) return null;

        return (
          <section key={country} className="mb-12">
            <h2 className="text-xl font-semibold text-neutral-900 mb-4 pb-2 border-b border-neutral-200">
              {country}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {countryCities.map(city => (
                <Link
                  key={city.slug}
                  href={`/maps/${city.slug}`}
                  className="card-hover p-4"
                >
                  <h3 className="font-medium text-neutral-900">{city.name}</h3>
                  <p className="text-sm text-neutral-500">
                    {city.state ? `${city.state}, ` : ''}
                    Pop. {formatPopulation(city.population)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
