'use client'

import { memo, useState, useEffect, useMemo } from 'react'
import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import type { SimCashflow } from '@/lib/fire-simulation'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

interface SpaarquoteGevoeligheidProps {
  annualSavings: number
  currentAge: number
  fireAge: number | null
  currentPortfolio: number
  expectedReturn: number  // e.g. 0.07
  inflationRate: number   // e.g. 0.02
  yearlyExpenses: number
  /** FIRE target portfolio (€). When provided, the FIRE-age cascade uses this as
   *  the target instead of the hardcoded 4%-rule on expenses. */
  fireTarget?: number
  cashflows?: SimCashflow[]
  /** Actual savings rate percentage (0-100), e.g. from kern page. When provided, shown in header. */
  savingsRate?: number | null
  /** Monthly net income for savings rate context */
  monthlyIncome?: number | null
}

interface ScenarioRow {
  label: string
  pctDelta: number         // e.g. -0.20, -0.10, 0, 0.10, 0.20
  monthlySavings: number
  fireAge: number | null
  verschilJaren: number | null
  eindVermogen: number     // portfolio at FIRE age (or at age 90 if never FIRE)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Forward cascade FIRE age calculation.
 * Projects portfolio growth year by year until it reaches the FIRE target,
 * or until maxAge is reached.
 */
function computeFireAgeForSavings(
  currentPortfolio: number,
  annualSavings: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  currentAge: number,
  cashflows?: SimCashflow[],
  maxAge: number = 90,
  fireTargetOverride?: number,
): { fireAge: number | null; portfolioAtFire: number } {
  if (yearlyExpenses <= 0) return { fireAge: null, portfolioAtFire: currentPortfolio }

  // FIRE target: prefer the app-resolved target (from effectiveSwr), fall back to
  // the 4%-rule (NL standard). A non-4% SWR shifts the target and thus the FIRE age.
  const fireTarget =
    fireTargetOverride != null && fireTargetOverride > 0
      ? fireTargetOverride
      : yearlyExpenses / 0.04

  let portfolio = currentPortfolio
  const realReturn = expectedReturn - inflationRate

  for (let age = currentAge; age <= maxAge; age++) {
    if (portfolio >= fireTarget && age >= currentAge) {
      return { fireAge: age, portfolioAtFire: portfolio }
    }

    // Add savings
    portfolio += annualSavings

    // Add cashflows for this age
    if (cashflows) {
      for (const cf of cashflows) {
        const sign = cf.direction === 'income' ? 1 : -1
        if (cf.type === 'one_time') {
          if (Math.round(cf.fromAge) === Math.round(age)) {
            portfolio += cf.amount * sign
          }
        } else {
          // Recurring: active from fromAge to toAge (or indefinitely)
          const endAge = cf.toAge ?? maxAge
          if (age >= cf.fromAge && age <= endAge) {
            portfolio += cf.amount * sign
          }
        }
      }
    }

    // Apply real return
    portfolio *= (1 + realReturn)
  }

  return { fireAge: null, portfolioAtFire: portfolio }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Spaarquote gevoeligheidsanalyse: what-if scenarios for savings rate changes.
 * Shows 5 scenarios (-20%, -10%, current, +10%, +20%) with impact on FIRE age
 * and end portfolio.
 */
export const SpaarquoteGevoeligheid = memo(function SpaarquoteGevoeligheid({
  annualSavings,
  currentAge,
  fireAge,
  currentPortfolio,
  expectedReturn,
  inflationRate,
  yearlyExpenses,
  fireTarget,
  cashflows,
  savingsRate,
  monthlyIncome,
}: SpaarquoteGevoeligheidProps) {
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null)

  // Resolve the FIRE target: prefer the app-resolved value, fall back to 4%-rule.
  const resolvedFireTarget = fireTarget != null && fireTarget > 0
    ? fireTarget
    : yearlyExpenses > 0
      ? yearlyExpenses / 0.04
      : 0
  // Effective SWR implied by the resolved target (for the Will-context).
  const resolvedSwr = yearlyExpenses > 0 && resolvedFireTarget > 0
    ? yearlyExpenses / resolvedFireTarget
    : 0.04

  // Derive actual savings rate: prefer explicit prop, fall back to income-based computation
  const effectiveSavingsRate = savingsRate != null && savingsRate > 0
    ? savingsRate
    : monthlyIncome && monthlyIncome > 0
      ? Math.round(((annualSavings / 12) / monthlyIncome) * 1000) / 10
      : null

  // Build scenarios with lazy compute via setTimeout
  const params = useMemo(() => ({
    annualSavings,
    currentAge,
    fireAge,
    currentPortfolio,
    expectedReturn,
    inflationRate,
    yearlyExpenses,
    fireTarget: resolvedFireTarget,
    cashflows,
  }), [annualSavings, currentAge, fireAge, currentPortfolio, expectedReturn, inflationRate, yearlyExpenses, resolvedFireTarget, cashflows])

  useEffect(() => {
    const timer = setTimeout(() => {
      // When savings are negative, use absolute monthly step instead of percentages
      const absAnnual = Math.abs(params.annualSavings)
      const step = absAnnual > 0 ? absAnnual * 0.10 : params.yearlyExpenses * 0.05
      const deltas = [-0.20, -0.10, 0, 0.10, 0.20]

      // First compute the base (current) scenario's FIRE age
      const { fireAge: baseComputedFireAge } = computeFireAgeForSavings(
        params.currentPortfolio,
        params.annualSavings,
        params.yearlyExpenses,
        params.expectedReturn,
        params.inflationRate,
        params.currentAge,
        params.cashflows,
        90,
        params.fireTarget,
      )
      // Use the external fireAge if available (more accurate), otherwise our computed one
      const referenceFireAge = params.fireAge ?? baseComputedFireAge

      const rows: ScenarioRow[] = deltas.map(delta => {
        const adjustedAnnualSavings = params.annualSavings <= 0
          ? params.annualSavings + (delta / 0.10) * step  // absolute steps for negative savings
          : params.annualSavings * (1 + delta)
        const { fireAge: computedFireAge, portfolioAtFire } = computeFireAgeForSavings(
          params.currentPortfolio,
          adjustedAnnualSavings,
          params.yearlyExpenses,
          params.expectedReturn,
          params.inflationRate,
          params.currentAge,
          params.cashflows,
          90,
          params.fireTarget,
        )

        // Verschil in jaren t.o.v. huidig scenario (use reference for base, delta from that)
        let verschilJaren: number | null = null
        if (delta === 0) {
          verschilJaren = 0
        } else if (computedFireAge != null && baseComputedFireAge != null) {
          verschilJaren = computedFireAge - baseComputedFireAge
        }

        const label = delta === 0
          ? 'Huidig'
          : params.annualSavings <= 0
            ? (delta > 0 ? `+${formatCurrency(Math.round(Math.abs(delta / 0.10) * step))}/jr` : `${formatCurrency(Math.round(Math.abs(delta / 0.10) * step * -1))}/jr`)
            : (delta > 0 ? `+${Math.round(delta * 100)}%` : `${Math.round(delta * 100)}%`)

        return {
          label,
          pctDelta: delta,
          monthlySavings: Math.round(adjustedAnnualSavings / 12),
          fireAge: delta === 0 ? (referenceFireAge ?? computedFireAge) : computedFireAge,
          verschilJaren,
          eindVermogen: portfolioAtFire,
        }
      })

      setScenarios(rows)
    }, 0)

    return () => clearTimeout(timer)
  }, [params])

  // Don't render when there's no meaningful expense data
  if (yearlyExpenses <= 0) return null

  // Show empty state when savings rate is not available
  const hasMeaningSavingsData = annualSavings !== 0 || (effectiveSavingsRate != null && effectiveSavingsRate > 0)
  if (!hasMeaningSavingsData) {
    return (
      <AnalysisSection
        title="Spaarquote gevoeligheid"
        icon={TrendingUp}
        loading={false}
        willContext="Spaarquote gevoeligheid: geen spaarquote beschikbaar."
      >
        <div className="rounded-md border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-4 text-center">
          <p className="text-xs text-[var(--ink-3)]">
            Er is geen spaarquote beschikbaar om gevoeligheidsscenario&apos;s te berekenen.
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">
            Voeg inkomsten en uitgaven toe zodat je spaarquote berekend kan worden.
          </p>
        </div>
      </AnalysisSection>
    )
  }

  const willContext = scenarios
    ? [
        effectiveSavingsRate != null
          ? `Spaarquote gevoeligheid. Huidige spaarquote: ${effectiveSavingsRate.toFixed(1)}% (${formatCurrency(Math.round(annualSavings / 12))}/mnd).`
          : 'Spaarquote gevoeligheid.',
        `Gebruikte SWR: ${(resolvedSwr * 100).toFixed(1)}%; FIRE-doel: ${formatCurrency(Math.round(resolvedFireTarget))}.`,
        `Scenario's: ${scenarios
          .map(
            (s) =>
              `${s.label} (${formatCurrency(s.monthlySavings)}/mnd) → FIRE ${s.fireAge != null ? `${s.fireAge} jr` : '90+'}, eindvermogen ${formatCurrency(Math.round(s.eindVermogen))}`,
          )
          .join('; ')}.`,
      ].join(' ')
    : 'Spaarquote gevoeligheid: berekening...'

  return (
    <AnalysisSection
      title="Spaarquote gevoeligheid"
      icon={TrendingUp}
      loading={!scenarios}
      willContext={willContext}
    >
      <div className="space-y-3">
        {/* ── Current savings rate badge ───────────────────── */}
        {effectiveSavingsRate != null && (
          <div className="flex items-center gap-2 rounded-md bg-[var(--color-horizon-100)]/30 px-2.5 py-1.5 text-xs text-[var(--ink-2)]">
            <span className="font-medium">Huidige spaarquote:</span>
            <span className="font-mono tabular-nums font-semibold text-[var(--color-horizon-600)]">
              {effectiveSavingsRate.toFixed(1)}%
            </span>
            <span className="text-[var(--ink-4)]">
              ({<MaskedAmount value={Math.round(annualSavings / 12)} tone="horizon" />}/mnd)
            </span>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
          Wat als je meer of minder spaart? Onderstaande tabel toont de impact op je FIRE-leeftijd en eindvermogen.
        </p>

        {/* ── Scenario comparison table ─────────────────────── */}
        <div className="overflow-x-auto rounded-md border border-[var(--border-ed)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50">
                <th className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-[var(--ink-3)]">
                  Spaarquote
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                  Maandelijks
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                  FIRE-leeftijd
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                  Verschil
                </th>
                <th className="whitespace-nowrap px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                  Eindvermogen
                </th>
              </tr>
            </thead>
            <tbody>
              {scenarios?.map((s) => {
                const isCurrent = s.pctDelta === 0

                // Color for verschil column
                let verschilColor = 'text-[var(--ink-2)]'
                let verschilText = '–'
                if (s.verschilJaren != null && s.verschilJaren !== 0) {
                  if (s.verschilJaren < 0) {
                    verschilColor = 'text-[var(--positive)]'
                    verschilText = `${s.verschilJaren} jr`
                  } else {
                    verschilColor = 'text-[var(--negative)]'
                    verschilText = `+${s.verschilJaren} jr`
                  }
                } else if (s.verschilJaren === 0) {
                  verschilText = '0 jr'
                }

                return (
                  <tr
                    key={s.label}
                    className={
                      isCurrent
                        ? 'bg-[var(--color-horizon-100)]/40 font-semibold'
                        : 'hover:bg-[var(--subtle)]/50'
                    }
                  >
                    <td className="whitespace-nowrap px-2 py-1.5 text-[var(--ink-2)]">
                      {s.label}
                      {isCurrent && (
                        <span className="ml-1 text-[10px] text-[var(--ink-4)]">●</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {<MaskedAmount value={s.monthlySavings} tone="horizon" />}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {s.fireAge != null ? `${s.fireAge} jr` : '90+'}
                    </td>
                    <td className={`whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums ${verschilColor}`}>
                      {verschilText}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {<MaskedAmount value={Math.round(s.eindVermogen)} tone="horizon" />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Insight note ──────────────────────────────────── */}
        {scenarios && scenarios.length >= 5 && (() => {
          const plus20 = scenarios[4]
          const minus20 = scenarios[0]
          if (plus20.fireAge != null && minus20.fireAge != null) {
            const spread = minus20.fireAge - plus20.fireAge
            if (spread > 0) {
              return (
                <p className="text-[11px] italic leading-relaxed text-[var(--ink-4)]">
                  Het verschil tussen 20% meer en 20% minder sparen is {spread} jaar
                  {spread === 1 ? '' : ''} — kleine aanpassingen hebben grote impact over tijd.
                </p>
              )
            }
          }
          return null
        })()}
      </div>
    </AnalysisSection>
  )
})
