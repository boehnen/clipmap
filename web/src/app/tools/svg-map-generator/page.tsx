import { Metadata } from 'next';
import { getToolBySlug } from '@/data/tools';
import { Breadcrumbs } from '@/components/seo/Breadcrumbs';
import { JsonLd } from '@/components/seo/JsonLd';
import { createToolMetadata } from '@/lib/seo/metadata';
import { createToolSchema, createHowToSchema } from '@/lib/seo/structured-data';
import { SvgMapTool } from './SvgMapTool';

const tool = getToolBySlug('svg-map-generator')!;

export const metadata: Metadata = createToolMetadata(tool);

const HOW_TO_STEPS = [
  { name: 'Navigate to your location', text: 'Use the map to find the area you want to export. You can search for cities or zoom manually.' },
  { name: 'Select your region', text: 'Drag the handles to resize your selection, or click "Fit to View" to match the viewport.' },
  { name: 'Choose export type', text: 'Select SVG Map for laser cutting, with more formats coming soon.' },
  { name: 'Configure and export', text: 'Choose your layers and click Export to download your files.' },
];

export default function SvgMapGeneratorPage() {
  return (
    <>
      <JsonLd data={createToolSchema(tool)} />
      <JsonLd data={createHowToSchema('How to Create an SVG Map', HOW_TO_STEPS)} />

      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Tool - full height, no header for cleaner look */}
        <SvgMapTool />
      </div>
    </>
  );
}
