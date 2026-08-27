'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { guideVisitSlugsForRoute } from '@/lib/welcome-guide'
import { useFeatureVisit } from '@/lib/hooks/use-feature-visit'

/**
 * GuideVisitTracker — schrijft het bezoekregister dat de welkomstgids leest.
 *
 * Rendert niets. Staat ÉÉN keer in de app-layout in plaats van als losse hook op
 * elk van de negen betrokken pagina's: de route-tabel
 * (`GUIDE_VISIT_ROUTES` in lib/welcome-guide.ts) is dan de enige plek waar de
 * afbakening staat, en een nieuwe gidsstap kost geen aanpassing in een
 * paginabestand dat verder niets met de gids te maken heeft.
 *
 * `useSearchParams` vraagt om een `<Suspense>`-grens (anders valt de hele
 * boom terug op client-rendering) — de mount in de layout levert die.
 */
export function GuideVisitTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const slugs = guideVisitSlugsForRoute(pathname ?? '', (key) => searchParams.get(key))
  useFeatureVisit(slugs)
  return null
}
