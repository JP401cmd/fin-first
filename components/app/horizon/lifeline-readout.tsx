'use client'

/**
 * LifelineReadout — horizontale "cijferbar" boven de levenslijn-grafiek op
 * /toekomst. Beweegt mee met de hover/playback (parent levert de actieve
 * leeftijd en de reeds-afgeleide waarden). Puur presentational; herberekent
 * niets — vrijheidstijd/vermogen komen kant-en-klaar binnen.
 *
 * Model: de `.hero-readout` uit de Toekomst-mockup. Editorial Finance-stijl:
 * ingetogen tokens, Playfair-leeswaarden, horizon-accent voor vrijheidstijd.
 */

import type { ReactNode } from 'react'
import { formatCurrency } from '@/lib/format'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

export interface LifelineReadoutProps {
  age: number
  year: number
  /** "Opbouw" | "Overgang" | "Onttrekking" — zelfde labels als de fasebalk. */
  phaseLabel: string
  /** CSS-kleurwaarde (hex of var()) voor de fase-pill — parent levert via getPhaseHex. */
  phaseColor: string
  netWorth: number
  /** Reeds geformatteerde vrijheidstijd, bv. "6 jr 5 mnd". */
  freedomTime: string
  /** "Ruimte / maand" | "Inleg / maand" */
  monthlyLabel: string
  monthlyAmount: number
  /** Geen hover/playback actief → rust-toestand (subtiel gedimd). */
  isResting?: boolean
}

function Cell({ label, children, accent }: { label: string; children: ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-[104px] flex-1 border-r border-[var(--border-ed)] px-4 py-2.5 last:border-r-0">
      <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">{label}</div>
      <div
        className="mt-1 whitespace-nowrap text-[18px] leading-none tabular-nums"
        style={{ fontFamily: PLAYFAIR, color: accent ? 'var(--color-horizon-600)' : 'var(--ink)' }}
      >
        {children}
      </div>
    </div>
  )
}

export function LifelineReadout({
  age,
  year,
  phaseLabel,
  phaseColor,
  netWorth,
  freedomTime,
  monthlyLabel,
  monthlyAmount,
  isResting,
}: LifelineReadoutProps) {
  return (
    <div
      className="flex flex-wrap items-stretch overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]"
      style={{ opacity: isResting ? 0.72 : 1, transition: 'opacity .2s ease' }}
      aria-live="polite"
    >
      <Cell label="Leeftijd">
        {age}{' '}
        <span className="text-[13px] text-[var(--ink-3)]" style={{ fontFamily: SOURCE_SERIF }}>
          · {year}
        </span>
      </Cell>

      <div className="min-w-[104px] flex-1 border-r border-[var(--border-ed)] px-4 py-2.5 last:border-r-0">
        <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[var(--ink-3)]">Fase</div>
        <span
          className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
          style={{
            color: phaseColor,
            border: `1px solid ${phaseColor}`,
            background: `color-mix(in srgb, ${phaseColor} 12%, transparent)`,
          }}
        >
          {phaseLabel}
        </span>
      </div>

      <Cell label="Netto vermogen">{formatCurrency(netWorth)}</Cell>
      <Cell label="Vrij besteedbaar" accent>{freedomTime}</Cell>
      <Cell label={monthlyLabel}>{formatCurrency(monthlyAmount)}</Cell>
    </div>
  )
}
