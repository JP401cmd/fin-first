'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import type { CashflowSectionScalars } from '@/lib/cashflow-kpis'
import type { RecurringItem } from './vaste-kosten-analyse'
import type { CancellationMetadata } from '@/lib/cancellation-types'

// ── Sparkline for expense/savings trends ──────────────────────

function MiniSparkline({
  points,
  strokeColor,
  fillColor,
}: {
  points: { month: string; value: number }[]
  strokeColor: string
  fillColor: string
}) {
  if (points.length < 2) return null

  const w = 80
  const h = 24
  const pad = 2
  const vals = points.map((p) => p.value)
  const mn = Math.min(...vals)
  const mx = Math.max(...vals)
  const range = mx - mn || 1

  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - pad * 2)
    const y = h - pad - ((v - mn) / range) * (h - pad * 2)
    return `${x},${y}`
  })

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points={`${pts[0].split(',')[0]},${h} ${pts.join(' ')} ${pts[pts.length - 1].split(',')[0]},${h}`}
        fill={fillColor}
        opacity="0.3"
      />
    </svg>
  )
}

// ── Uitgaventrend: één afleiding, twee formuleringen ──────────
//
// De procentuele delta t.o.v. de vorige maand stond als inline-IIFE in de
// Volledig-tak. Sinds S5 heeft Eenvoudig er een woordelijke variant van nodig;
// die moet op EXACT dezelfde afleiding staan, anders kan de zin ("lager dan
// vorige maand") tegenover het percentage ("+3%") komen te staan. Vandaar één
// helper met twee formatteringen erboven. Pure presentatie over de al
// aangeleverde `expenseHistory` — geen kerngetal, geen tweede grondslag.

function expenseTrendDelta(
  expenseHistory: CashflowSectionScalars['expenseHistory'],
): number | null {
  if (expenseHistory.length < 2) return null
  const curr = expenseHistory[expenseHistory.length - 1].value
  const prev = expenseHistory[expenseHistory.length - 2].value
  return prev > 0 ? ((curr - prev) / prev) * 100 : 0
}

/** Volledig: het percentage. Onder 1% heet dat "stabiel". */
function expenseTrendPct(delta: number): string {
  if (Math.abs(delta) < 1) return 'Stabiel t.o.v. vorige maand'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(0)}% t.o.v. vorige maand`
}

/** Eenvoudig: dezelfde constatering in woorden, zonder percentage. */
function expenseTrendWords(delta: number): string {
  if (Math.abs(delta) < 1) return 'Je uitgaven zijn ongeveer gelijk gebleven aan vorige maand.'
  return delta > 0
    ? 'Je uitgaven lagen hoger dan vorige maand.'
    : 'Je uitgaven lagen lager dan vorige maand.'
}

// ── Section ─────────────────────────────────────────────────────

interface CashflowSectionProps {
  /**
   * Precies de vijf velden die dit component leest — niet de volle
   * `DashboardData`. Het type is structureel, dus een caller die alsnog de hele
   * bundel doorgeeft blijft compileren; de smalle vorm maakt zichtbaar dat de
   * pagina hiervoor geen dashboard-bundel meer hoeft te laden (ADR 0083).
   */
  data: CashflowSectionScalars
  /**
   * Legacy FinLanding-props. De samenvatting rendert alleen op basis van
   * `data`; deze blijven optioneel zodat bestaande callers blijven
   * compileren zonder ze door te geven.
   */
  subscriptions?: RecurringItem[]
  vasteKosten?: RecurringItem[]
  totalMonthlySubscriptions?: number
  totalMonthlyVasteKosten?: number
  totalMonthly?: number
  userProfile?: { full_name: string | null } | null
  loadingRecurring?: boolean
  onCancellationOpen?: (metadata: CancellationMetadata) => void
  onRefresh?: () => Promise<void>
}

/**
 * CashflowSection — compacte cashflow-samenvatting (spaarquote 6m,
 * maandelijks netto, uitgaventrend). Leeft bovenaan de forecast-pagina
 * /overzicht/cashflow/forecast. De vaste-lasten-teaser is bewust verwijderd:
 * die data zit al op /overzicht/cashflow/vaste-lasten.
 *
 * ── WEERGAVEMODUS (S5, release R5) ──────────────────────────────────────────
 * Dit was het enige blok op deze route dat niet modus-bewust was: in Eenvoudig
 * stonden er onverkort drie kale KPI-kaarten — een spaarquote als `%`-getal met
 * voortgangsbalk en sparkline, een netto-split en een `%`-delta. Sinds S5 zegt
 * Eenvoudig hetzelfde in één kaart en in woorden: het maandbedrag blijft (dát
 * is de vraag die de pagina beantwoordt), de twee percentages worden zinnen.
 *
 * Niet mínder, wél begrijpelijker — het richtingsbesluit van R5. Volledig
 * verandert niet.
 *
 * TWEE VENSTERS, EXPLICIET UIT ELKAAR GEHOUDEN (ADR 0073): `monthlyIncome`/
 * `monthlyExpenses` zijn de EFFECTIVE maandcijfers, `savingsRate6m` is een
 * gemiddelde over ZES maanden. In Eenvoudig staan ze in één kaart, dus draagt
 * elke zin zijn eigen venster in de tekst ("per maand" resp. "over de laatste
 * zes maanden"). Ze worden nergens bij elkaar opgeteld.
 */
export function CashflowSection({ data }: CashflowSectionProps) {
  const { monthlyIncome, monthlyExpenses, savingsRate6m, savingsHistory, expenseHistory } = data
  const { mode } = useDisplayMode()
  const monthlyCashflow = monthlyIncome - monthlyExpenses
  const isPositiveCashflow = monthlyCashflow >= 0
  const isPositiveRate = savingsRate6m >= 0
  const trendDelta = expenseTrendDelta(expenseHistory)

  const CashflowIcon = isPositiveCashflow
    ? TrendingUp
    : monthlyCashflow === 0
      ? Minus
      : TrendingDown

  if (mode === 'simple') {
    return (
      <section aria-label="Cashflow-samenvatting">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
            {isPositiveCashflow ? 'Wat je per maand overhoudt' : 'Wat je per maand tekortkomt'}
          </p>
          <div className="mt-1 flex items-center gap-1.5">
            <CashflowIcon
              className={`h-5 w-5 ${isPositiveCashflow ? 'text-positive' : 'text-negative'}`}
              aria-hidden="true"
            />
            <MaskedAmount
              value={Math.abs(monthlyCashflow)}
              signPrefix={isPositiveCashflow ? '+' : '-'}
              className={`font-mono text-2xl font-semibold tabular-nums ${isPositiveCashflow ? 'text-positive' : 'text-negative'}`}
            />
            <span className="text-xs text-[var(--ink-3)]">per maand</span>
          </div>
          {/* Spaarquote in woorden — het percentage blijft staan als maat, maar
              in een zin met zijn eigen venster erbij, niet als kaal getal. */}
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
            {isPositiveRate
              ? `Over de laatste zes maanden hield je gemiddeld ${savingsRate6m.toFixed(0)}% van je inkomen over.`
              : 'Over de laatste zes maanden gaf je gemiddeld meer uit dan er binnenkwam.'}
            {trendDelta != null && ` ${expenseTrendWords(trendDelta)}`}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Cashflow-samenvatting">
      {/* ── Samenvatting: spaarquote + maandelijks netto + uitgaventrend ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Spaarquote card */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Spaarquote <span className="normal-case tracking-normal">(6m)</span>
              </p>
              <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${isPositiveRate ? 'text-positive' : 'text-negative'}`}>
                {savingsRate6m.toFixed(1)}%
              </p>
            </div>
            {savingsHistory.length >= 2 && (
              <MiniSparkline
                points={savingsHistory}
                strokeColor={isPositiveRate ? 'var(--color-positive)' : 'var(--color-negative)'}
                fillColor={isPositiveRate ? 'var(--color-positive)' : 'var(--color-negative)'}
              />
            )}
          </div>
          {/* Mini progress bar */}
          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
            <div
              className={`h-full rounded-full ${isPositiveRate ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: `${Math.min(Math.abs(savingsRate6m), 100)}%` }}
            />
          </div>
        </div>

        {/* Monthly cashflow card */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                Maandelijks netto
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <CashflowIcon className={`h-4 w-4 ${isPositiveCashflow ? 'text-positive' : 'text-negative'}`} />
                <MaskedAmount
                  value={Math.abs(monthlyCashflow)}
                  signPrefix={isPositiveCashflow ? '+' : '-'}
                  className={`font-mono text-lg font-semibold tabular-nums ${isPositiveCashflow ? 'text-positive' : 'text-negative'}`}
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--ink-3)]">
            <span>Inkomen: <MaskedAmount value={monthlyIncome} className="font-mono tabular-nums" /></span>
            <span>Uitgaven: <MaskedAmount value={monthlyExpenses} className="font-mono tabular-nums" /></span>
          </div>
        </div>

        {/* Expense trend card */}
        {expenseHistory.length >= 2 && (
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
                  Uitgaventrend
                </p>
                <MaskedAmount
                  value={expenseHistory[expenseHistory.length - 1].value}
                  className="mt-1 font-mono text-lg font-semibold tabular-nums text-[var(--ink)]"
                />
              </div>
              <MiniSparkline
                points={expenseHistory}
                strokeColor="var(--color-expense-500)"
                fillColor="var(--color-expense-200)"
              />
            </div>
            {trendDelta != null && (
              <p className="mt-2 text-[11px] text-[var(--ink-3)]">
                {expenseTrendPct(trendDelta)}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
