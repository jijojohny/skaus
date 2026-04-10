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

    config.externals = config.externals || {};
    if (typeof config.externals === 'object' && !Array.isArray(config.externals)) {
      config.externals['@solana/kit'] = 'commonjs @solana/kit';
      config.externals['@solana-program/memo'] = 'commonjs @solana-program/memo';
      config.externals['@solana-program/system'] = 'commonjs @solana-program/system';
      config.externals['@solana-program/token'] = 'commonjs @solana-program/token';
    }

    return config;
  },
};

module.exports = nextConfig;
