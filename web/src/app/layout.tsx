import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'ClipMap - Custom Maps for Makers',
  description: 'Generate SVG maps for laser cutting, CNC, and wall art. Select any location, choose layers, download instantly.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://cdn.clipmap.io" />
      </head>
      <body className="h-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
