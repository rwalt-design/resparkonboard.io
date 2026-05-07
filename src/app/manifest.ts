import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReSPARK Onboard',
    short_name: 'Onboard',
    description: 'Customer onboarding platform',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0f12',
    theme_color: '#0d0f12',
    icons: [
      {
        src: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/favicon-32.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
  }
}
