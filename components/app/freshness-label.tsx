/**
 * FreshnessLabel — inline data-freshness indicator in krant-stijl.
 *
 * Design bible: `.claude/commands/ui-ux.md`
 * - "Trust & veiligheid (fintech-specifiek)": elk saldo/chart krijgt een
 *   data-freshness label in krant-stijl ("Bijgewerkt om HH:mm"). Stale-state
 *   moet zichtbaar gemarkeerd worden.
 * - "Consistentie": tijdnotatie is HH:mm vandaag, d MMM dit jaar, d MMM yyyy
 *   ouder. NOOIT relatieve tijden ("2 min geleden") — die doorbreken de
 *   krant-esthetiek.
 *
 * Bewuste afwijking van `formatTimestamp` in `lib/format.ts`: die helper
 * introduceert een tussenvorm "ma 13:30" voor de afgelopen 7 dagen. Deze
 * component houdt zich strikt aan het drie-treden-spec (vandaag / dit jaar /
 * ouder) zodat het label als herkenbare data-freshness signalering leesbaar
 * blijft naast metric-waarden.
 *
 * Gebruik: plaats direct naast of onder een metric-waarde. Geen border, geen
 * achtergrond — het label is puur typografisch.
 */

import type { CSSProperties } from 'react'

const NL_MONTH_ABBR = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

export interface FreshnessLabelProps {
  /** Last-updated timestamp. `null` renders "Nog niet bijgewerkt". */
  timestamp: Date | string | null
  /**
   * Freshness budget in minutes. When the timestamp is older than this, the
   * kicker "VEROUDERD" is rendered before the formatted time.
   * Default: 60 (one hour — passend voor dashboards en widgets).
   */
  budgetMinutes?: number
  /**
   * Prefix voor het tijdsdeel. "Bijgewerkt om" bij tijd-alleen weergave,
   * of een andere label (bv. "Laatste check") indien gewenst.
   * Default: "Bijgewerkt om".
   */
  prefix?: string
}

/** Two-digit padding — small helper to avoid pulling in a lib. */
function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Format a valid Date according to the three-tiered newspaper rule.
 * Caller guarantees the date is valid.
 */
function formatFresh(d: Date, now: Date): string {
  const isSameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()

  if (isSameDay) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  // Same calendar year → "d MMM"
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${NL_MONTH_ABBR[d.getMonth()]}`
  }

  // Older → "d MMM yyyy"
  return `${d.getDate()} ${NL_MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`
}

/**
 * Coerce the incoming timestamp to a Date, or `null` if invalid / missing.
 * Strings are expected to be ISO-like; anything else returning NaN is treated
 * as absent data rather than throwing — a freshness label should never crash
 * a render.
 */
function coerce(timestamp: Date | string | null): Date | null {
  if (timestamp == null) return null
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp)
  return isNaN(d.getTime()) ? null : d
}

// Shared typographic token — 10-11px kicker per design bible.
const KICKER_STYLE: CSSProperties = {
  letterSpacing: '0.08em',
}

export function FreshnessLabel({
  timestamp,
  budgetMinutes = 60,
  prefix = 'Bijgewerkt om',
}: FreshnessLabelProps): React.ReactElement {
  // `null` / unparseable timestamps render the empty-state copy in the same
  // typographic slot so layouts don't shift when data arrives.
  const d = coerce(timestamp)
  if (d == null) {
    return (
      <span className="text-[11px] text-[var(--ink-3)] font-mono tabular-nums">
        Nog niet bijgewerkt
      </span>
    )
  }

  const now = new Date()
  const ageMs = now.getTime() - d.getTime()
  // Treat future timestamps as fresh — clock-skew shouldn't trigger a stale
  // flag. Only explicit overshoot past the budget counts.
  const isStale = ageMs > budgetMinutes * 60_000

  const formatted = formatFresh(d, now)

  return (
    <span className="inline-flex items-baseline gap-1.5 text-[11px] text-[var(--ink-3)]">
      {isStale && (
        <span
          className="font-[var(--font-inter)] uppercase text-[10px] text-[var(--ink-4)]"
          style={KICKER_STYLE}
        >
          VEROUDERD
        </span>
      )}
      <span className="font-mono tabular-nums">
        {prefix} {formatted}
      </span>
    </span>
  )
}
