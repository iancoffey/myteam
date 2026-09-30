import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite ships WASM and data files that must be loaded from node_modules at runtime.
  serverExternalPackages: ['@electric-sql/pglite'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
}

export default nextConfig
