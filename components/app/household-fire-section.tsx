'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { usePerspective } from '@/components/app/perspective-provider'
import { SPLIT_MODE_LABELS } from '@/lib/household-data'
import { createClient } from '@/lib/supabase/client'
import {
  buildHouseholdProjectionInput,
  type HouseholdProjectionResult,
  type HouseholdFireProjectionData,
  type HouseholdPartnerProjection,
} from '@/lib/household-projection'
import { PrivacyHiddenNotice } from '@/components/app/privacy-hidden-notice'
import { HouseholdRetirementPane } from '@/components/app/horizon/household-retirement-pane'
import {
  Users, TrendingUp, Percent, Target, User,
  Clock, PiggyBank, Wallet, Info, Settings2, EyeOff,
} from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

// Local aliases so the existing JSX (which references these names) keeps working.
// The single source of truth is now lib/household-projection.ts.
type FireProjectionData = HouseholdFireProjectionData
type PartnerProjection = HouseholdPartnerProjection
type HouseholdFireData = HouseholdProjectionResult

/**
 * HouseholdFireSection - Displays combined and individual FIRE projections
 * for household members. Shows side-by-side partner comparison.
 *
 * Data komt nu uit buildHouseholdProjectionInput (lib/household-projection.ts):
 * twee runUnifiedProjection-runs (per partner) + een gecombineerde unified
 * projectie op de head-age-as met dual-AOW. Reageert op perspectief-wissels
 * door te herladen via de browser-client.
 *
 * Renders on /horizon page when user has a household.
 */
export function HouseholdFireSection() {
  const [data, setData] = useState<HouseholdFireData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Aanpas-pane voor de huishoud-brede uitgave ná pensioen.
  const [retireOpen, setRetireOpen] = useState(false)
  // Toon/verberg de uitgangspunten-uitleg (i) bij "Samen sterker".
  const [showAssumptions, setShowAssumptions] = useState(false)
  const { perspective, perspectiveVersion, refreshData } = usePerspective()
  // Alle hooks MOETEN vóór elke conditionele return staan (rules-of-hooks).
  const { ref: inViewRef } = useInViewAnimation({ duration: 1100 })
  // Balken renderen DIRECT op hun eindbreedte. De in-view-flag bleef 'false'
  // wanneer je naar de (lange) sectie scrolt vóór de sectie-top in beeld komt
  // — dan stonden alle vergelijkings-/voortgangsbalken op 0% (leeg).
  const hasEntered = true

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const result = await buildHouseholdProjectionInput(supabase)
      if (!result.hasHousehold) {
        setData(null)
        return
      }
      setData(result)
    } catch (err) {
      console.error('Error loading household FIRE data:', err)
      setError('Kon huishouden FIRE-gegevens niet laden')
    } finally {
      setLoading(false)
    }
  }, [])

  // Re-load on mount and whenever the perspective changes in-session.
  useEffect(() => { loadData() }, [loadData, perspectiveVersion])

  // Don't render anything if no household
  if (!loading && !data) return null
  if (error) return null

  // In personal perspective, show only current user's individual FIRE projection
  const isPersonalView = perspective === 'personal'

  if (loading) {
    return (
      <section className="mt-10" data-testid="household-fire-section">
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-horizon-500" />
          <h2 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
            Huishouden FIRE Projecties
          </h2>
        </div>
        <div className="flex items-center justify-center rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-horizon-500 border-t-transparent" />
        </div>
      </section>
    )
  }

  if (!data) return null

  const { combined, partners, comparison, householdName, splitMode } = data
  const hasMultiplePartners = partners.length >= 2
  const currentUserPartner = partners.find(p => p.isCurrentUser)
  const splitLabel = SPLIT_MODE_LABELS[splitMode] ?? splitMode

  // Gecombineerde FIRE uitgedrukt als kalenderjaar + ieders leeftijd dán.
  // De combined `fireAge` is de leeftijd van de OUDSTE partner (de head, wiens
  // tijdas de gezamenlijke projectie volgt). Die los tonen naast ieders eigen
  // leeftijd is appels-met-peren: het zijn leeftijden van verschillende mensen.
  // We vertalen het daarom naar één kalenderjaar waarin beiden kunnen stoppen,
  // met de leeftijd van elke partner in dat jaar.
  const headCurrentAge = Math.max(...partners.map(p => p.settings.currentAge ?? 0))
  const combinedFireAge = combined.projection.fireAge
  const yearsToCombinedFire = combinedFireAge != null && headCurrentAge > 0 ? combinedFireAge - headCurrentAge : null
  const combinedFireYear = (() => {
    // Liefst het jaar uit fireDate parsen; anders huidig jaar + jaren-tot-FIRE.
    const m = combined.projection.fireDate?.match(/\b(20\d{2})\b/)
    if (m) return Number(m[1])
    if (yearsToCombinedFire != null) return new Date().getFullYear() + Math.round(yearsToCombinedFire)
    return null
  })()
  const partnerAgesAtCombinedFire = yearsToCombinedFire != null
    ? partners.map(p => ({
        name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
        age: Math.round((p.settings.currentAge ?? 0) + yearsToCombinedFire),
      }))
    : []

  // Personal perspective: show only the user's individual FIRE age
  if (isPersonalView && currentUserPartner) {
    return (
      <section className="mt-10" data-testid="household-fire-section">
        <div ref={inViewRef}>
          {/* Section Header */}
          <div className="mb-5">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-horizon-500" />
              <h2 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
                Persoonlijk FIRE-doel
              </h2>
            </div>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Jouw individuele FIRE-projectie op basis van je persoonlijk vermogen en jouw aandeel ({splitLabel}) van gedeelde bezittingen.
            </p>
          </div>

          {/* Personal FIRE Card */}
          <div className="rounded-[var(--r-lg)] border-2 border-horizon-200 bg-gradient-to-br from-horizon-50 to-white p-6" data-testid="personal-fire-card">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-horizon-100">
                <User className="h-4 w-4 text-horizon-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-horizon-900">Jouw FIRE-projectie</p>
                <p className="text-xs text-horizon-600/60">
                  Verdeling: {splitLabel}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="personal-fire-kpis">
              <div>
                <p className="text-[10px] font-medium text-horizon-600/50 uppercase">Vrijheid</p>
                <p className="text-2xl font-bold text-horizon-700" data-testid="personal-freedom-pct">
                  {currentUserPartner.projection.freedomPercentage.toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-horizon-600/50 uppercase">FIRE leeftijd</p>
                <p className="text-2xl font-bold text-horizon-700" data-testid="personal-fire-age">
                  {currentUserPartner.projection.fireAge !== null ? Math.round(currentUserPartner.projection.fireAge) : '-'}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-horizon-600/50 uppercase">FIRE-doel</p>
                <p className="font-mono tabular-nums text-lg font-bold text-horizon-700" data-testid="personal-fire-target">
                  {<MaskedAmount value={currentUserPartner.projection.fireTarget} tone="horizon" />}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-horizon-600/50 uppercase">Vrijheidstijd</p>
                <p className="font-mono tabular-nums text-lg font-bold text-horizon-700" data-testid="personal-freedom-time">
                  {currentUserPartner.projection.freedomYears}j {currentUserPartner.projection.freedomMonths}mnd
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-horizon-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-horizon-600 to-horizon-400"
                  style={{
                    width: hasEntered ? `${Math.max(Math.min(currentUserPartner.projection.freedomPercentage, 100), 0)}%` : '0%',
                    transition: hasEntered ? 'width 1000ms cubic-bezier(.22,1,.36,1)' : 'none',
                  }}
                  data-testid="personal-progress-bar"
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-horizon-400">
                <span>0%</span>
                <span>{currentUserPartner.projection.fireDate}</span>
                <span>100%</span>
              </div>
            </div>
          </div>

          {/* Split mode info */}
          <div className="mt-3 flex items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--ink-3)]">
            <Settings2 className="h-3.5 w-3.5 shrink-0" />
            <span>Gedeelde bezittingen verdeeld volgens <strong>{splitLabel}</strong>-modus. Wissel naar <strong>Huishouden</strong> perspectief voor de gecombineerde FIRE-leeftijd.</span>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mt-10" data-testid="household-fire-section">
      <div ref={inViewRef}>
      {/* Section Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-horizon-500" />
          <h2 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
            {householdName} — FIRE Projecties
          </h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Gecombineerd inkomen, gecombineerde uitgaven. Gedeeld en individueel FIRE-doel (verdeling: {splitLabel}).
        </p>
      </div>

      {/* Partner-privacy edge case: partner verbergt vermogen → de gecombineerde
          projectie valt terug op enkel jouw cijfers. Toon een subtiele indicatie. */}
      {data.partnerDataHidden && (
        <div className="mb-4" data-testid="household-fire-privacy-notice">
          <PrivacyHiddenNotice hiddenCategories={['assets']} />
          <p className="mt-1.5 text-xs text-[var(--ink-4)]">
            Je partner deelt het vermogen niet, dus de gecombineerde FIRE-projectie is gebaseerd op jouw gegevens. Vraag je partner om vermogen te delen voor een volledig huishoudbeeld.
          </p>
        </div>
      )}

      {/* Combined Household Hero Card */}
      <div className="rounded-[var(--r-lg)] border-2 border-horizon-200 bg-gradient-to-br from-horizon-50 to-white p-6" data-testid="household-combined-card">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-horizon-100">
            <Users className="h-4 w-4 text-horizon-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-horizon-900">Gedeeld FIRE-doel</p>
            <p className="text-xs text-horizon-600/60">Gecombineerde projectie voor het huishouden</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="household-combined-kpis">
          {/* Combined Freedom % */}
          <div>
            <p className="text-[10px] font-medium text-horizon-600/50 uppercase">Vrijheid</p>
            <p className="text-2xl font-bold text-horizon-700" data-testid="combined-freedom-pct">
              {combined.projection.freedomPercentage.toFixed(1)}%
            </p>
          </div>

          {/* Combined FIRE — uitgedrukt als kalenderjaar (niet als leeftijd van
              één persoon). Sub-line toont ieders leeftijd in dat jaar. */}
          <div>
            <p className="text-[10px] font-medium text-horizon-600/50 uppercase">Samen vrij in</p>
            {combinedFireYear !== null && partnerAgesAtCombinedFire.length > 0 ? (
              <>
                <p className="text-2xl font-bold text-horizon-700" data-testid="combined-fire-age">
                  {combinedFireYear}
                </p>
                <p className="mt-0.5 text-[11px] text-horizon-600/60" data-testid="combined-fire-ages">
                  {partnerAgesAtCombinedFire.map(pa => `${pa.name} ${pa.age}`).join(' · ')}
                </p>
              </>
            ) : (
              // Fallback: niet haalbaar / leeftijden ontbreken → toon de leeftijd.
              <p className="text-2xl font-bold text-horizon-700" data-testid="combined-fire-age">
                {combinedFireAge !== null ? `${Math.round(combinedFireAge)} jaar` : '-'}
              </p>
            )}
          </div>

          {/* Combined FIRE Target */}
          <div>
            <p className="text-[10px] font-medium text-horizon-600/50 uppercase">FIRE-doel</p>
            <p className="font-mono tabular-nums text-lg font-bold text-horizon-700" data-testid="combined-fire-target">
              {<MaskedAmount value={combined.projection.fireTarget} tone="horizon" />}
            </p>
          </div>

          {/* Combined Freedom Time */}
          <div>
            <p className="text-[10px] font-medium text-horizon-600/50 uppercase">Vrijheidstijd</p>
            <p className="font-mono tabular-nums text-lg font-bold text-horizon-700" data-testid="combined-freedom-time">
              {combined.projection.freedomYears}j {combined.projection.freedomMonths}mnd
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-horizon-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-horizon-600 to-horizon-400"
              style={{
                width: hasEntered ? `${Math.max(Math.min(combined.projection.freedomPercentage, 100), 0)}%` : '0%',
                transition: hasEntered ? 'width 1000ms cubic-bezier(.22,1,.36,1)' : 'none',
              }}
              data-testid="combined-progress-bar"
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-horizon-400">
            <span>0%</span>
            <span>{combined.projection.fireDate}</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Combined Financial Summary */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="household-combined-financials">
        <FinancialCard
          icon={<PiggyBank className="h-4 w-4 text-horizon-600" />}
          label="Gecomb. vermogen"
          value={<MaskedAmount value={comparison.combinedNetWorth} tone="horizon" />}
          testId="combined-net-worth"
        />
        <FinancialCard
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label="Gecomb. inkomen"
          value={<MaskedAmount value={comparison.combinedMonthlyIncome} tone="horizon" />}
          suffix="/mnd"
          testId="combined-income"
        />
        <FinancialCard
          icon={<Wallet className="h-4 w-4 text-red-500" />}
          label="Gecomb. uitgaven"
          value={<MaskedAmount value={comparison.combinedMonthlyExpenses} tone="horizon" />}
          suffix="/mnd"
          testId="combined-expenses"
        />
        <FinancialCard
          icon={<Target className="h-4 w-4 text-wil-600" />}
          label="Gecomb. sparen"
          value={<MaskedAmount value={comparison.combinedMonthlySavings} tone="horizon" />}
          suffix="/mnd"
          testId="combined-savings"
        />
        <FinancialCard
          icon={<Percent className="h-4 w-4 text-amber-600" />}
          label="Spaarquote"
          value={`${comparison.combinedSavingsRate.toFixed(1)}%`}
          testId="combined-savings-rate"
        />
        <FinancialCard
          icon={<Clock className="h-4 w-4 text-horizon-600" />}
          label="Na pensioen"
          value={<MaskedAmount value={Math.round(comparison.combinedRetirementExpenses / 12)} tone="horizon" />}
          suffix="/mnd"
          testId="combined-retirement-expenses"
        />
      </div>

      {/* Partner Comparison View */}
      {hasMultiplePartners && (
        <div className="mt-6" data-testid="partner-comparison-view">
          <div className="mb-3 flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-[var(--ink-3)]" />
            <h3 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
              Partner vergelijking
            </h3>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {partners.map((partner, idx) => (
              <PartnerCard
                key={partner.userId}
                partner={partner}
                partnerIndex={idx}
                otherPartner={partners.find(p => p.userId !== partner.userId) ?? null}
                hasEntered={hasEntered}
              />
            ))}
          </div>

          {/* 3-way FIRE-jaar vergelijking (kalenderjaren, niet leeftijden) */}
          <FireAgeComparison
            combined={combined}
            partners={partners}
            combinedFireYear={combinedFireYear}
            partnerAgesAtCombinedFire={partnerAgesAtCombinedFire}
            hasEntered={hasEntered}
          />

          {/* Side-by-side comparison bars */}
          <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5" data-testid="comparison-bars">
            <h4 className="mb-4 text-xs font-semibold text-[var(--ink-3)] uppercase">Vergelijking</h4>

            <ComparisonBar
              label="Netto vermogen"
              values={partners.map(p => ({
                name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
                value: p.financials.netWorth,
                formatted: formatCurrency(p.financials.netWorth),
              }))}
              testId="comparison-net-worth"
              hasEntered={hasEntered}
            />

            <ComparisonBar
              label="Maandinkomen"
              values={partners.map(p => ({
                name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
                value: p.financials.monthlyIncome,
                formatted: formatCurrency(p.financials.monthlyIncome),
              }))}
              testId="comparison-income"
              hasEntered={hasEntered}
            />

            <ComparisonBar
              label="Spaarquote"
              values={partners.map(p => ({
                name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
                value: p.projection.savingsRate,
                formatted: `${p.projection.savingsRate.toFixed(1)}%`,
              }))}
              testId="comparison-savings-rate"
              hasEntered={hasEntered}
            />

            <ComparisonBar
              label="Vrijheidspercentage"
              values={partners.map(p => ({
                name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
                value: p.projection.freedomPercentage,
                formatted: `${p.projection.freedomPercentage.toFixed(1)}%`,
              }))}
              testId="comparison-freedom-pct"
              hasEntered={hasEntered}
            />

            <ComparisonBar
              label="FIRE leeftijd"
              values={partners.map(p => ({
                name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
                value: p.projection.fireAge ?? 0,
                formatted: p.projection.fireAge !== null ? `${Math.round(p.projection.fireAge)}j` : '-',
              }))}
              testId="comparison-fire-age"
              invertColors
              hasEntered={hasEntered}
            />
          </div>

          {/* Combined vs Individual insight — onderbouwd met de rekensom */}
          <div className="mt-4 rounded-[var(--r-lg)] border border-horizon-100 bg-horizon-50/50 p-4" data-testid="household-insight">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-horizon-500" />
              <div className="w-full min-w-0 text-sm text-horizon-800">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium">Samen sterker</p>
                  <button
                    type="button"
                    onClick={() => setShowAssumptions(v => !v)}
                    aria-expanded={showAssumptions}
                    aria-label="Uitgangspunten van de gezamenlijke berekening"
                    title="Uitgangspunten"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-horizon-700/70 transition-colors hover:text-horizon-900"
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
                {showAssumptions && (() => {
                  const withDob = partners.filter(p => p.financials.dateOfBirth)
                  const oldest = withDob.length > 0
                    ? [...withDob].sort((a, b) => (a.financials.dateOfBirth ?? '').localeCompare(b.financials.dateOfBirth ?? ''))[0]
                    : null
                  const oldestName = oldest ? (oldest.fullName ?? (oldest.isCurrentUser ? 'jij' : 'je partner')) : null
                  const ret = oldest?.settings.expectedReturn != null ? `rendement ${(oldest.settings.expectedReturn * 100).toFixed(1)}%` : null
                  const infl = oldest?.settings.inflationRate != null ? `inflatie ${(oldest.settings.inflationRate * 100).toFixed(1)}%` : null
                  const strat = oldest?.settings.fireEndStrategy
                    ? endStrategyLabel(oldest.settings.fireEndStrategy, oldest.settings.fireEndAge)
                    : null
                  const methodLabel = HOUSEHOLD_RETIREMENT_METHOD_LABELS[comparison.householdRetirementMethod] ?? comparison.householdRetirementMethod
                  const swrPct = comparison.combinedFireTarget > 0
                    ? (comparison.combinedRetirementExpenses / comparison.combinedFireTarget) * 100
                    : null
                  return (
                    <div
                      className="mt-2 rounded-[var(--r-lg)] border border-horizon-200/70 bg-[var(--paper)] p-3 text-[11px] leading-relaxed text-horizon-800/90"
                      data-testid="samen-sterker-uitgangspunten"
                    >
                      <p className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-horizon-700/70">
                        Uitgangspunten van de gezamenlijke berekening
                      </p>
                      <ul className="list-disc space-y-1.5 pl-4 marker:text-horizon-400">
                        <li>
                          De gezamenlijke projectie rekent met de instellingen van de oudste partner
                          {oldestName ? ` (${oldestName})` : ''}
                          {strat || ret || infl
                            ? `: ${[strat, ret, infl].filter(Boolean).join(' · ')}.`
                            : '.'}
                        </li>
                        <li>
                          De tijdas volgt de leeftijd van de oudste partner; de AOW van de jongste wordt
                          naar die as omgerekend (dual-AOW).
                        </li>
                        <li>
                          Het persoonlijke vermogen van beiden telt mee, plus het gedeelde vermogen —
                          dat laatste één keer.
                        </li>
                        <li>
                          Uitgave na pensioen: <strong>{methodLabel}</strong> —{' '}
                          <span className="font-mono tabular-nums">{formatCurrency(comparison.combinedRetirementExpenses)}</span>/jaar.
                          Gedeelde vaste lasten tellen één keer mee, niet dubbel.
                        </li>
                        {swrPct != null && (
                          <li>
                            Veilige onttrekking: <strong>{swrPct.toFixed(1)}%</strong> per jaar — de jaarlijkse
                            uitgave ÷ dit percentage is het FIRE-doel.
                          </li>
                        )}
                        <li>
                          Deelt een partner alleen <strong>Totalen</strong>, dan is diens bijdrage een
                          benadering; bij <strong>Volledig</strong> is alles exact.
                        </li>
                      </ul>
                    </div>
                  )
                })()}
                {combined.projection.fireAge !== null && partners.every(p => p.projection.fireAge !== null) ? (
                  (() => {
                    const indiv = comparison.individualRetirementExpenses
                    const sumIndiv = indiv.reduce((s, p) => s + p.amount, 0)
                    const verschil = sumIndiv - comparison.combinedRetirementExpenses
                    const showSum =
                      indiv.length >= 2 &&
                      indiv.every(p => p.amount > 0) &&
                      comparison.combinedRetirementExpenses > 0

                    // Eerste zin: vergelijk het GEZAMENLIJKE FIRE-jaar met ieders
                    // SOLO FIRE-jaar (niet leeftijd-rekenkunde tussen verschillende
                    // mensen). Per partner bepalen of het gezamenlijke pad voor hen
                    // eerder of later valt dan solo.
                    const partnerYears = partners.map(p => {
                      const m = p.projection.fireDate?.match(/\b(20\d{2})\b/)
                      return {
                        name: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
                        soloYear: m ? Number(m[1]) : null,
                      }
                    })
                    const earlierForHousehold = combinedFireYear != null
                      ? partnerYears.filter(p => p.soloYear != null && combinedFireYear < p.soloYear)
                      : []
                    const laterForHousehold = combinedFireYear != null
                      ? partnerYears.filter(p => p.soloYear != null && combinedFireYear > p.soloYear)
                      : []
                    // Bouw een feitelijke zin op basis van wat we betrouwbaar weten.
                    let firstSentence: string
                    if (combinedFireYear == null) {
                      firstSentence = 'Door jullie vermogen en inkomen te bundelen verschuift voor ieder het moment waarop je kunt stoppen.'
                    } else if (earlierForHousehold.length > 0 && laterForHousehold.length > 0) {
                      firstSentence = `Samen kunnen jullie stoppen in ${combinedFireYear} — ${laterForHousehold[0]!.name} iets later en ${earlierForHousehold[0]!.name} eerder dan solo.`
                    } else if (earlierForHousehold.length > 0 && laterForHousehold.length === 0) {
                      firstSentence = `Samen kunnen jullie stoppen in ${combinedFireYear} — voor ${earlierForHousehold.map(p => p.name).join(' en ')} eerder dan solo, door jullie vermogen en inkomen te bundelen.`
                    } else if (laterForHousehold.length > 0 && earlierForHousehold.length === 0) {
                      firstSentence = `Samen kunnen jullie stoppen in ${combinedFireYear} — voor ${laterForHousehold.map(p => p.name).join(' en ')} iets later dan solo, maar dan stoppen jullie wél samen.`
                    } else {
                      firstSentence = `Samen kunnen jullie stoppen in ${combinedFireYear}; door jullie vermogen en inkomen te bundelen verschuift voor ieder het moment waarop je kunt stoppen.`
                    }

                    // Tweede zin: hangt af van de gekozen uitgave-na-pensioen-methode.
                    // De oude tekst klopte alleen bij `auto_shared` (gedeelde lasten
                    // tellen één keer). Bij `sum_partners` tellen ze juist dubbel.
                    const reasonSentence =
                      comparison.householdRetirementMethod === 'sum_partners'
                        ? 'Jullie uitgave ná pensioen is hier de optelsom van beide partners; het gezamenlijke pad bundelt jullie vermogen en inkomen, maar de gedeelde lasten tellen dan dubbel.'
                        : comparison.householdRetirementMethod === 'custom_amount'
                          ? 'Jullie hebben de gezamenlijke uitgave ná pensioen zelf ingesteld.'
                          : 'De reden zit in de uitgaven ná pensioen: gedeelde vaste lasten draag je samen, dus die tellen in het huishouden maar één keer mee in plaats van twee keer.'

                    return (
                      <>
                        <p className="mt-1 text-horizon-700/80">
                          {firstSentence}
                        </p>
                        <p className="mt-1.5 text-xs leading-relaxed text-horizon-700/70">
                          {reasonSentence}
                        </p>

                        {/* De rekensom: uitgaven ná pensioen, apart vs samen (per jaar) */}
                        {showSum && (
                          <div
                            className="mt-3 rounded-[var(--r-lg)] border border-horizon-200/70 bg-[var(--paper)] p-3"
                            data-testid="samen-sterker-rekensom"
                          >
                            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-horizon-700/70">
                              Uitgaven ná pensioen · per jaar
                            </p>
                            <dl className="mt-2 space-y-1">
                              {indiv.map((p) => (
                                <div key={p.userId} className="flex items-baseline justify-between gap-3">
                                  <dt className="text-xs text-horizon-800/80">{p.fullName ?? 'Partner'} — apart</dt>
                                  <dd className="font-mono tabular-nums text-xs text-horizon-800">{formatCurrency(p.amount)}</dd>
                                </div>
                              ))}
                              <div className="flex items-baseline justify-between gap-3 border-t border-horizon-200/70 pt-1">
                                <dt className="text-xs text-horizon-800/80">Twee aparte huishoudens</dt>
                                <dd className="font-mono tabular-nums text-xs text-horizon-800">{formatCurrency(sumIndiv)}</dd>
                              </div>
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-xs font-medium text-horizon-900">Samen als huishouden</dt>
                                <dd className="font-mono tabular-nums text-xs font-semibold text-horizon-900">
                                  <span className="bg-[linear-gradient(transparent_60%,var(--color-horizon-200)_60%)] px-0.5">
                                    {formatCurrency(comparison.combinedRetirementExpenses)}
                                  </span>
                                </dd>
                              </div>
                              {/* Actieve methode + aanpas-affordance */}
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="text-[10px] italic text-horizon-700/60">
                                  {comparison.householdRetirementMethod === 'auto_shared'
                                    ? 'automatisch (gedeelde lasten 1×)'
                                    : comparison.householdRetirementMethod === 'sum_partners'
                                      ? 'som van de 2'
                                      : 'eigen bedrag'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setRetireOpen(true)}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-horizon-700 hover:text-horizon-900"
                                >
                                  <Settings2 className="h-3 w-3" aria-hidden />
                                  Aanpassen
                                </button>
                              </div>
                              {verschil > 0 && (
                                <div className="flex items-baseline justify-between gap-3 border-t-2 border-double border-horizon-300 pt-1">
                                  <dt className="text-xs font-medium text-horizon-900">Verschil — samen minder</dt>
                                  <dd className="font-mono tabular-nums text-xs font-semibold text-positive">
                                    −{formatCurrency(verschil)}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        )}

                        {/* Welke kosten tellen maar één keer mee? */}
                        {comparison.sharedEssentialBudgets.length > 0 && (
                          <div className="mt-3" data-testid="samen-sterker-gedeelde-lasten">
                            <p className="text-xs font-medium text-horizon-900">Welke kosten tel je samen maar één keer?</p>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-horizon-700/70">
                              Dit komt vooral doordat je deze gedeelde vaste lasten samen draagt — in het huishouden tellen ze één keer mee:
                            </p>
                            <ul className="mt-1.5 space-y-0.5">
                              {comparison.sharedEssentialBudgets.map((b, i) => (
                                <li key={i} className="flex items-baseline justify-between gap-3">
                                  <span className="text-xs text-horizon-800/80">{b.name}</span>
                                  <span className="font-mono tabular-nums text-xs text-horizon-800">
                                    {formatCurrency(b.yearlyAmount)}
                                    <span className="text-horizon-700/50">/jaar</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {comparison.sharedEssentialYearly > 0 && (
                              <p className="mt-1.5 text-[11px] text-horizon-700/70">
                                Samen{' '}
                                <span className="font-mono tabular-nums font-medium text-horizon-900">
                                  {formatCurrency(comparison.sharedEssentialYearly)}/jaar
                                </span>{' '}
                                die je één keer opzij zet in plaats van dubbel.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )
                  })()
                ) : (
                  <p className="mt-1 text-horizon-700/80">
                    {`Jullie gecombineerde netto vermogen is ${formatCurrency(comparison.combinedNetWorth)}, dat is ${comparison.combinedFreedomPercentage.toFixed(1)}% richting volledige vrijheid voor het huishouden.`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Aanpas-pane voor de huishoud-brede uitgave ná pensioen.
              Alleen gemount in de multi-partner-tak waar `comparison` zinvol is. */}
          <HouseholdRetirementPane
            open={retireOpen}
            onClose={() => setRetireOpen(false)}
            candidates={comparison.householdRetirementCandidates}
            currentMethod={comparison.householdRetirementMethod}
            onSaved={() => {
              loadData()
              refreshData()
            }}
          />
        </div>
      )}

      {/* Single partner info */}
      {!hasMultiplePartners && partners.length === 1 && (
        <div className="mt-4 rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-5 text-center" data-testid="single-partner-notice">
          <Users className="mx-auto mb-2 h-6 w-6 text-[var(--ink-3)]" />
          <p className="text-sm font-medium text-[var(--ink-2)]">
            Partner vergelijking wordt beschikbaar zodra je partner het huishouden heeft geaccepteerd.
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Nodig je partner uit via je profiel om samen je pad naar vrijheid te plannen.
          </p>
        </div>
      )}
      </div>
    </section>
  )
}

// ── Helper Components ────────────────────────────────────

function FireAgeComparison({
  combined,
  partners,
  combinedFireYear,
  partnerAgesAtCombinedFire,
  hasEntered,
}: {
  combined: { projection: FireProjectionData }
  partners: PartnerProjection[]
  /** Kalenderjaar waarin het huishouden samen kan stoppen (null = niet haalbaar). */
  combinedFireYear: number | null
  /** Leeftijd van elke partner in `combinedFireYear` (voor de sub-line van de gezamenlijke kaart). */
  partnerAgesAtCombinedFire: Array<{ name: string; age: number }>
  hasEntered: boolean
}) {
  // Parse het SOLO FIRE-jaar van een partner uit z'n fireDate (bv. "jun 2042").
  function parseYear(fireDate: string): number | null {
    const m = fireDate?.match(/\b(20\d{2})\b/)
    return m ? Number(m[1]) : null
  }

  // Vergelijk KALENDERJAREN (niet leeftijden): per partner z'n solo-jaar, plus
  // het gezamenlijke jaar. Elke kaart toont een jaar als hoofdgetal en de
  // bijbehorende leeftijd(en) op de sub-line.
  type Entry = { label: string; year: number | null; subLabel: string; color: string; isCombined?: boolean }
  const entries: Entry[] = [
    ...partners.map((p, i): Entry => {
      const name = p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner')
      const soloAge = p.projection.fireAge !== null ? Math.round(p.projection.fireAge) : null
      return {
        label: name,
        year: parseYear(p.projection.fireDate),
        subLabel: soloAge !== null ? `${name} is dan ${soloAge}` : 'niet haalbaar',
        color: i === 0 ? 'horizon' : 'wil',
      }
    }),
    {
      label: 'Gezamenlijk',
      year: combinedFireYear,
      subLabel: partnerAgesAtCombinedFire.length > 0
        ? partnerAgesAtCombinedFire.map(pa => `${pa.name} ${pa.age}`).join(' · ')
        : 'niet haalbaar',
      color: 'emerald',
      isCombined: true,
    },
  ]

  // Vroegste én laatste JAAR (voor de "Vroegst"-badge en de relatieve balk).
  const validYears = entries.filter(e => e.year !== null).map(e => e.year as number)
  const earliestYear = validYears.length > 0 ? Math.min(...validYears) : null
  const maxYear = validYears.length > 0 ? Math.max(...validYears) : null

  const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    horizon: { bg: 'bg-horizon-50', border: 'border-horizon-300', text: 'text-horizon-700', badge: 'bg-horizon-100 text-horizon-700' },
    wil: { bg: 'bg-wil-50', border: 'border-wil-300', text: 'text-wil-700', badge: 'bg-wil-100 text-wil-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  }

  return (
    <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5" data-testid="fire-age-comparison">
      <div className="mb-1 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-[var(--ink-3)]" />
        <h4 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          Wanneer kan iedereen stoppen?
        </h4>
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-[var(--ink-3)]">
        Een gezamenlijk jaar waarop jullie allebei kunnen stoppen — ieder met de eigen leeftijd op dat moment.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {entries.map((entry) => {
          const colors = colorMap[entry.color] ?? colorMap.horizon
          // Vroegst = het laagste (eerste) JAAR onder de drie.
          const isEarliest = entry.year !== null && earliestYear !== null && entry.year === earliestYear
          const yearsLater = entry.year !== null && earliestYear !== null
            ? entry.year - earliestYear
            : null

          return (
            <div
              key={entry.label}
              className={`relative rounded-[var(--r-lg)] border-2 p-4 transition-all ${
                isEarliest ? `${colors.border} ${colors.bg} ring-2 ring-offset-1 ring-emerald-200` : 'border-[var(--border-ed)] bg-[var(--subtle)]/20'
              }`}
              data-testid={`fire-age-entry-${entry.isCombined ? 'combined' : entry.label.toLowerCase()}`}
              title={entry.isCombined ? 'Berekend op basis van gecombineerd vermogen, inkomsten en uitgaven van het huishouden' : undefined}
            >
              {/* Vroegst-badge — op basis van het eerste KALENDERJAAR. */}
              {isEarliest && (
                <span className={`absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${colors.badge}`}>
                  ✦ Vroegst
                </span>
              )}

              <p className="mb-1 text-[10px] font-medium text-[var(--ink-3)] uppercase">{entry.label}</p>

              {/* Hoofdgetal = KALENDERJAAR (niet leeftijd). */}
              <p className={`font-mono text-3xl font-bold tabular-nums ${isEarliest ? colors.text : 'text-[var(--ink)]'}`}>
                {entry.year !== null ? entry.year : '-'}
              </p>
              {/* Sub-line = leeftijd(en) op dat moment. */}
              <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                {entry.year !== null ? entry.subLabel : 'niet haalbaar'}
              </p>

              {/* Verschil t.o.v. het vroegste jaar. */}
              {yearsLater !== null && yearsLater > 0 && (
                <p className="mt-2 text-[10px] text-[var(--ink-4)]">
                  +{yearsLater} jaar t.o.v. vroegste
                </p>
              )}

              {/* Relatieve balk: vroeger jaar = vollere balk. */}
              {maxYear !== null && earliestYear !== null && entry.year !== null && maxYear > earliestYear && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
                  <div
                    className={`h-full rounded-full ${isEarliest ? 'bg-emerald-400' : 'bg-[var(--border-md)]'}`}
                    style={{
                      width: hasEntered
                        ? `${Math.max(100 - ((entry.year - earliestYear) / (maxYear - earliestYear)) * 100, 5)}%`
                        : '0%',
                      transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1)' : 'none',
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FinancialCard({
  icon, label, value, suffix, testId,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  suffix?: string
  testId: string
}) {
  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-3" data-testid={testId}>
      <div className="mb-1 flex items-center gap-1.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--subtle)]">
          {icon}
        </div>
        <p className="text-[10px] font-medium text-[var(--ink-3)]">{label}</p>
      </div>
      <p className="font-mono tabular-nums text-sm font-bold text-[var(--ink)]">
        {value}{suffix && <span className="text-xs font-normal text-[var(--ink-3)]">{suffix}</span>}
      </p>
    </div>
  )
}

const RETIREMENT_METHOD_LABELS: Record<string, string> = {
  essential_budgets: 'Essentiële budgetten',
  custom_amount: 'Aangepast bedrag',
  current_expenses: 'Huidige uitgaven',
  current_income: 'Behoud van inkomen',
  percentage_income: '% van inkomen',
}

/** Labels voor de huishoud-brede uitgave-na-pensioen-methode (i bij "Samen sterker"). */
const HOUSEHOLD_RETIREMENT_METHOD_LABELS: Record<string, string> = {
  auto_shared: 'Automatisch — gedeelde vaste lasten één keer',
  sum_partners: 'Som van beide individuele uitgaven',
  custom_amount: 'Zelf samengesteld bedrag',
}

function endStrategyLabel(strategy: string, endAge: number | null): string {
  switch (strategy) {
    case 'perpetual': return 'Eeuwigdurend'
    case 'legacy': return 'Nalaten'
    case 'deplete': return endAge ? `Opmaken (${endAge})` : 'Opmaken'
    default: return strategy
  }
}

/** Compacte instellingen-chip voor de partner-vergelijking. */
function SettingChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ink-2)]">
      <span className="text-[var(--ink-4)]">{label}:</span>
      <span className="font-medium">{value}</span>
    </span>
  )
}

function PartnerCard({
  partner,
  partnerIndex,
  otherPartner,
  hasEntered,
}: {
  partner: PartnerProjection
  partnerIndex: number
  otherPartner: PartnerProjection | null
  hasEntered: boolean
}) {
  const colors = partnerIndex === 0
    ? { border: 'border-horizon-200', bg: 'bg-horizon-50/30', accent: 'text-horizon-700', icon: 'bg-horizon-100 text-horizon-600', bar: 'from-horizon-600 to-horizon-400' }
    : { border: 'border-wil-200', bg: 'bg-wil-50/30', accent: 'text-wil-700', icon: 'bg-wil-100 text-wil-600', bar: 'from-wil-600 to-wil-400' }

  const name = partner.fullName ?? (partner.isCurrentUser ? 'Jij' : 'Partner')

  // Partner verbergt z'n toekomstgegevens → geen cijfers tonen, alleen melding.
  if (partner.futureHidden) {
    return (
      <div
        className={`rounded-[var(--r-lg)] border ${colors.border} ${colors.bg} p-5`}
        data-testid={`partner-card-${partner.isCurrentUser ? 'self' : 'other'}`}
      >
        <div className="mb-3 flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.icon}`}>
            <User className="h-4 w-4" />
          </div>
          <p className={`text-sm font-semibold ${colors.accent}`}>{name}</p>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3" data-testid="partner-future-hidden">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-4)]" aria-hidden />
          <p className="text-xs text-[var(--ink-3)] leading-relaxed">
            {name} deelt geen toekomstgegevens met het huishouden. Instellingen,
            gebeurtenissen en FIRE-projectie zijn verborgen.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-[var(--r-lg)] border ${colors.border} ${colors.bg} p-5`}
      data-testid={`partner-card-${partner.isCurrentUser ? 'self' : 'other'}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.icon}`}>
          <User className="h-4 w-4" />
        </div>
        <div>
          <p className={`text-sm font-semibold ${colors.accent}`}>{name}</p>
          {partner.isCurrentUser && (
            <span className="text-[10px] text-[var(--ink-3)]">jouw projectie</span>
          )}
        </div>
      </div>

      {/* Individual FIRE KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">FIRE leeftijd</p>
          <p className={`text-xl font-bold ${colors.accent}`} data-testid={`partner-fire-age-${partner.isCurrentUser ? 'self' : 'other'}`}>
            {partner.projection.fireAge !== null ? Math.round(partner.projection.fireAge) : '-'}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Vrijheid</p>
          <p className={`text-xl font-bold ${colors.accent}`} data-testid={`partner-freedom-pct-${partner.isCurrentUser ? 'self' : 'other'}`}>
            {partner.projection.freedomPercentage.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">FIRE-doel</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {<MaskedAmount value={partner.projection.fireTarget} tone="horizon" />}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Spaarquote</p>
          <p className="font-mono tabular-nums text-sm font-semibold text-[var(--ink-2)]">
            {partner.projection.savingsRate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${colors.bar}`}
            style={{
              width: hasEntered ? `${Math.max(Math.min(partner.projection.freedomPercentage, 100), 0)}%` : '0%',
              transition: hasEntered ? 'width 1000ms cubic-bezier(.22,1,.36,1)' : 'none',
            }}
          />
        </div>
        <div className="mt-0.5 flex justify-between text-[9px] text-[var(--ink-3)]">
          <span>{partner.projection.fireDate}</span>
          <span>
            {partner.projection.freedomYears}j {partner.projection.freedomMonths}mnd vrijheid
          </span>
        </div>
      </div>

      {/* Financial details */}
      <div className="mt-3 space-y-1.5 text-xs text-[var(--ink-2)]">
        <div className="flex justify-between">
          <span>Netto vermogen</span>
          <span className="font-mono tabular-nums font-medium">{<MaskedAmount value={partner.financials.netWorth} tone="horizon" />}</span>
        </div>
        <div className="flex justify-between">
          <span>Inkomen/mnd</span>
          <span className="font-mono tabular-nums font-medium">{<MaskedAmount value={partner.financials.monthlyIncome} tone="horizon" />}</span>
        </div>
        <div className="flex justify-between">
          <span>Uitgaven/mnd</span>
          <span className="font-mono tabular-nums font-medium">{<MaskedAmount value={partner.financials.monthlyExpenses} tone="horizon" />}</span>
        </div>
        {partner.financials.sharedAssetsValue > 0 && (
          <div className="flex justify-between text-horizon-600/70">
            <span>Gedeeld vermogen (aandeel)</span>
            <span className="font-mono tabular-nums font-medium">{<MaskedAmount value={partner.financials.sharedAssetsValue} tone="horizon" />}</span>
          </div>
        )}
      </div>

      {/* Compacte instellingen + levensgebeurtenissen (klein weergegeven) */}
      <div className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-2.5">
        <div>
          <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">Instellingen</p>
          <div className="flex flex-wrap gap-1" data-testid={`partner-settings-${partner.isCurrentUser ? 'self' : 'other'}`}>
            {partner.settings.currentAge !== null && <SettingChip label="Leeftijd" value={`${partner.settings.currentAge} jr`} />}
            {partner.settings.expectedReturn !== null && <SettingChip label="Rendement" value={`${(partner.settings.expectedReturn * 100).toFixed(1)}%`} />}
            {partner.settings.inflationRate !== null && <SettingChip label="Inflatie" value={`${(partner.settings.inflationRate * 100).toFixed(1)}%`} />}
            {partner.settings.retirementExpenseMethod && (
              <SettingChip label="Pensioenuitgaven" value={RETIREMENT_METHOD_LABELS[partner.settings.retirementExpenseMethod] ?? partner.settings.retirementExpenseMethod} />
            )}
            {partner.settings.fireEndStrategy && (
              <SettingChip label="Einde" value={endStrategyLabel(partner.settings.fireEndStrategy, partner.settings.fireEndAge)} />
            )}
          </div>
        </div>
        {partner.lifeEvents.length > 0 && (
          <div>
            <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--ink-4)]">Gebeurtenissen</p>
            <div className="flex flex-wrap gap-1" data-testid={`partner-events-${partner.isCurrentUser ? 'self' : 'other'}`}>
              {partner.lifeEvents.map(ev => (
                <span
                  key={ev.id}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-1.5 py-0.5 text-[10px] text-[var(--ink-2)]"
                >
                  {ev.ownership === 'shared' && <Users className="h-2.5 w-2.5 text-kern-600" aria-hidden />}
                  {ev.name}{ev.targetAge != null ? ` · ${ev.targetAge}j` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ComparisonBar({
  label,
  values,
  testId,
  invertColors = false,
}: {
  label: string
  values: Array<{ name: string; value: number; formatted: string }>
  testId: string
  invertColors?: boolean
  /** @deprecated balken renderen nu direct (niet meer achter een in-view-flag). */
  hasEntered?: boolean
}) {
  const maxValue = Math.max(...values.map(v => Math.abs(v.value)), 1)
  // Winnaar = hoogste waarde, of laagste bij "lager is beter" (FIRE-leeftijd).
  const best = invertColors
    ? Math.min(...values.map(v => v.value))
    : Math.max(...values.map(v => v.value))
  const allEqual = values.every(v => v.value === values[0]?.value)

  return (
    <div className="mb-4 last:mb-0" data-testid={testId}>
      <p className="mb-2 text-xs font-medium text-[var(--ink-3)]">{label}</p>
      <div className="space-y-2">
        {values.map((v, i) => {
          const pct = Math.max((Math.abs(v.value) / maxValue) * 100, 3)
          const isWinner = !allEqual && v.value === best
          const barColor = i === 0 ? 'bg-horizon-500' : 'bg-wil-500'

          return (
            <div key={v.name} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-xs text-[var(--ink-2)]">{v.name}</span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--subtle)]">
                <div
                  className={`h-full rounded-md ${barColor} ${isWinner ? '' : 'opacity-50'} transition-[width] duration-700 ease-out`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span
                className={`w-24 shrink-0 text-right font-mono text-xs tabular-nums ${
                  isWinner ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-3)]'
                }`}
              >
                {v.formatted}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HouseholdFireSection
