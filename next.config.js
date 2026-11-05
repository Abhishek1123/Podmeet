/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build run beside a live `next dev` without sharing .next
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: false,
  images: {
    formats: ['image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
    ],
  },
  // Proxy Firebase's auth helper through our own origin so sign-in works in
  // storage-partitioned browsers (iOS Safari, etc.).
  rewrites: async () => {
    const firebaseDomain =
      process.env.FIREBASE_AUTH_PROXY_TARGET || 'podmeet-app-studio.firebaseapp.com';
    return [
      { source: '/__/auth/:path*', destination: `https://${firebaseDomain}/__/auth/:path*` },
      { source: '/__/firebase/:path*', destination: `https://${firebaseDomain}/__/firebase/:path*` },
    ];
  },
  headers: async () => {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'unsafe-none',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
