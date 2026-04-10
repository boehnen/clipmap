import Link from 'next/link';
import { Metadata } from 'next';
import { TOOLS } from '@/data/tools';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { createMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createMetadata({
  title: 'Map Tools | SVG, 3D, Posters & More',
  description: 'Choose from our collection of map generation tools. Create SVG maps for laser cutting, 3D city models, minimalist posters, and more.',
  path: '/tools',
  keywords: ['map tools', 'svg generator', '3d map', 'map poster', 'laser cut map'],
});

export default function ToolsIndexPage() {
  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ name: 'Tools', path: '/tools' }]} />

      <div className="mt-6 mb-12">
        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-4">
          Map Creation Tools
        </h1>
        <p className="text-lg text-neutral-600 max-w-2xl">
          Different formats for different projects. Choose the right tool for your needs,
          from laser cutting to 3D printing to wall art.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {TOOLS.map(tool => (
          <Link
            key={tool.slug}
            href={tool.available ? `/tools/${tool.slug}` : '#'}
            className={`card p-6 ${tool.available ? 'card-hover' : 'opacity-60 cursor-not-allowed'}`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
                tool.available ? 'bg-brand-100' : 'bg-neutral-100'
              }`}>
                <span className={`font-bold text-sm ${
                  tool.available ? 'text-brand-600' : 'text-neutral-500'
                }`}>
                  {tool.outputFormat}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-neutral-900">{tool.name}</h2>
                  {!tool.available && (
                    <span className="text-xs bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded">
                      Coming Soon
                    </span>
                  )}
                </div>
                <p className="text-neutral-600 mb-3">{tool.description}</p>
                <div className="flex flex-wrap gap-2">
                  {tool.keywords.slice(0, 3).map(keyword => (
                    <span
                      key={keyword}
                      className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Use Cases Section */}
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-neutral-900 mb-6">
          What Can You Create?
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-2">Laser Cut Maps</h3>
            <p className="text-neutral-600 text-sm mb-3">
              Create layered wood or acrylic city maps. Our SVG files are optimized
              for laser cutters with clean paths and proper layering.
            </p>
            <Link href="/guides/laser-cutting-maps" className="link text-sm">
              Read the guide &rarr;
            </Link>
          </div>
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-2">3D Printed Models</h3>
            <p className="text-neutral-600 text-sm mb-3">
              Print 3D city models with extruded buildings. Perfect for desk
              decorations, architectural models, or unique gifts.
            </p>
            <Link href="/guides/3d-printing-cities" className="link text-sm">
              Read the guide &rarr;
            </Link>
          </div>
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-2">Wall Art Posters</h3>
            <p className="text-neutral-600 text-sm mb-3">
              Design minimalist map posters for your home or office. Clean lines,
              modern aesthetic, ready for printing or framing.
            </p>
            <Link href="/blog/minimalist-map-poster-ideas" className="link text-sm">
              Get inspiration &rarr;
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
