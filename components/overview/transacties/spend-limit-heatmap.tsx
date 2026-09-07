'use client'

/**
 * SpendLimitHeatmap — één cel per periode in het venster van een grenzenpot.
 *
 * euro-view: exempt (gerealiseerde historie)
 *
 * ── VIER TOESTANDEN, GEEN INTENSITEITSRAMP (D14) ────────────────────────────
 * Een cel is `geen uitgaven`, `binnen`, `grens bereikt` of `boven` — plus de
 * voorlopig-markering op de lopende periode. Bewust GEEN ramp over bedragen
 * (zoals de uitgaven-intensiteit-heatmap wél doet): uit een ramp valt via de
 * kleur een bedrag te reconstrueren, ook wanneer bedragmaskering aan staat. Een
 * kleine, vaste set toestanden is daarmee maskering-immuun én is precies de norm
 * die de gebruiker zelf stelde.
 *
 * Niet alleen kleur: `boven` is óók duidelijk donkerder dan `binnen` (solide
 * negative-token vs. lichte tint), `bereikt` draagt een zichtbaar sterkere rand
 * dan de andere tinten, en elke cel draagt een tekstueel `aria-label`.
 * Kleurenblindheid mag het beeld niet betekenisloos maken.
 *
 * CONSUME, DON'T RECOMPUTE: `status` komt uit de motor en de bereikt-lezing uit
 * de gedeelde standen-map (`resolveSpendLimitOutcomeState`, ADR 0136). Dit
 * component leidt alleen "geen uitgaven" af uit het aantal gematchte
 * transacties — een weergave-onderscheid binnen `within`, geen tweede
 * statusregel.
 */

import { useState } from 'react'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { formatMaskedCurrency } from '@/lib/format'
import type { SpendLimitPeriodOutcome } from '@/lib/spend-limits/engine'
import {
  resolveSpendLimitOutcomeState,
  SPEND_LIMIT_STATUS_LABEL_INLINE,
} from '@/lib/spend-limits/status-display'

type CellState = 'none' | 'within' | 'reached' | 'over'

function cellState(o: SpendLimitPeriodOutcome): CellState {
  const state = resolveSpendLimitOutcomeState(o)
  if (state === 'exceeded') return 'over'
  if (state === 'reached') return 'reached'
  // Een periode zonder gematchte transactie is niet "goed gegaan" — er is niets
  // gebeurd. Dat verschil is voor een gedragsinstrument betekenisvol. Een
  // periode die de grens raakte kan hier niet vallen: daar is per definitie
  // uitgegeven.
  return o.matchedTransactionCount === 0 ? 'none' : 'within'
}

const STATE_STYLE: Record<CellState, { background: string; boxShadow: string }> = {
  none: { background: 'var(--subtle)', boxShadow: 'inset 0 0 0 1px var(--border-ed)' },
  within: {
    background: 'var(--positive-bg)',
    boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--positive) 40%, transparent)',
  },
  // Warning-familie, niet negative: er is niets overschreden. De volle rand
  // onderscheidt hem van `within` zonder een vijfde kleur te introduceren.
  reached: {
    background: 'var(--warning-bg)',
    boxShadow: 'inset 0 0 0 2px var(--warning)',
  },
  over: { background: 'var(--negative)', boxShadow: 'inset 0 0 0 1px var(--negative)' },
}

const STATE_WORD: Record<CellState, string> = {
  none: 'geen uitgaven',
  within: SPEND_LIMIT_STATUS_LABEL_INLINE.within,
  reached: SPEND_LIMIT_STATUS_LABEL_INLINE.reached,
  over: SPEND_LIMIT_STATUS_LABEL_INLINE.exceeded,
}

export interface SpendLimitHeatmapProps {
  /** De periodes in het venster, oud → nieuw, inclusief de lopende periode. */
  outcomes: SpendLimitPeriodOutcome[]
  selectedPeriodKey?: string | null
  onSelectPeriod?: (periodKey: string) => void
}

export function SpendLimitHeatmap({
  outcomes,
  selectedPeriodKey = null,
  onSelectPeriod,
}: SpendLimitHeatmapProps) {
  const { masked } = useMaskedAmounts()
  const [activeKey, setActiveKey] = useState<string | null>(null)

  if (outcomes.length === 0) return null

  const active = outcomes.find((o) => o.periodKey === activeKey) ?? null

  return (
    <div className="space-y-2">
      <div className="grid auto-cols-fr grid-flow-col gap-1">
        {outcomes.map((o) => {
          const state = cellState(o)
          const style = STATE_STYLE[state]
          const label = `${o.label}: ${STATE_WORD[state]}${o.isOpen ? ', voorlopig' : ''}, ${
            o.matchedTransactionCount
          } transactie${o.matchedTransactionCount === 1 ? '' : 's'}`
          const isSelected = o.periodKey === selectedPeriodKey

          return (
            <button
              key={o.periodKey}
              type="button"
              aria-label={label}
              aria-pressed={onSelectPeriod ? isSelected : undefined}
              onMouseEnter={() => setActiveKey(o.periodKey)}
              onMouseLeave={() => setActiveKey(null)}
              onFocus={() => setActiveKey(o.periodKey)}
              onBlur={() => setActiveKey(null)}
              onClick={onSelectPeriod ? () => onSelectPeriod(o.periodKey) : undefined}
              className="w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              style={{
                aspectRatio: '1 / 1',
                background: style.background,
                boxShadow: isSelected
                  ? `${style.boxShadow}, 0 0 0 2px var(--ink)`
                  : style.boxShadow,
                // Voorlopig: gestreepte rand, zelfde idioom als de grafiek.
                border: o.isOpen ? '1px dashed var(--ink-3)' : '1px solid transparent',
              }}
            />
          )
        })}
      </div>

      {/* Één regel duiding onder het rooster, ook bereikbaar via toetsenbordfocus
          (geen hover-only informatie). Bedrag maskeert; periode, status en het
          aantal transacties blijven staan. */}
      <p aria-live="polite" className="min-h-[1.25rem] text-[11px] text-[var(--ink-2)]">
        {active ? (
          <>
            <span className="capitalize">{active.label}</span>
            {active.isOpen && ' · voorlopig'} · {STATE_WORD[cellState(active)]} ·{' '}
            <span className="font-mono tabular-nums">
              {formatMaskedCurrency(active.periodMatchedAmount, masked)}
            </span>{' '}
            · {active.matchedTransactionCount} transactie
            {active.matchedTransactionCount === 1 ? '' : 's'}
          </>
        ) : (
          <span className="text-[var(--ink-3)]">
            Elke cel is één periode — links de oudste, rechts de lopende.
          </span>
        )}
      </p>
    </div>
  )
}
