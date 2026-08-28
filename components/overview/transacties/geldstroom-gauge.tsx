'use client'

import { useEffect, useState } from 'react'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { FlowDescription, FlowSummary } from '@/lib/transaction-insights'

/**
 * GeldstroomGauge — compacte halfronde naald-meter voor de **spaarquote**,
 * geschaald van −100% (links, rood — meer uit dan in) via 0% (midden, amber)
 * naar +100% (rechts, groen — alles gespaard). De naald volgt de spaarquote
 * (geclampt op [−100, +100]); de waarde staat als centrale leeswaarde. Daaronder
 * een compacte Inkomen/Uitgaven/Saldo-stack zodat de kaart in een smalle (1/3)
 * kolom past.
 *
 * Stijl (Editorial Finance): ingetogen palet uit onze income/expense/horizon-
 * tokens; dunne naald in inkt-kleur; Playfair-leeswaarde.
 *
 * Presentational: enkel een `FlowSummary` in. Bij geen activiteit rendert niets.
 */

const PLAYFAIR = 'var(--font-playfair, Georgia, serif)'
const SOURCE_SERIF = 'var(--font-source-serif, Georgia, serif)'

// Geometrie van de halve boog (viewBox 0 0 200 118).
const CX = 100
const CY = 96
const R = 78
const BAND = 13

// 5 boog-segmenten, links→rechts: donkerrood → rood → amber → groen → donkergroen.
const SEGMENT_COLORS = [
  'var(--color-expense-600)',
  'var(--color-expense-400)',
  'var(--color-horizon-400)',
  'var(--color-income-500)',
  'var(--color-income-600)',
]

function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const a = (angleDeg * Math.PI) / 180
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) }
}

/** Boog van startDeg naar endDeg (180°=links … 0°=rechts), over de bovenkant. */
function arcPath(startDeg: number, endDeg: number, radius: number): string {
  const s = polar(startDeg, radius)
  const e = polar(endDeg, radius)
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

/**
 * Duiding onder de leeswaarde. Valt de quote BUITEN de schaal van de meter
 * (−100…+100), dan zegt het label dat er ook bij: de naald staat dan tegen de
 * aanslag en zou anders een precisie suggereren die de meter niet heeft.
 * Aanleiding: een halve maand (vaste lasten al afgeschreven, salaris nog niet
 * binnen) leverde −265 % op een −100…+100-meter (bevinding C6). Het cijfer zelf
 * wordt NIET afgekapt — alleen de aflezing benoemt haar eigen grens.
 */
function savingsRateLabel(rate: number): string {
  if (rate < -100) return 'negatief · buiten schaal'
  if (rate < 0) return 'negatief'
  if (rate > 100) return 'sterk · buiten schaal'
  if (rate >= 30) return 'sterk'
  if (rate >= 15) return 'gezond'
  return 'laag'
}

export function GeldstroomGauge({
  summary,
  windowLabel,
}: {
  summary: FlowSummary
  /**
   * Het venster waarover deze meter leest — "augustus tot nu toe", "juli 2026".
   * Rendert als onderschrift onder de leeswaarde (S3).
   *
   * WAAROM DIT ERBIJ MOET. De status-melding bovenaan deze route draait op de
   * GEREALISEERDE kalendermaand, deze meter op het gekozen periodevenster
   * (standaard 30 dagen rollend). Die twee kunnen elkaar op hetzelfde scherm
   * tegenspreken — melding "tekort deze maand", meter +22% — en alleen de
   * melding benoemde haar venster. Op de cashflow-hub is dat al opgelost met
   * `kpiWindow` (CF-3); dit is dezelfde ingreep hier. Het label komt uit
   * `flowWindowLabel`, dat voor de lopende maand `currentMonthWindowLabel`
   * hergebruikt — één formulering, geen drift tussen hub en detailpagina.
   */
  windowLabel?: string
}) {
  const { income, expense, net, savingsRate } = summary

  // Naald: spaarquote geclampt op [−100, +100] → fractie 0..1 (−100=links, +100=rechts).
  const clamped = Math.max(-100, Math.min(100, savingsRate))
  const targetFraction = (clamped + 100) / 200

  const [fraction, setFraction] = useState(0.5)
  useEffect(() => {
    let raf = 0
    let startTs = 0
    const from = 0.5
    const duration = 700
    const tick = (ts: number) => {
      if (!startTs) startTs = ts
      const t = Math.min(1, (ts - startTs) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setFraction(from + (targetFraction - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetFraction])

  if (income === 0 && expense === 0) {
    return null
  }

  const needleAngle = 180 - fraction * 180
  const tip = polar(needleAngle, R - 16)

  return (
    <div className="space-y-3">
      {/* Halfronde naald-meter */}
      <div className="mx-auto w-full" style={{ maxWidth: 200 }}>
        <svg
          viewBox="0 0 200 118"
          className="h-auto w-full"
          role="img"
          aria-label={`Spaarquote ${savingsRate}% (schaal −100% tot +100%)`}
        >
          {SEGMENT_COLORS.map((color, i) => {
            const start = 180 - 36 * i
            const end = 180 - 36 * (i + 1)
            return (
              <path
                key={i}
                d={arcPath(start, end, R)}
                fill="none"
                stroke={color}
                strokeWidth={BAND}
                strokeLinecap="butt"
              />
            )
          })}

          {/* Naald + hub */}
          <line
            x1={CX}
            y1={CY}
            x2={tip.x.toFixed(2)}
            y2={tip.y.toFixed(2)}
            stroke="var(--ink)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={6} fill="var(--ink)" />
          <circle cx={CX} cy={CY} r={2.5} fill="var(--paper)" />

          {/* Schaal-uiteinden */}
          <text
            x={CX - R - BAND / 2}
            y={CY + 15}
            textAnchor="start"
            className="font-mono"
            style={{ fontSize: 8.5, letterSpacing: '0.04em', fill: 'var(--color-expense-600)' }}
          >
            −100%
          </text>
          <text
            x={CX + R + BAND / 2}
            y={CY + 15}
            textAnchor="end"
            className="font-mono"
            style={{ fontSize: 8.5, letterSpacing: '0.04em', fill: 'var(--color-income-600)' }}
          >
            +100%
          </text>
        </svg>

        {/* Leeswaarde: spaarquote */}
        <div className="-mt-1 text-center">
          <div
            className="text-[22px] font-black leading-none tabular-nums text-[var(--ink)]"
            style={{ fontFamily: PLAYFAIR }}
          >
            {savingsRate}%
          </div>
          <div
            className="mt-0.5 text-[11px] italic text-[var(--ink-3)]"
            style={{ fontFamily: SOURCE_SERIF }}
          >
            spaarquote · {savingsRateLabel(savingsRate)}
          </div>
          {windowLabel && (
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
              {windowLabel}
            </div>
          )}
        </div>
      </div>

      {/* Inkomen/Uitgaven/Saldo als compacte horizontale balk (3-up) — minder
          verticale ruimte dan een stack. */}
      <div className="grid grid-cols-3 border-t border-b border-[var(--border-ed)] text-center">
        <KpiCell label="Inkomen" tone="positive">
          <MaskedAmount value={income} tone="inherit" decimals />
        </KpiCell>
        <KpiCell label="Uitgaven" tone="negative">
          <MaskedAmount value={expense} tone="inherit" decimals />
        </KpiCell>
        <KpiCell label="Saldo" tone={net >= 0 ? 'positive' : 'negative'}>
          <MaskedAmount value={net} tone="inherit" decimals signPrefix={net > 0 ? '+' : ''} />
        </KpiCell>
      </div>
    </div>
  )
}

/**
 * GeldstroomZin — wat de `GeldstroomGauge` toont, maar dan als zin. De
 * Eenvoudig-tegenhanger van de meter (S3, release R5: *duiding boven
 * reductie*).
 *
 * WAAROM EEN ZUSJE EN GEEN VARIANT-PROP: de meter blijft daarmee zuiver
 * presentational en de modus-keuze staat op de call-site, zichtbaar naast de
 * andere modus-keuzes van die pagina. Zelfde patroon als CF-3 op de
 * cashflow-hub.
 *
 * De 3-up Inkomen/Uitgaven/Saldo-strip eronder is LETTERLIJK dezelfde als in de
 * meter (zelfde `KpiCell`): Eenvoudig verliest de naald, niet de cijfers.
 *
 * ── Wat deze zinnen wel en niet doen ────────────────────────────────────────
 * WAARNEMING, GEEN VOORSPELLING. "Er is nog niets binnengekomen" beschrijft wat
 * er in de data staat. Er staat nergens dat er nog salaris kómt — die projectie
 * bestaat niet in de app, en beloven wat je niet kunt waarmaken is precies wat
 * de Wft-grens verbiedt.
 *
 * GEEN OORDEEL OVER EEN HALVE PERIODE. Zolang het venster loopt toont deze zin
 * géén spaarquote: een quote over een halve maand (vaste lasten er al af,
 * salaris nog niet binnen) is het valse oordeel waar deze kaart om begon. Bij
 * een afgesloten venster mag het cijfer wél — daar is het een eindstand.
 *
 * GEEN TIJD-METAFOOR. Bewust geen "€X = Y dagen vrijheid" aan deze zin: dat is
 * een tweede tijdvertaling bovenop een uitgaven-dagtarief, en dat is precies
 * bevinding C5. De vrijheidstijd-vertaling van deze pagina hoort elders.
 *
 * PRIVACY: elk bedrag loopt door `<MaskedAmount>`. Daarom levert `describeFlow`
 * getallen en geen kant-en-klare string — een `formatCurrency` in platte tekst
 * zou dwars door de privacy-modus heen lekken.
 */
export function GeldstroomZin({
  description,
  summary,
}: {
  description: FlowDescription
  summary: FlowSummary
}) {
  const { kind, windowLabel, income, expense, net, savingsRate, prevIncome } = description

  // De lege staat heeft zijn eigen regel op de call-site (ongewijzigd), zodat
  // beide modi daar hetzelfde zeggen.
  if (kind === 'empty') return null

  const bedrag = (value: number, tone: 'positive' | 'negative' | 'ink' = 'ink') => (
    <MaskedAmount
      value={value}
      tone="inherit"
      className={
        tone === 'positive'
          ? 'font-medium text-[var(--color-income-700)]'
          : tone === 'negative'
            ? 'font-medium text-[var(--color-expense-600)]'
            : 'font-medium text-[var(--ink)]'
      }
    />
  )

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-[var(--ink-2)]">
        <span className="text-[var(--ink-3)]">{windowLabel}: </span>
        {kind === 'no-income-yet' ? (
          <>
            {bedrag(expense, 'negative')} uitgegeven. Er is nog niets binnengekomen.
            {prevIncome != null && (
              <> Vorige periode kwam er {bedrag(prevIncome, 'positive')} binnen.</>
            )}
          </>
        ) : kind === 'running' ? (
          <>
            {bedrag(income, 'positive')} binnen, {bedrag(expense, 'negative')} uit —{' '}
            {net >= 0 ? (
              <>{bedrag(net, 'positive')} over.</>
            ) : (
              <>{bedrag(Math.abs(net), 'negative')} meer uit dan in.</>
            )}{' '}
            Deze periode loopt nog.
          </>
        ) : (
          <>
            {bedrag(income, 'positive')} binnen, {bedrag(expense, 'negative')} uit —{' '}
            {net >= 0 ? (
              <>je hield {bedrag(net, 'positive')} over.</>
            ) : (
              <>je gaf {bedrag(Math.abs(net), 'negative')} meer uit dan er binnenkwam.</>
            )}
            {savingsRate != null && net >= 0 && (
              <> Dat is {savingsRate}% van wat er binnenkwam.</>
            )}
          </>
        )}
      </p>

      <div className="grid grid-cols-3 border-t border-b border-[var(--border-ed)] text-center">
        <KpiCell label="Inkomen" tone="positive">
          <MaskedAmount value={summary.income} tone="inherit" decimals />
        </KpiCell>
        <KpiCell label="Uitgaven" tone="negative">
          <MaskedAmount value={summary.expense} tone="inherit" decimals />
        </KpiCell>
        <KpiCell label="Saldo" tone={summary.net >= 0 ? 'positive' : 'negative'}>
          <MaskedAmount
            value={summary.net}
            tone="inherit"
            decimals
            signPrefix={summary.net > 0 ? '+' : ''}
          />
        </KpiCell>
      </div>
    </div>
  )
}

function KpiCell({
  label,
  tone,
  children,
}: {
  label: string
  tone: 'positive' | 'negative'
  children: React.ReactNode
}) {
  const valueColor =
    tone === 'positive' ? 'text-[var(--color-income-700)]' : 'text-[var(--color-expense-600)]'
  return (
    <div className="border-r border-[var(--border-ed)] px-1 py-2 last:border-r-0">
      <div className="text-[9px] font-mono uppercase tracking-[0.1em] text-[var(--ink-3)]">
        {label}
      </div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold tabular-nums ${valueColor}`}>
        {children}
      </div>
    </div>
  )
}
