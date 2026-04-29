'use client'

/**
 * `VacancyTimeline` — visuele weergave van bezetting per maand. Twaalf
 * vlakken in een rij, één per maand: gevuld bij bezet, gestreept bij
 * leegstand, doorzichtig bij ontbrekende data.
 *
 * Transparantie:
 *  - "X van 24 maanden gelogd" subtekst altijd zichtbaar — de gebruiker
 *    weet hoeveel data er onder de visualisatie ligt.
 *  - Bij <12 maanden gelogd: tip-strip met aanmoediging om door te loggen.
 *    Drempel van 12 mnd is bewust hetzelfde als de visualisatie-window;
 *    ondergedrempel toon je nog geen "betrouwbaar percentage", boven de
 *    drempel begint het cijfer informatief te worden.
 *
 * Percentage:
 *  - Berekend over alle gelogde entries (max 24, conform de rolling window
 *    in de DB-migratie). Bij 0 entries geen percentage tonen.
 *  - We presenteren als bezettings-percentage (`occupied / total`) — meer
 *    intuïtief dan "leegstands-percentage".
 *
 * Animatie:
 *  - `useInViewAnimation` — vlakken fade-in met 60ms stagger per maand.
 */

import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

// ── Types ────────────────────────────────────────────────────

interface VacancyEntry {
  month: string // YYYY-MM
  occupied: boolean
}

type CellState = 'occupied' | 'vacant' | 'unknown'

interface CellData {
  /** Korte maand-label voor onder de cel: "jan", "feb", …. */
  label: string
  /** YYYY-MM voor lookup en accessibility. */
  month: string
  state: CellState
}

interface VacancyTimelineProps {
  /** Het volledige vacancy-log (max 24 entries) — uit `Asset.vacancy_log`. */
  vacancyLog: VacancyEntry[]
}

// ── Constants ────────────────────────────────────────────────

/** Aantal maanden in de visualisatie. Plan-keuze: 12 mnd in beeld, 24 mnd opgeslagen. */
const TIMELINE_MONTHS = 12

/** Drempel waaronder we de gebruiker aanmoedigen door te loggen. */
const RELIABILITY_THRESHOLD = 12

/** Max-window in de database (rolling). Plan-keuze: 24 mnd opgeslagen. */
const MAX_LOGGED_MONTHS = 24

// ── Component ────────────────────────────────────────────────

export function VacancyTimeline({ vacancyLog }: VacancyTimelineProps) {
  const cells = useMemo(() => buildCells(vacancyLog), [vacancyLog])
  const { ref, hasEntered } = useInViewAnimation({
    duration: TIMELINE_MONTHS * 60 + 240,
  })

  // Aggregaties op het volledige log (max 24), niet alleen op de 12-maands
  // weergave — zo blijft de subtekst representatief voor wat de gebruiker
  // werkelijk heeft gelogd.
  const totalLogged = vacancyLog.length
  const occupiedCount = vacancyLog.filter((e) => e.occupied).length
  const occupancyPct =
    totalLogged > 0 ? Math.round((occupiedCount / totalLogged) * 100) : null
  const showReliabilityTip = totalLogged > 0 && totalLogged < RELIABILITY_THRESHOLD

  return (
    <section ref={ref} className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Bezetting laatste 12 maanden
          </p>
          <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-3)]">
            {totalLogged === 0
              ? 'Nog geen leegstand-data gelogd.'
              : occupancyPct !== null
                ? `Bezet in ${occupancyPct}% van de gelogde maanden.`
                : ''}
          </p>
        </div>
        <p className="font-mono tabular-nums text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
          {totalLogged} van {MAX_LOGGED_MONTHS} maanden gelogd
        </p>
      </header>

      {/* Twaalf vlakken in één rij. We gebruiken `grid-cols-12` zodat ze
          gelijk verdelen over de breedte. Op mobile blijven ze leesbaar
          dankzij de subtiele vorm + onder-label. */}
      <div className="grid grid-cols-12 gap-1.5">
        {cells.map((cell, idx) => (
          <Cell
            key={cell.month}
            cell={cell}
            index={idx}
            hasEntered={hasEntered}
          />
        ))}
      </div>

      {/* Reliability tip — alleen zichtbaar onder de drempel. We tonen geen
          tip wanneer er 0 maanden zijn gelogd; dan staat de "nog geen data"-
          melding al in de header. */}
      {showReliabilityTip && (
        <div
          role="note"
          className="flex items-start gap-2 border-l-2 border-kern-300 bg-[var(--subtle)]/40 px-3 py-2 text-[11px] leading-relaxed text-[var(--ink-2)]"
        >
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" aria-hidden="true" />
          <span>
            Log nog{' '}
            <span className="font-mono tabular-nums text-[var(--ink)]">
              {RELIABILITY_THRESHOLD - totalLogged}
            </span>{' '}
            maand{RELIABILITY_THRESHOLD - totalLogged === 1 ? '' : 'en'} om een
            betrouwbaar bezetting-percentage te zien.
          </span>
        </div>
      )}
    </section>
  )
}

// ── Cell ─────────────────────────────────────────────────────

interface CellProps {
  cell: CellData
  index: number
  hasEntered: boolean
}

function Cell({ cell, index, hasEntered }: CellProps) {
  // Drie visuele talen — bewust geen kleur als signaal:
  //  - occupied: gevuld kern-700
  //  - vacant: licht (kern-100) met diagonale streep-pattern via SVG
  //  - unknown: dashed border, geen vulling — "geen data"
  const isOccupied = cell.state === 'occupied'
  const isVacant = cell.state === 'vacant'
  const isUnknown = cell.state === 'unknown'

  const ariaLabel =
    cell.state === 'occupied'
      ? `${cell.month}: bezet`
      : cell.state === 'vacant'
        ? `${cell.month}: leegstand`
        : `${cell.month}: nog niet gelogd`

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role="img"
        aria-label={ariaLabel}
        className={[
          'relative h-10 w-full overflow-hidden border transition-opacity',
          isOccupied
            ? 'border-kern-700'
            : isVacant
              ? 'border-kern-300'
              : 'border-dashed border-[var(--border-ed)]',
        ].join(' ')}
        style={{
          backgroundColor: isOccupied
            ? 'oklch(0.345 0.0571 34.7)' // kern-700, gevuld
            : isVacant
              ? 'oklch(0.95 0.0058 34.7)' // kern-100, licht
              : 'transparent',
          opacity: hasEntered ? 1 : 0,
          transform: hasEntered ? 'translateY(0)' : 'translateY(4px)',
          transition: `opacity 240ms cubic-bezier(.22,1,.36,1) ${index * 60}ms, transform 240ms cubic-bezier(.22,1,.36,1) ${index * 60}ms`,
        }}
      >
        {/* Vacant: diagonale streep-pattern via SVG. We tekenen alleen wanneer
            de cel zichtbaar is (`isVacant`) zodat we geen onnodige DOM-bagage
            hebben voor occupied/unknown cellen. */}
        {isVacant && (
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            viewBox="0 0 10 10"
          >
            <defs>
              <pattern
                id={`vacancy-stripe-${cell.month}`}
                patternUnits="userSpaceOnUse"
                width="3"
                height="3"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="3"
                  stroke="oklch(0.666 0.0311 34.7)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="10" height="10" fill={`url(#vacancy-stripe-${cell.month})`} />
          </svg>
        )}
      </div>
      <span
        className={[
          'text-[9px] font-mono tabular-nums tracking-tight',
          isUnknown ? 'text-[var(--ink-4)]' : 'text-[var(--ink-3)]',
        ].join(' ')}
      >
        {cell.label}
      </span>
    </div>
  )
}

// ── Cell builder ─────────────────────────────────────────────

const NL_MONTH_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
] as const

/**
 * Bouw 12 maand-cellen vanaf "11 maanden geleden" t/m "deze maand". Voor
 * elke maand zoeken we de vacancy-log op via "YYYY-MM"; ontbrekende
 * entries krijgen state `unknown`.
 */
function buildCells(vacancyLog: VacancyEntry[]): CellData[] {
  const lookup = new Map<string, boolean>()
  for (const entry of vacancyLog) {
    if (typeof entry.month === 'string' && typeof entry.occupied === 'boolean') {
      lookup.set(entry.month, entry.occupied)
    }
  }

  const cells: CellData[] = []
  const now = new Date()
  for (let i = TIMELINE_MONTHS - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const yyyymm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const logged = lookup.get(yyyymm)
    const state: CellState =
      logged === undefined ? 'unknown' : logged ? 'occupied' : 'vacant'
    cells.push({
      label: NL_MONTH_SHORT[date.getMonth()],
      month: yyyymm,
      state,
    })
  }
  return cells
}
