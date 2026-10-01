/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const api = process.env.API_URL || 'http://localhost:4000';
    return [{ source: '/backend/:path*', destination: `${api}/api/:path*` }];
  },
};

module.exports = nextConfig;
