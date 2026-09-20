import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  // Keep production checks from overwriting a running development preview.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  transpilePackages: ['@jev/contracts'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_BASE_URL ?? 'http://127.0.0.1:4000'}/api/:path*` }];
  },
};
export default nextConfig;
