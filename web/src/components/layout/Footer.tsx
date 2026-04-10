import Link from 'next/link';
import { TOOLS } from '@/data/tools';
import { getPopularCities } from '@/data/cities';

const POPULAR_CITIES = getPopularCities(8);

export function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-300">
      <div className="container-page py-12">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-white font-semibold mb-4">Map Tools</h3>
            <ul className="space-y-2 text-sm">
              {TOOLS.map(tool => (
                <li key={tool.slug}>
                  <Link
                    href={`/tools/${tool.slug}`}
                    className="hover:text-white transition-colors"
                  >
                    {tool.shortName}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Popular Cities</h3>
            <ul className="space-y-2 text-sm">
              {POPULAR_CITIES.map(city => (
                <li key={city.slug}>
                  <Link
                    href={`/maps/${city.slug}`}
                    className="hover:text-white transition-colors"
                  >
                    {city.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="hover:text-white transition-colors">
                  About
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/clipmap"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-neutral-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-neutral-500">
            &copy; {new Date().getFullYear()} ClipMap. Map data from OpenStreetMap.
          </p>
          <div className="flex items-center gap-6 text-sm text-neutral-500">
            <Link href="/about" className="hover:text-white transition-colors">
              About
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
