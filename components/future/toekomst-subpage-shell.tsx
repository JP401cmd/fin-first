/**
 * ToekomstSubpageShell — gedeelde header voor de vier /toekomst-subpagina's
 * (Doelen, Gebeurtenissen, Voorkeuren, Rekenhulp).
 *
 * Zorgt voor een consistente terugweg naar de tijdas-landing en de pagina-aanhef.
 * Die aanhef is sinds de kop-herziening (sep 2026) een `PageVerdictOpening`: de
 * titel spreekt het OORDEEL of het KERNCIJFER uit in plaats van een narratieve
 * vraag te stellen. De kicker is daarmee vervallen.
 *
 * ÉÉN signature voor vier routes: de shell neemt de `route` en leidt daar zowel
 * de paginanaam (`resolveRouteTitle` — dezelfde bron als de shell-`h1` en de
 * mobiele TopBar) als de PAGE_INFO-sleutel uit af. Geen losse strings per
 * pagina, dus geen drift tussen titelbalk en kop.
 *
 * Module-identiteit loopt uitsluitend via `--module-active-*` (op /toekomst =
 * horizon via de route-layout); de statuskleur van het oordeel is semantiek en
 * wordt door `PageVerdictOpening` geregeld — nooit hier. Optionele extra rijen
 * onder de kop komen via `children`.
 *
 * Server component — geen 'use client', geen hooks.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageVerdictOpening, PageInfoButton } from '@/components/editorial'
import { getPageInfo, hasPageInfo } from '@/lib/page-info-content'
import { resolveRouteTitle } from '@/lib/nav-config'
import type { LeverageStatus } from '@/lib/leverage-status'

export function ToekomstSubpageShell({
  route,
  fallbackName,
  verdict,
  tone = 'neutral',
  deck,
  infoKey,
  children,
}: {
  /** Canonieke route, bv. '/toekomst/doelen'. Bron van paginanaam én info-sleutel. */
  route: string
  /** Terugval als de route (nog) geen titel in nav-config heeft. */
  fallbackName: string
  /** Het oordeel of kerncijfer in de titel. `null` ⇒ alleen de paginanaam. */
  verdict: string | null
  /** Stoplichtstand van het oordeel — bepaalt uitsluitend de kleur. */
  tone?: LeverageStatus
  /** Korte redactionele deck onder de kop (twee zinnen, ~20 woorden). */
  deck?: ReactNode
  /**
   * PAGE_INFO-sleutel voor de "Wat zie ik hier?"-i-knop rechtsboven, op de
   * canonieke offsets (right-4 top-4 sm:right-6). Default = `route`.
   */
  infoKey?: string
  /** Optioneel blok onder de kop (extra rijen / acties). */
  children?: ReactNode
}) {
  const pageInfo = getPageInfo(infoKey ?? route)

  return (
    <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-4">
      {hasPageInfo(pageInfo) && (
        <PageInfoButton content={pageInfo} className="absolute right-4 top-4 sm:right-6" />
      )}
      <Link
        href="/toekomst"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Terug naar tijdas
      </Link>

      <PageVerdictOpening
        className="mt-3"
        gutterClassName="pr-12 sm:pr-14"
        pageName={resolveRouteTitle(route) ?? fallbackName}
        verdict={verdict}
        tone={tone}
        deck={deck}
      >
        {children}
      </PageVerdictOpening>
    </div>
  )
}
