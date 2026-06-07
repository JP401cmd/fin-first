'use client'

import { useMemo, useRef, useState } from 'react'
import { Kicker } from '@/components/editorial'
import { formatCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  spendByDay,
  buildHeatmapWeeks,
  type AnalysisTransaction,
} from '@/lib/transaction-insights'

/**
 * UitgavenHeatmap — GitHub-contribution-stijl kalender van dagelijkse uitgaven
 * ("Uitgaven-intensiteit"). Kolommen = weken (ma…zo), 7 cellen per kolom; de
 * kleur-intensiteit weerspiegelt het uitgavenbedrag op die dag.
 *
 * Presentational: rekent enkel `spendByDay` + `buildHeatmapWeeks` over de input,
 * doet GEEN data-fetching. De orchestrator wraps dit in een card.
 *
 * Hover levert een zwevend info-menu (datum, bedrag, aantal transacties) i.p.v.
 * een native title-tooltip. Privacy: respecteert `useMaskedAmounts()` — bij
 * gemaskeerde bedragen toont het menu enkel datum + aantal (de kleur blijft,
 * want intensiteit is relatief, geen absoluut bedrag).
 */

// Cel-afmetingen — moeten één bron van waarheid zijn zodat de maand-label-rij
// exact uitlijnt op de week-kolommen (één label-slot per kolom).
const CELL_PX = 11
const GAP_PX = 2

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]
const NL_WEEKDAY_ABBR = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'] // index = Date.getDay()

/** Eén expense-ramp van licht → donker; index = intensiteitsniveau (1…4). */
const LEVEL_FILL = [
  'var(--subtle)', // level 0 — krijgt extra inset border (zie cel-render)
  'var(--color-expense-200)',
  'var(--color-expense-400)',
  'var(--color-expense-500)',
  'var(--color-expense-600)',
] as const

const LEVEL_LABEL = ['geen', 'weinig', 'gemiddeld', 'veel', 'zeer veel'] as const

/**
 * Bereken de 25/50/75-percentiel-drempels van de NIET-nul dagbedragen. Deze
 * drempels delen de actieve uitgaven-dagen in vier even grote intensiteit-
 * groepen — robuuster dan een lineaire min/max-schaal die door één uitschieter
 * zou worden gedomineerd.
 */
function computeQuartileThresholds(
  nonzero: number[],
): { q25: number; q50: number; q75: number } {
  if (nonzero.length === 0) return { q25: 0, q50: 0, q75: 0 }
  const sorted = [...nonzero].sort((a, b) => a - b)
  // Nearest-rank percentiel: index = ceil(p * n) - 1, geclamp in [0, n-1].
  const at = (p: number) => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
    return sorted[idx]
  }
  return { q25: at(0.25), q50: at(0.5), q75: at(0.75) }
}

/** "wo 5 mrt 2026" — lokaal geparsed uit ISO (geen UTC-drift). */
function formatTooltipDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  const wd = NL_WEEKDAY_ABBR[new Date(y, m - 1, d).getDay()]
  return `${wd} ${d} ${NL_MONTH_ABBR[m - 1]} ${y}`
}

type Hovered = { date: string; amount: number; count: number; level: number; x: number; y: number }

export function UitgavenHeatmap(props: {
  transactions: AnalysisTransaction[]
  start: string
  end: string
  /** Klik op een dag-cel → dagweergave van de transacties. */
  onSelectDay?: (date: string) => void
}) {
  const { transactions, start, end, onSelectDay } = props
  const { masked } = useMaskedAmounts()

  const rootRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<Hovered | null>(null)

  // Dag-aggregaat + rooster zijn puur afgeleid; memoiseer op de inputs zodat
  // herverven (bv. privacy-toggle) de zware berekening niet herhaalt.
  const daily = useMemo(() => spendByDay(transactions), [transactions])
  const { weeks, monthLabels } = useMemo(
    () => buildHeatmapWeeks(start, end, daily),
    [start, end, daily],
  )

  // Aantal uitgave-transacties per dag (voor het info-menu).
  const countByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) {
      if (t.transaction_type === 'transfer') continue
      if (!(t.amount < 0)) continue
      m.set(t.date, (m.get(t.date) ?? 0) + 1)
    }
    return m
  }, [transactions])

  // Drempels uit de niet-nul dagbedragen; bepaalt het intensiteitsniveau (1…4).
  const thresholds = useMemo(() => {
    const nonzero: number[] = []
    for (const amount of daily.values()) {
      if (amount > 0) nonzero.push(amount)
    }
    return computeQuartileThresholds(nonzero)
  }, [daily])

  // Snelle opzoek-map: kolomindex → maand-afkorting (enkel waar een maand begint).
  const labelByCol = useMemo(() => {
    const m = new Map<number, string>()
    for (const { col, label } of monthLabels) m.set(col, label)
    return m
  }, [monthLabels])

  /** amount<=0 → 0; <=q25 → 1; <=q50 → 2; <=q75 → 3; else 4. */
  function level(amount: number): number {
    if (amount <= 0) return 0
    if (amount <= thresholds.q25) return 1
    if (amount <= thresholds.q50) return 2
    if (amount <= thresholds.q75) return 3
    return 4
  }

  function handleCellMove(e: React.MouseEvent, date: string, amount: number, lvl: number) {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    setHovered({
      date,
      amount,
      count: countByDay.get(date) ?? 0,
      level: lvl,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <div ref={rootRef} className="relative space-y-2.5">
      <div className="space-y-1">
        <Kicker>Uitgaven-intensiteit</Kicker>
        <p className="text-xs text-[var(--ink-3)]">bedrag per dag · laatste 12 maanden</p>
      </div>

      {/* Responsief: kolommen/cellen schalen mee zodat het rooster de volledige
          breedte vult en zonder horizontale scroll past. */}
      <div className="w-full">
        <div
          role="img"
          aria-label="Uitgaven-intensiteit per dag, laatste 12 maanden"
          className="w-full"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Maand-label-rij: één flex-slot per week-kolom (gelijke breedte),
              label enkel op kolommen waar een nieuwe maand begint. */}
          <div className="flex" style={{ gap: GAP_PX }} aria-hidden>
            {weeks.map((_, col) => (
              <span
                key={col}
                className="min-w-0 flex-1 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--ink-3)]"
                style={{ marginBottom: GAP_PX }}
              >
                {labelByCol.get(col) ?? ''}
              </span>
            ))}
          </div>

          {/* Rooster: horizontale flex van week-kolommen (flex-1 → schalen mee);
              elke kolom een verticale stack van 7 dag-cellen (ma…zo). */}
          <div className="flex" style={{ gap: GAP_PX }}>
            {weeks.map((column, col) => (
              <div key={col} className="flex min-w-0 flex-1 flex-col" style={{ gap: GAP_PX }}>
                {column.map((cell, row) => {
                  // Opvul-cel buiten [start, end]: transparante placeholder die
                  // de rooster-uitlijning bewaart zonder visueel ruis.
                  if (cell.date === null) {
                    return (
                      <div
                        key={row}
                        aria-hidden
                        className="w-full"
                        style={{ aspectRatio: '1 / 1' }}
                      />
                    )
                  }

                  const lvl = level(cell.amount)
                  const isHovered = hovered?.date === cell.date
                  const cellDate = cell.date
                  return (
                    <div
                      key={row}
                      role={onSelectDay ? 'button' : undefined}
                      tabIndex={onSelectDay ? 0 : undefined}
                      aria-label={onSelectDay ? `Bekijk ${formatTooltipDate(cellDate)}` : undefined}
                      className="w-full"
                      onMouseMove={(e) => handleCellMove(e, cellDate, cell.amount, lvl)}
                      onClick={onSelectDay ? () => onSelectDay(cellDate) : undefined}
                      onKeyDown={
                        onSelectDay
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onSelectDay(cellDate)
                              }
                            }
                          : undefined
                      }
                      style={{
                        aspectRatio: '1 / 1',
                        backgroundColor: LEVEL_FILL[lvl],
                        // Level 0 krijgt een subtiele inset-border zodat lege
                        // dagen leesbaar blijven op de paper-achtergrond.
                        boxShadow:
                          lvl === 0 ? 'inset 0 0 0 1px var(--border-ed)' : undefined,
                        outline: isHovered ? '1.5px solid var(--ink)' : undefined,
                        cursor: onSelectDay ? 'pointer' : undefined,
                      }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda rechtsonder: minder → 5 niveau-kleuren → meer. */}
      <div className="flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
        <span>minder</span>
        <div className="flex items-center" style={{ gap: GAP_PX }}>
          {LEVEL_FILL.map((fill, lvl) => (
            <div
              key={lvl}
              aria-hidden
              style={{
                width: CELL_PX,
                height: CELL_PX,
                backgroundColor: fill,
                boxShadow:
                  lvl === 0 ? 'inset 0 0 0 1px var(--border-ed)' : undefined,
              }}
            />
          ))}
        </div>
        <span>meer</span>
      </div>

      {/* Zwevend info-menu */}
      {hovered && (
        <div
          className="pointer-events-none absolute z-20 whitespace-nowrap border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 shadow-[var(--s2)]"
          style={{
            left: hovered.x,
            top: hovered.y,
            transform: 'translate(-50%, calc(-100% - 10px))',
          }}
        >
          <div className="text-[11px] font-semibold capitalize text-[var(--ink)]">
            {formatTooltipDate(hovered.date)}
          </div>
          <div className="mt-0.5 font-mono text-sm tabular-nums">
            {hovered.amount > 0 ? (
              <span className="font-semibold text-[var(--color-expense-600)]">
                {masked ? '•••' : formatCurrency(hovered.amount)}
              </span>
            ) : (
              <span className="text-[var(--ink-3)]">geen uitgaven</span>
            )}
          </div>
          {hovered.count > 0 && (
            <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
              {hovered.count} transactie{hovered.count === 1 ? '' : 's'} · {LEVEL_LABEL[hovered.level]}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
