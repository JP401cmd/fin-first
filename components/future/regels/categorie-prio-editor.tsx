'use client'

import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { CategoriePrios, PotRulesConfig, PrioSubject } from '@/lib/pot-rules'
import { RegelSectionLabel } from './shared'

/**
 * V5 (horizon-kernel) — compacte per-categorie-prio-instelling (1..5) voor één
 * onderwerp (toename/afname/onttrekking). Gedeeld door de drie pot-regel-bodies.
 *
 * Semantiek (spiegelt `lib/horizon-kernel/adapter/prio-overgang.ts`):
 *   - lager = eerder aangesproken; gewicht ½^(prio−1) (prio 1 telt dubbel t.o.v. 2),
 *   - **prio 5 = reserve**: pas aanspreken als de overige categorieën leeg zijn.
 *
 * Alleen BEZIT-categorieën. De 6 labels + hun default-prio's zijn identiek aan
 * `BEZIT_ORDER`/`basePrio()` in prio-overgang.ts (eigen huis = reserve, rest actief).
 * Schuld-prio's wachten op een oracle-fixture (F5) — bewust nog niet hier.
 */

/** Mirror van `BEZIT_ORDER` in prio-overgang.ts (kernel-categorie-identiteit). */
export const BEZIT_CATEGORIES = [
  'Spaargeld',
  'Beleggingen',
  'Pensioen',
  'Vastgoed',
  'Eigen huis',
  'Overig',
] as const

/** Mirror van `basePrio()` in prio-overgang.ts: eigen huis = 5 (reserve), rest = 4. */
export const DEFAULT_CATEGORIE_PRIOS: Record<string, number> = {
  Spaargeld: 4,
  Beleggingen: 4,
  Pensioen: 4,
  Vastgoed: 4,
  'Eigen huis': 5,
  Overig: 4,
}

const PRIO_VALUES = [1, 2, 3, 4, 5] as const

/**
 * Prio-state + save-merge voor één onderwerp, gedeeld door de drie pot-bodies.
 * `mergeCategoriePrios()` produceert de nieuwe `categoriePrios` voor de PUT-payload:
 * enabled → dit onderwerp gezet; disabled → dit onderwerp verwijderd (andere
 * onderwerpen blijven staan). Leeg → `undefined` (byte-identiek aan geen prio's).
 */
export function useCategoriePrioState(rules: PotRulesConfig, subject: PrioSubject) {
  const existing = rules.categoriePrios?.[subject]
  const [enabled, setEnabled] = useState<boolean>(Boolean(existing))
  const [prios, setPrios] = useState<Record<string, number>>(existing ?? DEFAULT_CATEGORIE_PRIOS)

  const changed =
    enabled !== Boolean(existing) ||
    (enabled && JSON.stringify(prios) !== JSON.stringify(existing ?? DEFAULT_CATEGORIE_PRIOS))

  function mergeCategoriePrios(): CategoriePrios | undefined {
    const base: CategoriePrios = { ...(rules.categoriePrios ?? {}) }
    if (enabled) base[subject] = prios
    else delete base[subject]
    return Object.keys(base).length > 0 ? base : undefined
  }

  return { enabled, setEnabled, prios, setPrios, changed, mergeCategoriePrios }
}

function PrioRow({
  categorie,
  value,
  onChange,
}: {
  categorie: string
  value: number
  onChange: (prio: number) => void
}) {
  // Roving tabindex (APG-radiogroup): alleen de geselecteerde knop zit in de
  // tab-volgorde; pijltjestoetsen verplaatsen selectie én focus (met wrap). Refs
  // per knop zodat de handler de nieuw-geselecteerde knop kan focussen.
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = PRIO_VALUES.indexOf(value as (typeof PRIO_VALUES)[number])
  const focusIndex = activeIndex >= 0 ? activeIndex : 0

  function moveTo(nextIndex: number) {
    const wrapped = (nextIndex + PRIO_VALUES.length) % PRIO_VALUES.length
    onChange(PRIO_VALUES[wrapped])
    btnRefs.current[wrapped]?.focus()
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        moveTo(focusIndex + 1)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        moveTo(focusIndex - 1)
        break
      case 'Home':
        e.preventDefault()
        moveTo(0)
        break
      case 'End':
        e.preventDefault()
        moveTo(PRIO_VALUES.length - 1)
        break
    }
  }

  return (
    // flex-wrap: bij weinig breedte zakt de knoppenrij (5 × 44px + 8px-gaps) netjes
    // onder het label i.p.v. te overlopen; de knoppen zelf blijven ≥44px.
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-2)]">{categorie}</span>
      <div
        role="radiogroup"
        aria-label={`Prioriteit voor ${categorie}`}
        onKeyDown={handleKeyDown}
        className="flex shrink-0 items-center gap-2"
      >
        {PRIO_VALUES.map((p, idx) => {
          const active = value === p
          const isReserve = p === 5
          return (
            <button
              key={p}
              ref={(el) => {
                btnRefs.current[idx] = el
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={idx === focusIndex ? 0 : -1}
              aria-label={isReserve ? `${p} (reserve)` : `${p}`}
              onClick={() => onChange(p)}
              className={`flex h-11 w-11 items-center justify-center rounded-lg border text-[13px] font-mono tabular-nums font-semibold transition-colors ${
                active
                  ? isReserve
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--module-active-700)] bg-[var(--module-active-700)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--ink-3)]'
              }`}
            >
              {p}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function CategoriePrioEditor({
  enabled,
  prios,
  onToggle,
  onChange,
}: {
  /** True = prio's sturen (voorrang op de volgorde-UI); false = volgorde-UI stuurt. */
  enabled: boolean
  /** Huidige prio per categorie (alleen relevant wanneer `enabled`). */
  prios: Record<string, number>
  onToggle: (on: boolean) => void
  onChange: (next: Record<string, number>) => void
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <RegelSectionLabel>Prioriteit per categorie</RegelSectionLabel>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
            enabled
              ? 'border-[var(--module-active-700)] text-[var(--ink-2)]'
              : 'border-[var(--border-md)] text-[var(--ink-3)] hover:border-[var(--ink-3)]'
          }`}
        >
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${
              enabled ? 'bg-[var(--module-active-700)]' : 'bg-[var(--border-md)]'
            }`}
          />
          {enabled ? 'Aan' : 'Uit'}
        </button>
      </div>

      {!enabled ? (
        <p className="mt-1 text-[11px] text-[var(--ink-3)] italic leading-snug">
          De volgorde hierboven bepaalt de prioriteit. Zet dit aan voor fijnafstemming: geef
          elke categorie een eigen prioriteit (1–5).
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-[var(--ink-3)] leading-snug">
            Lager = eerder aangesproken. Elke stap weegt dubbel zo zwaar (gewicht ½
            <sup>prio−1</sup>).{' '}
            <span className="font-semibold text-[var(--ink-2)]">5 = reserve</span>: pas
            aanspreken als de rest leeg is.
          </p>
          <div className="mt-3 divide-y divide-[var(--border-ed)] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1">
            {BEZIT_CATEGORIES.map((cat) => (
              <PrioRow
                key={cat}
                categorie={cat}
                value={prios[cat] ?? DEFAULT_CATEGORIE_PRIOS[cat]}
                onChange={(p) => onChange({ ...prios, [cat]: p })}
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-3)] italic leading-snug">
            Zolang dit aan staat, krijgen deze prio&apos;s voorrang op de volgorde hierboven.
          </p>
        </>
      )}
    </div>
  )
}
