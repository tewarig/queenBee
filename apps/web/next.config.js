/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@queenbee/core'],
  // node-pty is a native addon — exclude from webpack bundling
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals ?? []), 'node-pty']
    }
    return config
  },
}

module.exports = nextConfig
