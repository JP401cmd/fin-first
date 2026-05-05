'use client'

/**
 * LegacyBackLink — drop-in vervanging voor Next.js `<Link>` voor pagina-
 * ingebakken "← Terug naar X"-affordances die straks door de TopBar
 * (Bitvavo-stijl mobile shell) worden geleverd.
 *
 * Gedrag:
 *  - Feature-flag `new_navigation_shell` UIT (default productie): rendert
 *    EXACT als een Link (zelfde props, zelfde DOM). Mobile-flag-uit-UX blijft
 *    werken via deze ingebakken back-knop, want AppHeader heeft op mobile
 *    geen back-affordance.
 *  - Feature-flag AAN (testers + post-rollout): rendert `null`. Voorkomt
 *    dubbele back-knoppen wanneer de TopBar zijn eigen ←-knop al toont.
 *
 * Migratie-pad:
 *  - Tijdens transitiefase (flag uit voor productie, aan voor testen):
 *    pagina's gebruiken `<LegacyBackLink>` ipv `<Link>` voor back-links.
 *    Geen breuk voor productie, geen dubbele knoppen voor testers.
 *  - Na productie-rollout (flag verwijderd): zowel deze component als de
 *    aanroepen in pagina's mogen weg. Vervangen door simpelweg de back-link
 *    te schrappen — TopBar levert dan altijd de affordance.
 *
 * Gebruik:
 *   import { LegacyBackLink } from '@/components/app/shell/legacy-back-link'
 *
 *   <LegacyBackLink href="/core/assets/investment" className="...">
 *     <ArrowLeft className="h-3 w-3" aria-hidden="true" />
 *     <span>Beleggingen</span>
 *   </LegacyBackLink>
 *
 * SSR-gedrag: `useFeatureFlag` retourneert `false` op server (zie
 * `lib/hooks/use-feature-flag.ts` getServerSnapshot) — dus server-render
 * geeft altijd de Link. Na hydratie corrigeert client zich naar de echte
 * flag-state. Resultaat:
 *  - Flag UIT (default): geen flash, Link blijft.
 *  - Flag AAN: kortstondige flash van Link tijdens hydratie, daarna unmount.
 *    Acceptabel — flag-aan is alleen voor testers.
 */

import Link, { type LinkProps } from 'next/link'
import type { ReactNode } from 'react'
import { useFeatureFlag } from '@/lib/hooks/use-feature-flag'

type LegacyBackLinkProps = Omit<LinkProps, 'children'> & {
  className?: string
  /** Optioneel — heeft prioriteit boven label in screen-reader-context. */
  'aria-label'?: string
  children: ReactNode
}

const NEW_NAVIGATION_SHELL_FLAG = 'new_navigation_shell'

export function LegacyBackLink({ children, ...linkProps }: LegacyBackLinkProps) {
  const [enabled] = useFeatureFlag(NEW_NAVIGATION_SHELL_FLAG)
  if (enabled) return null
  return <Link {...linkProps}>{children}</Link>
}
