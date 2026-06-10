import type { MetadataRoute } from 'next'

// Marketing-site sitemap. Bewust een statische lijst van precies de publieke
// marketing-routes — de ingelogde app-routes en de ~150 /test-* preview-routes
// horen hier NIET in (die worden via robots.ts geweerd uit de index).
//
// Priority-logica:
//   '/'                                  → 1.0  (homepage)
//   '/functies' '/prijzen' '/veiligheid' → 0.8  (conversie-pagina's)
//   de rest                              → 0.4  (informatief / juridisch)
const BASE_URL = 'https://trifinity.app'

const ROUTES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: '/', priority: 1 },
  { path: '/functies', priority: 0.8 },
  { path: '/prijzen', priority: 0.8 },
  { path: '/veiligheid', priority: 0.8 },
  { path: '/over', priority: 0.4 },
  { path: '/contact', priority: 0.4 },
  { path: '/privacy', priority: 0.4 },
  { path: '/voorwaarden', priority: 0.4 },
  { path: '/wft', priority: 0.4 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority,
  }))
}
