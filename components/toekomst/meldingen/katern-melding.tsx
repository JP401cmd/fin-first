'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Minus } from 'lucide-react'
import {
  LEVERAGE_STATUS_DOT,
  leverageStatusBgClass,
  leverageStatusTextClass,
  type LeverageStatus,
} from '@/lib/leverage-status'
import { tapTargetClass } from '@/components/editorial/tap-target'
import type { KaternMelding as KaternMeldingData } from '@/lib/horizon/katern-meldingen'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * KaternMelding — het meldingenslot bovenaan een katern op /toekomst (ADR 0179 D6,
 * spec §4.8). Presentational: de host geeft de gesorteerde meldingen van dít katern
 * (`wijsMeldingenToe(...)[katern].meldingen`) en de weergave uit
 * `useKaternMeldingMinimize`.
 *
 * - Hoogstens één melding uitgeklapt: de eerste (hoogste ernst). Het aantal staat bij het
 *   punt op de katern-kop, niet hier.
 * - Geminimaliseerd rendert het slot niets zichtbaars; het punt op de katern-kop blijft.
 * - Desktop: de look van `PageStatusBanner` (3px streep, mono-kicker, "Minimaliseren",
 *   titel, uitleg, actie). Stoplichtklassen voor warn/bad/good; informatief (neutral)
 *   in de horizon-toon, net als de informatieve vrijheidsbanner.
 * - Mobiel: één regel van 44px (titel + actie + minimaliseren); de uitleg na een tik.
 * - De `aria-live`-regio is altijd gemount; minimaliseren en heropenen worden
 *   aangekondigd.
 */
export interface KaternMeldingProps {
  meldingen: readonly KaternMeldingData[]
  display: BannerDisplay | 'none'
  onMinimize: () => void
  /** Zonder host die het onthoudt geen knop die niets doet. Default `true`. */
  canMinimize?: boolean
  className?: string
}

const MINIMALISEREN = 'Minimaliseren'
const GEMINIMALISEERD_SR =
  'Melding geminimaliseerd. Activeer het statuspunt op de katern-kop om de melding opnieuw te tonen.'

/** Kicker zoals `PageStatusBanner`: alleen bij alarm; informatief draagt de titel het. */
function kicker(ernst: LeverageStatus): string | null {
  if (ernst === 'bad') return 'Actie nodig'
  if (ernst === 'warn') return 'Aandacht'
  return null
}

function tinten(ernst: LeverageStatus): { bg: string; streep: string; kickerTekst: string } {
  if (ernst === 'neutral') {
    return {
      bg: 'bg-gradient-to-r from-horizon-50 to-stone-50',
      streep: 'bg-horizon-500',
      kickerTekst: 'text-horizon-700',
    }
  }
  return {
    bg: leverageStatusBgClass(ernst),
    streep: LEVERAGE_STATUS_DOT[ernst],
    kickerTekst: leverageStatusTextClass(ernst),
  }
}

export function KaternMelding({
  meldingen,
  display,
  onMinimize,
  canMinimize = true,
  className = '',
}: KaternMeldingProps) {
  const [uitlegOpen, setUitlegOpen] = useState(false)
  const uitlegId = useId()
  const melding = meldingen[0] ?? null
  const zichtbaar = melding != null && display === 'expanded'

  return (
    <section role="status" aria-live="polite" className={className} data-testid="katern-melding">
      {melding != null && display === 'minimized' && <span className="sr-only">{GEMINIMALISEERD_SR}</span>}
      {zichtbaar && (
        <MeldingKaart
          melding={melding}
          uitlegOpen={uitlegOpen}
          onToggleUitleg={() => setUitlegOpen((o) => !o)}
          uitlegId={uitlegId}
          onMinimize={onMinimize}
          canMinimize={canMinimize}
        />
      )}
    </section>
  )
}

function MeldingKaart({
  melding,
  uitlegOpen,
  onToggleUitleg,
  uitlegId,
  onMinimize,
  canMinimize,
}: {
  melding: KaternMeldingData
  uitlegOpen: boolean
  onToggleUitleg: () => void
  uitlegId: string
  onMinimize: () => void
  canMinimize: boolean
}) {
  const { bg, streep, kickerTekst } = tinten(melding.ernst)
  const k = kicker(melding.ernst)
  const heeftUitleg = !!melding.uitleg

  return (
    <div
      className={`flex gap-3 rounded-[var(--r)] border border-[var(--border-md)] ${bg} px-3 lg:mt-4 lg:p-4`}
      data-testid={`katern-melding-${melding.id}`}
      data-ernst={melding.ernst}
    >
      <div className={`my-2 w-[3px] shrink-0 self-stretch rounded-full lg:my-0 ${streep}`} aria-hidden="true" />

      <div className="min-w-0 flex-1">
        {/* Mobiel: één regel — titel (tik = uitleg), actie, minimaliseren. */}
        <div className="flex items-center gap-2 lg:hidden">
          {heeftUitleg ? (
            <button
              type="button"
              onClick={onToggleUitleg}
              aria-expanded={uitlegOpen}
              aria-controls={uitlegId}
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-1 text-left font-sans text-[13px] font-semibold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <span className="truncate">{melding.titel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-3)] transition-transform ${uitlegOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            <p className="flex min-h-[44px] min-w-0 flex-1 items-center font-sans text-[13px] font-semibold text-[var(--ink)]">
              <span className="truncate">{melding.titel}</span>
            </p>
          )}
          {melding.actie && (
            <Link
              href={melding.actie.href}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1 font-sans text-[12px] font-semibold text-[var(--ink)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              {melding.actie.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          )}
          {canMinimize && (
            <button
              type="button"
              onClick={onMinimize}
              aria-label={MINIMALISEREN}
              title={MINIMALISEREN}
              className={`${tapTargetClass('reserve')} inline-flex shrink-0 items-center justify-center text-[var(--ink-3)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {heeftUitleg && uitlegOpen && (
          <p id={uitlegId} className="pb-3 font-serif text-[13px] text-[var(--ink-2)] lg:hidden">
            {melding.uitleg}
          </p>
        )}

        {/* Desktop: de banner-look van PageStatusBanner. */}
        <div className="hidden lg:block">
          <div className="flex items-start justify-between gap-3">
            {k ? (
              <p className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${kickerTekst}`}>{k}</p>
            ) : (
              <p className="font-sans text-sm font-semibold text-[var(--ink)]">{melding.titel}</p>
            )}
            {canMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                aria-label={MINIMALISEREN}
                title={MINIMALISEREN}
                className="-mr-1 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-[var(--r-sm)] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                {MINIMALISEREN}
              </button>
            )}
          </div>
          {k && <p className="mt-1 font-sans text-sm font-semibold text-[var(--ink)]">{melding.titel}</p>}
          {heeftUitleg && <p className="mt-1 font-serif text-sm text-[var(--ink-2)]">{melding.uitleg}</p>}
          {melding.actie && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link
                href={melding.actie.href}
                className="inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-[var(--ink)] px-3 py-2.5 text-[12px] font-semibold text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              >
                {melding.actie.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
