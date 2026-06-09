'use client'

import { memo, useState, useEffect } from 'react'
import { Briefcase, AlertCircle } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { AnalysisSection } from '../analysis-section'
import { InfoTooltip } from '@/components/overview/belasting/info-tooltip'
import { BOX3_DRAG } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { TransitionScenario } from '@/components/app/horizon/phase-modal-overgang'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeeltijdwerkImpactProps {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyExpenses: number
  expectedReturn: number
  inflationRate: number
  transitionScenario: TransitionScenario
  /** Current monthly income (full-time equivalent) for scaling part-time scenarios */
  monthlyIncome?: number
  /** Annual AOW income — in shortfall it covers part of the expenses alongside part-time work */
  yearlyAowIncome?: number
  cashflows?: SimCashflow[]
}

interface ScenarioResult {
  werkdagen: number
  label: string
  maandInkomen: number
  jaarInkomen: number
  /** End portfolio at the end of the transition phase (AOW in gap, FIRE in shortfall) */
  eindVermogen: number
  /** Difference vs baseline (0 workdays) */
  verschil: number
  /** Freedom days lost per year due to working */
  vrijheidsdagenVerloren: number
}

interface ComputedState {
  scenarios: ScenarioResult[]
  /** Whether the part-time income was derived from a fallback default (income not on file) */
  usedFallbackIncome: boolean
  fullTimeMonthly: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Expliciete, uitgelegde fallback voor het voltijds maandinkomen wanneer er
 * geen netto-inkomen op het profiel staat én de analyse tóch draait
 * (defensief — normaal blokkeert de `noIncome`-melding de analyse).
 *
 * Een modaal Nederlands netto maandinkomen (~CBS 2024/2025) als referentie,
 * zodat de uitkomst niet stilletjes op een verkeerde aanname leunt.
 */
const FALLBACK_FULLTIME_MONTHLY = 3_000

/**
 * Simulate the portfolio forward through the transition phase with extra income.
 *
 * Each year the portfolio:
 *  1. grows by the gross return,
 *  2. pays Box 3 (forfaitaire vermogensrendementsheffing) on the start balance,
 *  3. receives `yearlyIncome` (part-time + AOW in shortfall) and pays expenses,
 *  4. applies any life-event cashflows.
 *
 * `yearlyIncome` is the combined non-portfolio income for the year (AOW counts
 * here in the shortfall scenario), so the portfolio only finances the remainder.
 */
function simulateGapWithIncome(
  startPortfolio: number,
  years: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  yearlyIncome: number,
  cashflows: SimCashflow[],
  startAge: number,
): number {
  let portfolio = startPortfolio

  for (let i = 0; i < years; i++) {
    const age = startAge + i
    const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, i)
    const inflatedIncome = yearlyIncome * Math.pow(1 + inflationRate, i)

    // Cashflow contributions for this year
    const cfNet = cashflows
      .filter(cf => {
        if (cf.type === 'one_time') return Math.round(cf.fromAge) === Math.round(age)
        return cf.fromAge <= age && (cf.toAge == null || cf.toAge > age)
      })
      .reduce((sum, cf) => {
        const sign = cf.direction === 'income' ? 1 : -1
        const inflatedAmount = cf.indexed ? cf.amount * Math.pow(1 + inflationRate, i) : cf.amount
        return sum + sign * inflatedAmount
      }, 0)

    // Box 3 drag on the start-of-year balance (aligns with the kassabon/MC).
    const box3 = Math.max(0, portfolio) * BOX3_DRAG
    // Growth, then Box 3, then income − expenses, then life events.
    portfolio = portfolio * (1 + expectedReturn) - box3
    portfolio += inflatedIncome - inflatedExpenses + cfNet
  }

  return Math.round(portfolio)
}

/**
 * Compute all 4 part-time work scenarios (0/1/2/3 days a week).
 *
 * Both gap and shortfall run the same forward portfolio cascade — the only
 * difference is that in shortfall the AOW income supplements the part-time
 * income against the expenses, so the portfolio bears a smaller burden.
 */
function computeScenarios(
  props: DeeltijdwerkImpactProps,
): ComputedState {
  const {
    startPortfolio,
    startAge,
    endAge,
    yearlyExpenses,
    expectedReturn,
    inflationRate,
    transitionScenario,
    monthlyIncome,
    yearlyAowIncome = 0,
    cashflows = [],
  } = props

  const years = Math.max(Math.round(endAge - startAge), 1)

  // Part-time income scales the full-time net income by days/5. Use the on-file
  // income; only fall back to an explicit, documented modal income if absent.
  const usedFallbackIncome = !monthlyIncome || monthlyIncome <= 0
  const fullTimeMonthly = usedFallbackIncome ? FALLBACK_FULLTIME_MONTHLY : monthlyIncome!

  // In shortfall, AOW already runs during the AOW→FIRE bridge, so it counts as
  // income alongside the part-time work against the expenses. In gap there is
  // no AOW yet (that's the whole point of the bridge).
  const baseIncome = transitionScenario === 'shortfall' ? yearlyAowIncome : 0

  const werkdagenOptions = [0, 1, 2, 3]
  const labels = ['Niet werken', '1 dag/week', '2 dagen/week', '3 dagen/week']

  const results: ScenarioResult[] = []
  let baseline: number | undefined

  for (const dagen of werkdagenOptions) {
    const fraction = dagen / 5
    const maandInkomen = Math.round(fullTimeMonthly * fraction)
    const jaarInkomen = maandInkomen * 12

    // Working days lost per year (assuming 52 weeks minus ~6 weeks vacation ≈ 46 weeks)
    const vrijheidsdagenVerloren = dagen * 46

    // Same model for both scenarios: AOW (shortfall) + part-time income together
    // offset the expenses; the portfolio finances the remainder.
    const eindVermogen = simulateGapWithIncome(
      startPortfolio,
      years,
      yearlyExpenses,
      expectedReturn,
      inflationRate,
      baseIncome + jaarInkomen,
      cashflows,
      startAge,
    )

    if (baseline === undefined) baseline = eindVermogen
    const verschil = eindVermogen - baseline

    results.push({
      werkdagen: dagen,
      label: labels[dagen],
      maandInkomen,
      jaarInkomen,
      eindVermogen,
      verschil,
      vrijheidsdagenVerloren,
    })
  }

  return { scenarios: results, usedFallbackIncome, fullTimeMonthly }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Part-time work flex impact analysis for the transition phase.
 *
 * Shows 4 scenarios (0, 1, 2, 3 workdays/week) and their impact on either:
 * - Gap scenario: end portfolio at AOW age
 * - Shortfall scenario: end portfolio with AOW supplement
 *
 * Includes a "keerzijde" (downside) block showing lost freedom days per year.
 * Uses lazy computation to avoid blocking the modal open animation.
 */
export const DeeltijdwerkImpact = memo(function DeeltijdwerkImpact(
  props: DeeltijdwerkImpactProps,
) {
  const { masked } = useMaskedAmounts()
  const [state, setState] = useState<ComputedState | null>(null)

  // Lazy compute: defer past first paint
  useEffect(() => {
    const timer = setTimeout(() => {
      setState(computeScenarios(props))
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.startPortfolio,
    props.startAge,
    props.endAge,
    props.yearlyExpenses,
    props.expectedReturn,
    props.inflationRate,
    props.transitionScenario,
    props.monthlyIncome,
    props.yearlyAowIncome,
    props.cashflows,
  ])

  const loading = state === null
  const isShortfall = props.transitionScenario === 'shortfall'
  const noIncome = !props.monthlyIncome || props.monthlyIncome <= 0
  const aow = props.yearlyAowIncome ?? 0

  return (
    <AnalysisSection
      title="Deeltijdwerk Flex Impact"
      icon={Briefcase}
      loading={loading}
      willContext={
        noIncome
          ? 'Deeltijdwerk impact: geen inkomen opgegeven — analyse niet beschikbaar'
          : state
            ? `Deeltijdwerk impact (${isShortfall ? 'shortfall: AOW + deeltijd samen tegen de uitgaven' : 'gap: deeltijd vermindert de portfolio-onttrekking'}; ` +
              `aanname: parttime-inkomen = voltijd ${formatMaskedCurrency(Math.round(state.fullTimeMonthly), masked)}/mnd × dagen/5${isShortfall && aow > 0 ? `, AOW ${formatMaskedCurrency(Math.round(aow), masked)}/jaar` : ''}): ` +
              state.scenarios
                .map(
                  (s) =>
                    `${s.label} → ${formatMaskedCurrency(s.maandInkomen, masked)}/mnd, eindvermogen ${formatMaskedCurrency(s.eindVermogen, masked)}${s.verschil !== 0 ? ` (${s.verschil > 0 ? '+' : ''}${formatMaskedCurrency(s.verschil, masked)})` : ''}`,
                )
                .join('; ')
            : 'Deeltijdwerk impact (laden...)'
      }
    >
      {noIncome && (
        <div className="flex items-start gap-3 rounded-md bg-amber-50/50 px-3 py-3 dark:bg-amber-900/10">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              Geen inkomen opgegeven
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              Vul je netto maandinkomen in bij je profiel om te zien wat deeltijdwerk voor je portefeuille betekent.
            </p>
          </div>
        </div>
      )}

      {!noIncome && state && (
        <div className="space-y-4">
          {/* ── Assumption explainer ────────────────────────────── */}
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
            <span>
              Aanname: parttime-inkomen = je voltijds netto maandinkomen ({<MaskedAmount value={Math.round(state.fullTimeMonthly)} tone="horizon" />}
              {state.usedFallbackIncome ? ', schatting' : ''}) × werkdagen/5.
              {isShortfall
                ? ' In het tekort-scenario loopt je AOW al — die telt samen met je deeltijdinkomen mee tegen je uitgaven, zodat je portefeuille minder hoeft te dragen.'
                : ' Elk deeltijdinkomen verlaagt de onttrekking uit je vermogen tijdens de overbrugging naar AOW.'}
            </span>
            <InfoTooltip text="Het portfolio groeit met je rendement, betaalt Box 3, en dekt vervolgens het deel van je uitgaven dat niet door AOW of deeltijdinkomen wordt opgevangen. Zo sluit het eindvermogen aan op de kassabon en de Monte Carlo simulatie." />
          </p>

          {/* ── Scenario table ──────────────────────────────────── */}
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                  <th className="px-1 pb-1.5">Werkdagen</th>
                  <th className="px-1 pb-1.5 text-right">Inkomen/mnd</th>
                  <th className="px-1 pb-1.5 text-right">
                    Eindvermogen {isShortfall ? 'bij FIRE' : 'bij AOW'}
                  </th>
                  <th className="px-1 pb-1.5 text-right">Verschil</th>
                </tr>
              </thead>
              <tbody>
                {state.scenarios.map((s) => (
                  <tr
                    key={s.werkdagen}
                    className={`border-b border-dashed border-[var(--border-ed)] last:border-b-0 ${
                      s.werkdagen === 0 ? 'bg-[var(--subtle)]/30' : ''
                    }`}
                  >
                    <td className="px-1 py-2 text-[var(--ink-2)]">
                      {s.label}
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                      {s.maandInkomen > 0
                        ? formatMaskedCurrency(s.maandInkomen, masked)
                        : '\u2013'}
                    </td>
                    <td className="px-1 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                      {<MaskedAmount value={s.eindVermogen} tone="horizon" />}
                    </td>
                    <td
                      className={`px-1 py-2 text-right font-mono tabular-nums ${
                        s.verschil > 0
                          ? 'text-[var(--positive)]'
                          : s.verschil < 0
                            ? 'text-[var(--negative)]'
                            : 'text-[var(--ink-4)]'
                      }`}
                    >
                      {s.verschil !== 0
                        ? `${s.verschil > 0 ? '+' : ''}${formatMaskedCurrency(s.verschil, masked)}`
                        : '\u2013'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Keerzijde: vrijheidsdagen verloren ─────────────── */}
          <div className="rounded-[var(--r)] border border-dashed border-amber-400/30 bg-amber-50/50 p-3 dark:bg-amber-900/10">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Keerzijde: minder vrije tijd
            </p>
            <div className="space-y-1">
              {state.scenarios
                .filter((s) => s.werkdagen > 0)
                .map((s) => (
                  <div
                    key={s.werkdagen}
                    className="flex justify-between text-xs"
                  >
                    <span className="text-[var(--ink-3)]">{s.label}</span>
                    <span className="font-mono tabular-nums text-amber-700 dark:text-amber-400">
                      &minus;{s.vrijheidsdagenVerloren} dagen/jaar
                    </span>
                  </div>
                ))}
            </div>
            <p className="mt-2 text-[11px] italic leading-relaxed text-[var(--ink-4)]">
              Elke werkdag is een dag minder volledige vrijheid. Weeg het financiele voordeel af tegen de tijd die je inlevert.
            </p>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
