import { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { createMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = createMetadata({
  title: 'About ClipMap',
  description: 'ClipMap is a free map generator for makers. Create custom maps for laser cutting, 3D printing, and wall art.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <div className="container-page py-8 max-w-3xl">
      <Breadcrumbs items={[{ name: 'About', path: '/about' }]} />

      <article className="mt-6 prose prose-neutral max-w-none">
        <h1>About ClipMap</h1>

        <p className="lead">
          ClipMap is a free tool for creating custom maps for makers.
          Whether you&apos;re laser cutting a city map, 3D printing your neighborhood,
          or designing minimalist wall art, we make it easy.
        </p>

        <h2>Our Mission</h2>
        <p>
          We believe everyone should be able to create beautiful, personalized maps.
          No design skills required, no expensive software needed.
          Just pick your location, customize your layers, and download.
        </p>

        <h2>How It Works</h2>
        <p>
          ClipMap uses OpenStreetMap data to generate high-quality vector maps.
          We process the data to create clean, optimized files perfect for:
        </p>
        <ul>
          <li>Laser cutting on wood, acrylic, or other materials</li>
          <li>3D printing detailed city models</li>
          <li>Creating minimalist poster art</li>
          <li>Vinyl cutting for signs and decals</li>
          <li>Digital design projects</li>
        </ul>

        <h2>Free & Supported by Ads</h2>
        <p>
          ClipMap is free to use. We show a short ad before each download to keep
          the service running. We keep ads minimal and non-intrusive - no pop-ups,
          no auto-playing videos, no dark patterns.
        </p>

        <h2>Open Data</h2>
        <p>
          All map data comes from <a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>,
          a collaborative project to create a free editable map of the world.
          Maps generated with ClipMap can be used for personal and commercial projects.
        </p>

        <h2>Get in Touch</h2>
        <p>
          Have questions, feedback, or feature requests? We&apos;d love to hear from you.
        </p>
        <ul>
          <li>Email: <a href="mailto:hello@clipmap.io">hello@clipmap.io</a></li>
          <li>GitHub: <a href="https://github.com/clipmap" target="_blank" rel="noopener noreferrer">github.com/clipmap</a></li>
        </ul>
      </article>

      <div className="mt-12 text-center">
        <Link href="/tools/svg-map-generator" className="btn-primary">
          Create Your First Map
        </Link>
      </div>
    </div>
  );
}
