/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { hostname: 'tile.openstreetmap.org' },
      { hostname: 'a.tile.openstreetmap.org' },
      { hostname: 'b.tile.openstreetmap.org' },
      { hostname: 'c.tile.openstreetmap.org' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
