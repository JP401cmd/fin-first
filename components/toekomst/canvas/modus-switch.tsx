'use client'

/**
 * ModusSwitch — Vermogen · Samenstelling · Geldstroom boven het canvas (ADR 0179 D3).
 *
 * Een segmented control (`role="radiogroup"`): één keuze uit drie weergaven van
 * hetzelfde resultaat. Bewust een ander uiterlijk dan de katern-koppen (die zijn
 * navigatie). De app heeft geen gedeelde segmented-primitive; dit volgt het
 * krant-patroon van de bestaande segmented controls (aaneengesloten vakjes, scherpe
 * hoeken, pijltoetsen — zie `debt-payoff-strategy.tsx` / `crypto-performance-chart.tsx`)
 * met het horizon-accent van de huidige grafiekkop voor de actieve stand.
 *
 * De sub-toggle Lijnen / Bronnen verschijnt alleen bij Geldstroom. Eenvoudig toont
 * alleen Lijnen: Bronnen staat in `HideInSimple` (ADR 0026, nooit een ternary op de
 * weergavemodus). De host bewaakt dat `sub` in Eenvoudig op `'lijnen'` staat.
 *
 * Presentational: state komt van de host (canvas-state in de provider).
 */

import { useRef, type KeyboardEvent } from 'react'
import { HideInSimple } from '@/components/app/hide-in-simple'
import {
  CANVAS_MODUS_GROEP_LABEL,
  CANVAS_MODUS_LABEL,
  CANVAS_MODUS_VOLGORDE,
  GELDSTROOM_SUB_GROEP_LABEL,
  GELDSTROOM_SUB_LABEL,
  type CanvasModus,
  type GeldstroomSub,
} from '@/lib/horizon/katern-copy'

export interface ModusSwitchProps {
  value: CanvasModus
  onChange: (modus: CanvasModus) => void
  /** Sub-weergave van Geldstroom. */
  sub: GeldstroomSub
  onSubChange: (sub: GeldstroomSub) => void
  /** Welke modi dit katern aanbiedt (Instellingen: alleen Vermogen). Default alle drie. */
  modi?: readonly CanvasModus[]
  className?: string
}

/** Pijltoetsen/Home/End binnen een radiogroup: kies én focus de buur (WAI-ARIA). */
function rovingKey<T extends string>(
  e: KeyboardEvent<HTMLButtonElement>,
  opties: readonly T[],
  huidig: T,
  kies: (v: T) => void,
  refs: (HTMLButtonElement | null)[],
) {
  const i = opties.indexOf(huidig)
  const last = opties.length - 1
  let next: number | null = null
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i >= last ? 0 : i + 1
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i <= 0 ? last : i - 1
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = last
  if (next == null) return
  e.preventDefault()
  kies(opties[next])
  refs[next]?.focus()
}

const VAK =
  'inline-flex min-h-[44px] items-center justify-center px-3 text-[11px] font-medium transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink)] lg:min-h-[32px]'
const VAK_AAN = 'bg-horizon-50 text-horizon-700'
const VAK_UIT = 'text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]'

export function ModusSwitch({
  value,
  onChange,
  sub,
  onSubChange,
  modi = CANVAS_MODUS_VOLGORDE,
  className = '',
}: ModusSwitchProps) {
  const modusRefs = useRef<(HTMLButtonElement | null)[]>([])
  const subRefs = useRef<(HTMLButtonElement | null)[]>([])
  const subOpties: readonly GeldstroomSub[] = ['lijnen', 'bronnen']

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`}>
      <div
        role="radiogroup"
        aria-label={CANVAS_MODUS_GROEP_LABEL}
        className="inline-flex items-stretch divide-x divide-[var(--border-ed)] border border-[var(--border-ed)] bg-[var(--paper)]"
        data-testid="modus-switch"
      >
        {modi.map((modus, index) => {
          const aan = modus === value
          return (
            <button
              key={modus}
              ref={(node) => {
                modusRefs.current[index] = node
              }}
              type="button"
              role="radio"
              aria-checked={aan}
              tabIndex={aan ? 0 : -1}
              onClick={() => onChange(modus)}
              onKeyDown={(e) => rovingKey(e, modi, value, onChange, modusRefs.current)}
              className={`${VAK} ${aan ? VAK_AAN : VAK_UIT}`}
            >
              {CANVAS_MODUS_LABEL[modus]}
            </button>
          )
        })}
      </div>

      {value === 'geldstroom' && (
        <div
          role="radiogroup"
          aria-label={GELDSTROOM_SUB_GROEP_LABEL}
          className="inline-flex items-center gap-1"
          data-testid="geldstroom-sub"
        >
          {subOpties.map((s, index) => {
            const aan = s === sub
            const knop = (
              <button
                key={s}
                ref={(node) => {
                  subRefs.current[index] = node
                }}
                type="button"
                role="radio"
                aria-checked={aan}
                tabIndex={aan ? 0 : -1}
                onClick={() => onSubChange(s)}
                onKeyDown={(e) => rovingKey(e, subOpties, sub, onSubChange, subRefs.current)}
                className={`min-h-[44px] px-1.5 font-mono text-[10px] uppercase tracking-[0.12em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] lg:min-h-[32px] ${
                  aan ? 'text-[var(--ink)] underline underline-offset-4' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {GELDSTROOM_SUB_LABEL[s]}
              </button>
            )
            return s === 'bronnen' ? <HideInSimple key={s}>{knop}</HideInSimple> : knop
          })}
        </div>
      )}
    </div>
  )
}
