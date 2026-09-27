'use client'

/**
 * De compacte tijdlijn van de levensgebeurtenissen — de kolom naast de grafiek op katern
 * Plan (eigenaarswens 27 sep 2026: "verticaal korter en passend voor de ruimte").
 *
 * Zelfde inhoud en dezelfde klikbestemmingen als de volle tijdlijn in `GebeurtenissenView`
 * (die bouwt de items, de effecten en de handlers; dit component tekent alleen): een kop
 * van één regel met het aantal en een kleine "+ Toevoegen", een dunne lijn met kleine
 * punten, "Nu · 36" als eerste markering, en per gebeurtenis hooguit twee regels zonder
 * kaartkader — leeftijd en naam, dan het effect in klein schrift. Bedragen via
 * `MaskedAmount` (mono, `tabular-nums`). De pagina-weergave (mobiel) blijft de volle vorm.
 */

import { Fragment, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

/** Eén deel van de effectregel: tekst, of een bedrag dat gemaskeerd getoond wordt. */
export type CompactEffectDeel = string | { bedrag: number; voor?: string; achter?: string }

export interface CompactTijdlijnItem {
  key: string
  /** Leeftijd (heel jaar) of een datumtekst. */
  wanneer: string
  naam: string
  effect: readonly CompactEffectDeel[]
  /** Berekend door de kern (gestippeld punt), geen eigen gebeurtenis. */
  berekend?: boolean
  /** De toegankelijke naam van de knop — dezelfde als in de volle tijdlijn. */
  ariaLabel: string
  onClick: () => void
}

const KNOP =
  'block w-full min-h-[44px] py-1.5 pl-5 pr-1 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--module-active-500)]'

function Effect({ delen }: { delen: readonly CompactEffectDeel[] }) {
  return (
    <>
      {delen.map((d, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {i > 0 && <span className="sr-only">, </span>}
          {typeof d === 'string' ? (
            d
          ) : (
            <>
              {d.voor}
              <MaskedAmount value={d.bedrag} className="text-[11px]" />
              {d.achter}
            </>
          )}
        </Fragment>
      ))}
    </>
  )
}

export function GebeurtenissenTijdlijnCompact({
  kop,
  aantal,
  currentAge,
  items,
  laden,
  leeg,
  onToevoegen,
}: {
  kop: string
  /** Het aantal gebeurtenissen (dezelfde telling als de volle kop). */
  aantal: number
  currentAge?: number | null
  items: readonly CompactTijdlijnItem[]
  /** Kernel-momenten laden nog (tot hydratie): één stille skeleton-rij. */
  laden: boolean
  /** Geen gebeurtenissen en geen berekende momenten. */
  leeg: boolean
  onToevoegen: () => void
}): ReactNode {
  return (
    <div>
      <header className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
          {kop}
          <span aria-hidden="true"> · {aantal}</span>
          <span className="sr-only">
            , {aantal} gebeurtenis{aantal === 1 ? '' : 'sen'}
          </span>
        </h2>
        <button
          type="button"
          onClick={onToevoegen}
          aria-label="Levensgebeurtenis toevoegen"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 px-1 text-[13px] font-semibold text-[var(--module-active-700)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Toevoegen
        </button>
      </header>

      {leeg ? (
        <p className="mt-1 font-serif text-[13px] italic leading-snug text-[var(--ink-3)]">
          Nog geen gebeurtenissen. Voeg er een toe om te zien wat die met je vrijheid doet.
        </p>
      ) : (
        <ol className="relative mt-1" data-testid="tijdlijn-compact">
          {/* De dunne lijn door de punten. */}
          <span aria-hidden="true" className="absolute left-[4px] top-2 bottom-3 w-px bg-[var(--border-ed)]" />
          <li className="relative flex items-center gap-2.5 pb-1">
            <span
              aria-hidden="true"
              className="relative z-10 h-[9px] w-[9px] shrink-0 rounded-full border border-[var(--ink-3)] bg-[var(--paper)]"
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Nu{currentAge != null ? ` · ${currentAge}` : ''}
            </span>
          </li>
          {items.map((item) => (
            <li key={item.key} className="relative">
              <span
                aria-hidden="true"
                className={`absolute left-0 top-[14px] z-10 h-[9px] w-[9px] rounded-full ${
                  item.berekend
                    ? 'border border-dashed border-[var(--ink-3)] bg-[var(--paper)]'
                    : 'bg-[var(--ink-2)]'
                }`}
              />
              <button type="button" onClick={item.onClick} aria-label={item.ariaLabel} className={KNOP}>
                <span className="flex min-w-0 items-baseline gap-1.5 font-serif text-[14px] leading-snug text-[var(--ink)]">
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--ink-2)]">{item.wanneer}</span>
                  <span aria-hidden="true" className="text-[var(--ink-3)]">
                    ·
                  </span>
                  <span className="truncate">{item.naam}</span>
                </span>
                {item.effect.length > 0 && (
                  <span className="block truncate text-[11px] leading-snug text-[var(--ink-3)]">
                    <Effect delen={item.effect} />
                  </span>
                )}
              </button>
            </li>
          ))}
          {laden && (
            <li className="relative py-2 pl-5" aria-hidden="true">
              <span className="absolute left-0 top-[14px] h-[9px] w-[9px] rounded-full border border-dashed border-[var(--border-md)] bg-[var(--paper)]" />
              <span className="block h-3 w-40 animate-pulse bg-[var(--subtle)]" />
            </li>
          )}
        </ol>
      )}
    </div>
  )
}
