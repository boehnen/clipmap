import { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { SvgMapTool } from '../tools/svg-map-generator/SvgMapTool';

export const metadata: Metadata = {
  title: 'Create Map | ClipMap',
  description: 'Create custom maps for laser cutting, 3D printing, and wall art. Export SVG layers, topographic maps, city posters, and more.',
  openGraph: {
    title: 'Create Map | ClipMap',
    description: 'Create custom maps for laser cutting, 3D printing, and wall art.',
  },
};

export default function CreatePage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'ClipMap Creator',
          description: 'Create custom maps for laser cutting, 3D printing, and wall art',
          applicationCategory: 'DesignApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
        }}
      />

      <div className="h-[calc(100vh-64px)] flex flex-col">
        <SvgMapTool />
      </div>
    </>
  );
}
