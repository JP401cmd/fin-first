import type { MetadataRoute } from 'next'

// Robots-beleid: index alleen de publieke marketing-site. Alle ingelogde
// app-surfaces en auth-flows worden geweerd, zodat crawlers enkel de
// pagina's uit sitemap.ts indexeren.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/overzicht',
        '/toekomst',
        '/mijn',
        '/dashboard',
        '/core',
        '/will',
        '/horizon',
        '/identity',
        '/beheer',
        '/onboarding',
        '/berichten',
        '/nieuws',
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/auth/',
        '/logout',
        '/holdings',
        '/household-invite',
      ],
    },
    sitemap: 'https://trifinity.app/sitemap.xml',
  }
}
