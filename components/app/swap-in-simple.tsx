'use client'

/**
 * SwapInSimple — toont een ANDERE inhoud in de weergavemodus "Eenvoudig" dan
 * in "Volledig". Het derde lid van de familie naast `HideInSimple` (hard weg)
 * en `DepthSection` (ingeklapt-maar-bereikbaar):
 *   'simple' → `simple` wordt gerenderd.
 *   'full'   → `children` worden gerenderd.
 *
 * WAAROM DIT BESTAAT (S14). "Toon A in plaats van B" was tot nu toe geen
 * primitive maar een handgerolde ternary op de call-site — `cash-overview.tsx`,
 * `shell/lever-compass.tsx` en `core/assets-client.tsx` doen elk hun eigen
 * variant, en S14 zou de vierde zijn geworden. Een primitive maakt de regel
 * bovendien vindbaar: een grep op `SwapInSimple` laat zien waar Eenvoudig iets
 * VERVANGT, terwijl losse ternaries onzichtbaar blijven. De drie bestaande
 * call-sites zijn bewust NIET in deze wijziging geretrofit — dat is een eigen
 * kaart, zodat een regressie daar niet aan S14 vastzit.
 *
 * SINGLE SOURCE OF TRUTH: leest uitsluitend `useDisplayMode()` — net als
 * `HideInSimple` en `DepthSection`. Géén eigen state, géén localStorage, géén
 * prop-drilling van de modus (ADR 0026). Buiten een provider valt de hook
 * bewust terug op 'simple'; tests moeten daarom altijd expliciet een
 * `DisplayModeProvider` zetten.
 *
 * Server-children-patroon: dit component is 'use client', maar béide takken
 * blijven server-gerenderd en gaan als prop/children over de grens. Een async
 * Server Component kan dus `<SwapInSimple simple={<Zin/>}><Cellen/></SwapInSimple>`
 * renderen zonder zelf client te worden.
 *
 * Rendert een fragment (géén wrapper-node) zodat layout-containers als
 * `space-y-*`/grids hun directe-kind-selectors behouden — zero layout-impact.
 */

import type { ReactNode } from 'react'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

export function SwapInSimple({
  simple,
  children,
}: {
  /** Wat er in "Eenvoudig" staat — de begrijpelijke variant. */
  simple: ReactNode
  /** Wat er in "Volledig" staat — ongewijzigd t.o.v. vóór de swap. */
  children: ReactNode
}) {
  const { mode } = useDisplayMode()
  return <>{mode === 'simple' ? simple : children}</>
}
