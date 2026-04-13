/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone output is used by Railway/Docker only.
  // On Vercel this env var is not set, so output defaults to the standard Next.js export.
  output: process.env.STANDALONE_OUTPUT ? 'standalone' : undefined,
  // BASE_PATH=1 is set in Dockerfile.dashboard so nginx can proxy /dashboard.
  // Not set on Vercel (own domain) or in local dev.
  basePath: process.env.BASE_PATH ? '/dashboard' : '',
};

module.exports = nextConfig;
