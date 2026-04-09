/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@skaus/types', '@skaus/crypto'],
  experimental: {
    serverComponentsExternalPackages: ['@solana/web3.js'],
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    return config;
  },
};

module.exports = nextConfig;
