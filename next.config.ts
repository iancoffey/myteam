import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Loaded from node_modules at runtime: PGlite ships WASM/data files, pg has an optional native addon.
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // The app applies database migrations itself on first use, so the SQL files must ship with it.
  outputFileTracingIncludes: {
    '/**': ['./drizzle/**/*'],
  },
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
