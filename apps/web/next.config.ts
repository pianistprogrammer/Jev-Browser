import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Keep production checks from overwriting a running development preview.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@jev/contracts'],
  async rewrites() {
    const api = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/browser-ui', destination: `${api}/browser-ui/` },
      { source: '/browser-ui/:path*', destination: `${api}/browser-ui/:path*` },
    ];
  },
};
export default nextConfig;
