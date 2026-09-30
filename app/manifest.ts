import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'myteam',
    short_name: 'myteam',
    description: 'Check-in, lineups and fair substitutions for rec soccer coaches.',
    start_url: '/',
    display: 'standalone',
    background_color: '#edf2ee',
    theme_color: '#0b7a3b',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
