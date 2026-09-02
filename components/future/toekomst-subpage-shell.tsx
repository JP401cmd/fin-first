/**
 * ToekomstSubpageShell — gedeelde header voor de vier /toekomst-subpagina's
 * (Doelen, Gebeurtenissen, Voorkeuren, Rekenhulp).
 *
 * Zorgt voor een consistente terugweg naar de tijdas-landing en de canonieke
 * editorial pagina-aanhef (`PageOpening`) in dezelfde stijl als de rest van de
 * app. Module-identiteit loopt uitsluitend via `--module-active-*` (op /toekomst
 * = horizon via de route-layout) — nooit vaste kleurnamen. Optionele extra rijen
 * onder de kop komen via `children`.
 *
 * Server component — geen 'use client', geen hooks.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PageOpening, PageInfoButton } from '@/components/editorial'
import { getPageInfo } from '@/lib/page-info-content'

export function ToekomstSubpageShell({
  kicker,
  titleBefore,
  emphasis,
  titleAfter,
  deck,
  infoKey,
  children,
}: {
  /** Hairline-kicker boven de kop (tekst of nodes). */
  kicker: ReactNode
  /** Kop-tekst vóór het accent-woord (incl. eventuele spatie). */
  titleBefore: string
  /** Het italic-em-accentwoord in module-accentkleur (precies één). */
  emphasis: string
  /** Kop-tekst ná het accent-woord (incl. eventuele spatie). */
  titleAfter: string
  /** Optionele redactionele deck onder de kop. */
  deck?: ReactNode
  /**
   * Optionele PAGE_INFO-sleutel (bv. '/toekomst/doelen') — rendert de
   * "Wat zie ik hier?"-i-knop rechtsboven, op de canonieke offsets
   * (right-4 top-4 sm:right-6). Zonder sleutel geen knop (K-04).
   */
  infoKey?: string
  /** Optioneel blok onder de kop (extra rijen / acties). */
  children?: ReactNode
}) {
  return (
    <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-4">
      {infoKey && (
        <PageInfoButton
          content={getPageInfo(infoKey)}
          className="absolute right-4 top-4 sm:right-6"
        />
      )}
      <Link
        href="/toekomst"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        Terug naar tijdas
      </Link>

      <PageOpening
        className="mt-3 pr-12 sm:pr-14"
        kicker={kicker}
        titleBefore={titleBefore}
        emphasis={emphasis}
        titleAfter={titleAfter}
        deck={deck}
      >
        {children}
      </PageOpening>
    </div>
  )
}
