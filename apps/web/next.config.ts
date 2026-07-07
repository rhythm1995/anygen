import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@helix/shared'],
  reactStrictMode: true,
};

export default config;
