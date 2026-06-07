import { formatCurrency } from '@/lib/format'
import { Kicker, ScenarioCallout } from '@/components/editorial'

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'

/**
 * HubStroom (C7) — lichtgewicht stroom bruto → −heffing → netto.
 *
 * Een eenvoudige mini-waterfall met divs (geen zware sankey): één scherpe balk
 * met het heffings-deel als gekleurd segment (amber, Box 1) en het netto-deel
 * als rest (teal — wat overblijft, vrijheid). Eronder drie cijfer-kolommen
 * (bruto / heffing / netto) in Playfair. Bewust geen perspectief: Box 1 is
 * per-persoon en bruto/heffing zijn de Box 1-schatting van de gebruiker zelf.
 *
 * Alleen tonen wanneer bruto bekend is (caller gate: box1 + grossYearly > 0).
 * Server-compatible.
 */

const BOX1_COLOR = '#b45309' // amber — heffing
const NET_COLOR = '#0d9488' // teal — wat overblijft (vrijheid)

export function HubStroom({
  grossYearly,
  box1Tax,
}: {
  /** Bruto-jaarinkomen (Box 1-schatting van de hub). */
  grossYearly: number
  /** Geschatte Box 1-heffing over dat inkomen. */
  box1Tax: number
}) {
  if (grossYearly <= 0 || box1Tax < 0) return null

  const heffing = Math.min(box1Tax, grossYearly)
  const netto = Math.max(0, grossYearly - heffing)
  const heffingPct = grossYearly > 0 ? (heffing / grossYearly) * 100 : 0
  const nettoPct = 100 - heffingPct

  return (
    <article className="bg-[var(--paper)] border border-[var(--border-ed)] p-5 sm:p-6">
      <Kicker>Van bruto naar netto · Box 1</Kicker>

      {/* Mini-waterfall: heffing (amber) + netto (teal) — scherpe randen. */}
      <div
        className="mt-4 flex h-5 w-full overflow-hidden bg-[var(--subtle)] border border-[var(--rule-soft)]"
        role="img"
        aria-label={`Bruto ${formatCurrency(grossYearly)}: heffing ${formatCurrency(
          heffing,
        )}, netto ${formatCurrency(netto)}`}
      >
        <div
          className="h-full"
          style={{ width: `${heffingPct}%`, backgroundColor: BOX1_COLOR }}
          title={`Heffing: ${formatCurrency(heffing)}`}
        />
        <div
          className="h-full"
          style={{ width: `${nettoPct}%`, backgroundColor: NET_COLOR }}
          title={`Netto: ${formatCurrency(netto)}`}
        />
      </div>

      {/* Drie cijfer-kolommen — Playfair, top/bottom rules, mono-kickers. */}
      <div className="mt-5 grid grid-cols-3 border-t border-b border-[var(--ink)]">
        <StroomCol label="Bruto" amount={Math.round(grossYearly)} color="var(--ink)" />
        <StroomCol label="− Heffing" amount={Math.round(heffing)} color={BOX1_COLOR} divider />
        <StroomCol label="Netto" amount={Math.round(netto)} color={NET_COLOR} divider />
      </div>

      <div className="mt-5">
        <ScenarioCallout title="Indicatie, geen advies.">
          {' '}Box 1-schatting per persoon — geen aangifte.
        </ScenarioCallout>
      </div>
    </article>
  )
}

function StroomCol({
  label,
  amount,
  color,
  divider = false,
}: {
  label: string
  amount: number
  color: string
  divider?: boolean
}) {
  return (
    <div className={`p-3 sm:p-4 ${divider ? 'border-l border-[var(--rule-soft)]' : ''}`}>
      <div
        className="text-[10px] uppercase tracking-[0.16em] font-mono"
        style={{ color: color === 'var(--ink)' ? 'var(--ink-3)' : color }}
      >
        {label}
      </div>
      <div
        className="mt-1.5 font-black leading-none tracking-[-0.02em] tabular-nums text-[22px] sm:text-[28px]"
        style={{ fontFamily: PLAYFAIR, color }}
      >
        {formatCurrency(amount)}
      </div>
    </div>
  )
}
