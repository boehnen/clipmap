import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { JsonLd } from '@/components/seo/JsonLd';
import { createWebsiteSchema, createOrganizationSchema } from '@/lib/seo/structured-data';
import { defaultMetadata } from '@/lib/seo/metadata';
import '@/styles/globals.css';

export const metadata: Metadata = defaultMetadata;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />
        <JsonLd data={createWebsiteSchema()} />
        <JsonLd data={createOrganizationSchema()} />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
