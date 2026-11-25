/**
 * API-ga backend-ka waxaa loo marinayaa isla domain-ka (/api/v1 → backend) si cookie-ga refresh-ku u noqdo same-origin.
 * Production: Caddy ayaa /api u gudbiya backend-ka si toos ah (rewrite-kan waa development / fallback).
 */
const API = process.env.API_URL ?? 'http://localhost:3000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // calaamadda "N" ee development-ka (bandhigga) ha muuqan
  devIndicators: false,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
