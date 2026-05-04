'use client'

import { useState, useMemo } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import type { WhatIfOverrides } from '@/components/app/horizon/whatif-sliders'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { useChatContext } from '@/components/app/chat/chat-provider'
import {
  Zap, ChevronDown, ChevronUp, MessageCircle, ArrowRight,
  TrendingUp, PiggyBank, Briefcase, BarChart3,
} from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

interface ScenarioAction {
  id: string
  icon: React.ReactNode
  title: string
  description: string
  impact: string
  category: 'inkomen' | 'sparen' | 'beleggen' | 'levensstijl'
}

// ── WhatIfActions ────────────────────────────────────────────────────────────

export function WhatIfActions({
  overrides,
  baseline,
  baselineFireAge,
  whatIfFireAge,
  whatIfAnnualSavings,
  baselineAnnualSavings,
}: {
  overrides: WhatIfOverrides
  baseline: WhatIfOverrides
  baselineFireAge: number | null
  whatIfFireAge: number | null
  whatIfAnnualSavings: number
  baselineAnnualSavings: number
}) {
  const { masked } = useMaskedAmounts()
  const [expanded, setExpanded] = useState(true)
  const [showSummary, setShowSummary] = useState(false)
  const { openWithMessage } = useChatContext()

  // Check if scenario differs from baseline
  const hasChanges = JSON.stringify(overrides) !== JSON.stringify(baseline)

  // Compute deltas
  const deltas = useMemo(() => ({
    income: overrides.monthlyIncome - baseline.monthlyIncome,
    workDays: overrides.workDaysPerWeek - baseline.workDaysPerWeek,
    savingsRate: overrides.savingsRate - baseline.savingsRate,
    expectedReturn: overrides.expectedReturn - baseline.expectedReturn,
    extraContribution: overrides.extraContribution - baseline.extraContribution,
  }), [overrides, baseline])

  const fireAgeDelta = baselineFireAge !== null && whatIfFireAge !== null
    ? whatIfFireAge - baselineFireAge
    : null

  // Generate deterministic action suggestions based on scenario deltas
  const actions = useMemo<ScenarioAction[]>(() => {
    if (!hasChanges) return []
    const result: ScenarioAction[] = []

    // Income increase
    if (deltas.income > 0) {
      const monthlyDelta = deltas.income
      if (monthlyDelta >= 500) {
        result.push({
          id: 'salary-negotiation',
          icon: <Briefcase className="h-4 w-4" />,
          title: 'Salarisonderhandeling voeren',
          description: `Je scenario gaat uit van ${formatMaskedCurrency(monthlyDelta, masked)}/mnd meer inkomen. Plan een gesprek met je leidinggevende over een loonsverhoging.`,
          impact: `+${formatMaskedCurrency(monthlyDelta, masked)}/mnd`,
          category: 'inkomen',
        })
      }
      if (monthlyDelta >= 200 && monthlyDelta < 1500) {
        result.push({
          id: 'side-income',
          icon: <Zap className="h-4 w-4" />,
          title: 'Bijverdienste starten',
          description: `Overweeg freelance werk, een online cursus geven of een side-project om ${formatMaskedCurrency(monthlyDelta, masked)}/mnd extra te verdienen.`,
          impact: `+${formatMaskedCurrency(monthlyDelta, masked)}/mnd`,
          category: 'inkomen',
        })
      }
    }

    // Income decrease (part-time)
    if (deltas.income < 0 && deltas.workDays < 0) {
      result.push({
        id: 'part-time-request',
        icon: <Briefcase className="h-4 w-4" />,
        title: 'Part-time werken aanvragen',
        description: `Je scenario gaat uit van ${overrides.workDaysPerWeek} werkdagen. Bespreek dit met je werkgever — in NL heb je recht op aanpassing van je arbeidsduur (Wet flexibel werken).`,
        impact: `${overrides.workDaysPerWeek} dagen/week`,
        category: 'levensstijl',
      })
    }

    // Savings rate increase
    if (deltas.savingsRate > 5) {
      const monthlyIncome = overrides.monthlyIncome * (overrides.workDaysPerWeek / 5)
      const monthlySaving = monthlyIncome * (deltas.savingsRate / 100)
      result.push({
        id: 'reduce-expenses',
        icon: <PiggyBank className="h-4 w-4" />,
        title: `Uitgaven verlagen met ${formatMaskedCurrency(monthlySaving, masked)}/mnd`,
        description: `Verhoog je spaarquote van ${Math.round(baseline.savingsRate)}% naar ${Math.round(overrides.savingsRate)}%. Bekijk je budgetten voor besparingsmogelijkheden bij abonnementen, boodschappen of vervoer.`,
        impact: `+${Math.round(deltas.savingsRate)}% spaarquote`,
        category: 'sparen',
      })
    }

    // Extra contribution
    if (deltas.extraContribution > 0) {
      result.push({
        id: 'increase-contribution',
        icon: <TrendingUp className="h-4 w-4" />,
        title: `Maandelijkse inleg verhogen met ${formatMaskedCurrency(deltas.extraContribution, masked)}`,
        description: 'Stel een automatische overboeking in naar je beleggingsrekening op de dag dat je salaris binnenkomt.',
        impact: `+${formatMaskedCurrency(deltas.extraContribution, masked)}/mnd`,
        category: 'beleggen',
      })
    }

    // Return change
    if (deltas.expectedReturn >= 1) {
      result.push({
        id: 'portfolio-review',
        icon: <BarChart3 className="h-4 w-4" />,
        title: 'Portfolio herbalanceren',
        description: `Je scenario verwacht ${overrides.expectedReturn.toFixed(1)}% rendement i.p.v. ${baseline.expectedReturn.toFixed(1)}%. Overweeg een hoger aandeel aandelen of een goedkoper indexfonds.`,
        impact: `${overrides.expectedReturn.toFixed(1)}% rendement`,
        category: 'beleggen',
      })
    }

    // Work days decrease without income change
    if (deltas.workDays < 0 && deltas.income >= 0) {
      result.push({
        id: 'efficiency',
        icon: <Briefcase className="h-4 w-4" />,
        title: 'Hogere productiviteit per uur',
        description: `Met minder werkdagen en gelijk inkomen heb je een hogere uurwaarde nodig. Overweeg skills-ontwikkeling of een functie met meer verantwoordelijkheid.`,
        impact: `${overrides.workDaysPerWeek} dagen, zelfde inkomen`,
        category: 'inkomen',
      })
    }

    return result
  }, [hasChanges, deltas, overrides, baseline, masked])

  // Build Will chat message with scenario context
  const buildWillMessage = () => {
    const parts: string[] = ['Ik heb een wat-als scenario gemaakt met de volgende aanpassingen:']

    if (deltas.income !== 0) {
      parts.push(`- Maandinkomen: ${formatMaskedCurrency(baseline.monthlyIncome, masked)} → ${formatMaskedCurrency(overrides.monthlyIncome, masked)} (${deltas.income > 0 ? '+' : ''}${formatMaskedCurrency(deltas.income, masked)}/mnd)`)
    }
    if (deltas.workDays !== 0) {
      parts.push(`- Werkdagen: ${baseline.workDaysPerWeek} → ${overrides.workDaysPerWeek} dagen/week`)
    }
    if (deltas.savingsRate !== 0) {
      parts.push(`- Spaarquote: ${Math.round(baseline.savingsRate)}% → ${Math.round(overrides.savingsRate)}%`)
    }
    if (deltas.expectedReturn !== 0) {
      parts.push(`- Verwacht rendement: ${baseline.expectedReturn.toFixed(1)}% → ${overrides.expectedReturn.toFixed(1)}%`)
    }
    if (deltas.extraContribution !== 0) {
      parts.push(`- Extra inleg: +${formatMaskedCurrency(deltas.extraContribution, masked)}/mnd`)
    }

    if (fireAgeDelta !== null) {
      parts.push('')
      parts.push(`Dit verandert mijn FIRE-leeftijd met ${fireAgeDelta > 0 ? '+' : ''}${fireAgeDelta.toFixed(1)} jaar.`)
    }

    parts.push('')
    parts.push('Wat zijn de meest haalbare eerste stappen om dit scenario werkelijkheid te maken?')

    return parts.join('\n')
  }

  if (!hasChanges) return null

  return (
    <>
      <div className="card-editorial overflow-hidden">
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="whatif-actions-content"
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-horizon-600" />
            <span className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
              Scenario-acties
            </span>
            {actions.length > 0 && (
              <span className="rounded-full bg-horizon-50 px-1.5 py-0.5 font-mono text-[10px] text-horizon-700">
                {actions.length}
              </span>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
          ) : (
            <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
          )}
        </button>

        {expanded && (
          <div id="whatif-actions-content" className="px-4 pb-4">
            {/* Scenario summary link */}
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className="mb-3 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-sans text-[11px] font-medium text-[var(--ink-2)]">
                  Scenario-samenvatting
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-4)]" />
              </div>
              {fireAgeDelta !== null && Math.abs(fireAgeDelta) > 0.1 && (
                <p className={`mt-0.5 font-mono text-[11px] ${fireAgeDelta < 0 ? 'text-horizon-700' : 'text-kern-700'}`}>
                  FIRE {fireAgeDelta < 0 ? '' : '+'}{fireAgeDelta.toFixed(1)} jaar
                  {' · '}
                  {<MaskedAmount value={whatIfAnnualSavings - baselineAnnualSavings} tone="horizon" />}/jaar
                </p>
              )}
            </button>

            {/* Action suggestions */}
            {actions.length > 0 && (
              <div className="divide-y divide-dashed divide-[var(--border-ed)]">
                {actions.map(action => (
                  <div key={action.id} className="py-2.5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-horizon-50 text-horizon-600">
                        {action.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm font-medium text-[var(--ink)]">
                          {action.title}
                        </p>
                        <p className="mt-0.5 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                          {action.description}
                        </p>
                        <span className="mt-1 inline-flex rounded-full bg-horizon-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-horizon-700">
                          {action.impact}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Talk to Will button */}
            <button
              type="button"
              onClick={() => openWithMessage(buildWillMessage())}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-[var(--r)] bg-horizon-600 px-4 py-3 font-sans text-sm font-medium text-white transition-colors hover:bg-horizon-700"
            >
              <MessageCircle className="h-4 w-4" />
              Bespreek met Will
            </button>

            <p className="mt-2 text-center font-sans text-[10px] text-[var(--ink-4)]">
              Will analyseert je scenario en stelt concrete stappen voor
            </p>
          </div>
        )}
      </div>

      {/* ── Scenario Summary Kassabon ──────────────────────── */}
      <BottomSheet
        open={showSummary}
        onClose={() => setShowSummary(false)}
        title="Scenario-samenvatting"
      >
        <ScenarioSummaryKassabon
          overrides={overrides}
          baseline={baseline}
          baselineFireAge={baselineFireAge}
          whatIfFireAge={whatIfFireAge}
          whatIfAnnualSavings={whatIfAnnualSavings}
          baselineAnnualSavings={baselineAnnualSavings}
        />
      </BottomSheet>
    </>
  )
}

// ── ScenarioSummaryKassabon ──────────────────────────────────────────────────

function ScenarioSummaryKassabon({
  overrides,
  baseline,
  baselineFireAge,
  whatIfFireAge,
  whatIfAnnualSavings,
  baselineAnnualSavings,
}: {
  overrides: WhatIfOverrides
  baseline: WhatIfOverrides
  baselineFireAge: number | null
  whatIfFireAge: number | null
  whatIfAnnualSavings: number
  baselineAnnualSavings: number
}) {
  const fireAgeDelta = baselineFireAge !== null && whatIfFireAge !== null
    ? whatIfFireAge - baselineFireAge
    : null

  const absDelta = Math.abs(fireAgeDelta ?? 0)
  const deltaYears = Math.floor(absDelta)
  const deltaMonths = Math.round((absDelta - deltaYears) * 12)
  const isPositive = (fireAgeDelta ?? 0) < 0 // negative = FIRE earlier = good

  return (
    <KassabonShell>
      {/* Header */}
      <div className="mb-3 text-center">
        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
          SCENARIO VS. WERKELIJKHEID
        </p>
        <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
          Overzicht van alle aanpassingen
        </p>
      </div>

      {/* Uitleg */}
      <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
        Dit is een overzicht van de veranderingen in je wat-als scenario vergeleken met je huidige situatie.
      </div>

      {/* Parameter changes */}
      <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        {/* Income */}
        {overrides.monthlyIncome !== baseline.monthlyIncome && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Maandinkomen</span>
            <span className="tabular-nums text-[var(--ink)]">
              {<MaskedAmount value={baseline.monthlyIncome} tone="horizon" />} → {<MaskedAmount value={overrides.monthlyIncome} tone="horizon" />}
            </span>
          </div>
        )}

        {/* Work days */}
        {overrides.workDaysPerWeek !== baseline.workDaysPerWeek && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Werkdagen</span>
            <span className="tabular-nums text-[var(--ink)]">
              {baseline.workDaysPerWeek} → {overrides.workDaysPerWeek} dagen
            </span>
          </div>
        )}

        {/* Savings rate */}
        {Math.round(overrides.savingsRate) !== Math.round(baseline.savingsRate) && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Spaarquote</span>
            <span className="tabular-nums text-[var(--ink)]">
              {Math.round(baseline.savingsRate)}% → {Math.round(overrides.savingsRate)}%
            </span>
          </div>
        )}

        {/* Expected return */}
        {overrides.expectedReturn !== baseline.expectedReturn && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
            <span className="tabular-nums text-[var(--ink)]">
              {baseline.expectedReturn.toFixed(1)}% → {overrides.expectedReturn.toFixed(1)}%
            </span>
          </div>
        )}

        {/* Extra contribution */}
        {overrides.extraContribution > 0 && (
          <div className="flex justify-between py-0.5">
            <span className="font-sans text-sm text-[var(--ink-2)]">Extra inleg</span>
            <span className="tabular-nums text-[var(--ink)]">
              +{<MaskedAmount value={overrides.extraContribution} tone="horizon" />}/mnd
            </span>
          </div>
        )}
      </div>

      {/* Annual savings impact */}
      <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
        <div className="flex justify-between py-0.5">
          <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijks sparen (huidig)</span>
          <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={baselineAnnualSavings} tone="horizon" />}</span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijks sparen (scenario)</span>
          <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={whatIfAnnualSavings} tone="horizon" />}</span>
        </div>
      </div>

      {/* FreedomTimeBadge for savings delta */}
      {(whatIfAnnualSavings - baselineAnnualSavings) > 100 && (
        <div className="my-2 flex justify-center">
          <FreedomTimeBadge amount={whatIfAnnualSavings - baselineAnnualSavings} />
        </div>
      )}

      {/* FIRE impact total */}
      <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
        <span className="text-[var(--ink)]">FIRE-leeftijd effect</span>
        <span className="tabular-nums text-[var(--ink)]">
          {fireAgeDelta !== null
            ? `${fireAgeDelta > 0 ? '+' : ''}${fireAgeDelta.toFixed(1)} jaar`
            : 'n.v.t.'
          }
        </span>
      </div>

      {/* FIRE ages comparison */}
      <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
        <div className="flex justify-between py-0.5">
          <span className="font-sans text-sm text-[var(--ink-2)]">FIRE leeftijd (huidig)</span>
          <span className="tabular-nums text-[var(--ink)]">
            {baselineFireAge !== null ? `${Math.floor(baselineFireAge)} jaar` : 'n.v.t.'}
          </span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="font-sans text-sm text-[var(--ink-2)]">FIRE leeftijd (scenario)</span>
          <span className="tabular-nums text-[var(--ink)]">
            {whatIfFireAge !== null ? `${Math.floor(whatIfFireAge)} jaar` : 'n.v.t.'}
          </span>
        </div>

        {fireAgeDelta !== null && absDelta > 0.1 && (
          <div className={`mt-2 rounded-[var(--r-sm)] px-3 py-2 text-center font-sans text-[11px] font-medium ${
            isPositive
              ? 'border border-dashed border-horizon-300 bg-horizon-50/50 text-horizon-700'
              : 'border border-dashed border-kern-300 bg-kern-50/50 text-kern-700'
          }`}>
            {isPositive
              ? `↑ FIRE ${deltaYears > 0 ? `${deltaYears} jaar` : ''}${deltaYears > 0 && deltaMonths > 0 ? ' en ' : ''}${deltaMonths > 0 ? `${deltaMonths} maanden` : ''} eerder bereikbaar`
              : `↓ FIRE ${deltaYears > 0 ? `${deltaYears} jaar` : ''}${deltaYears > 0 && deltaMonths > 0 ? ' en ' : ''}${deltaMonths > 0 ? `${deltaMonths} maanden` : ''} later bereikbaar`
            }
          </div>
        )}
      </div>

      {/* Formule */}
      <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
        <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> Extra inkomen gaat 1:1 naar inleg. Spaarquote past uitgaven aan op basisinkomen. Extra inleg komt daar bovenop.</p>
      </div>

      {/* Footer */}
      <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
        Gebaseerd op de huidige simulatie-instellingen
      </p>
    </KassabonShell>
  )
}
