'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { formatFireAge } from '@/lib/horizon-data'
import { usePerspective } from '@/components/app/perspective-provider'
import { SPLIT_MODE_LABELS, type SplitMode } from '@/lib/household-data'
import {
  Users, TrendingUp, Hourglass, Percent, Target, User,
  ArrowRight, Clock, PiggyBank, Wallet, Info, Settings2,
} from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'

// Types matching the API response
interface PartnerFinancials {
  userId: string
  fullName: string | null
  isCurrentUser: boolean
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  monthlyContributions: number
  yearlyMustExpenses: number
  dateOfBirth: string | null
  netWorth: number
  sharedAssetsValue: number
  sharedDebtsValue: number
}

interface FireProjectionData {
  fireTarget: number
  netWorth: number
  freedomPercentage: number
  fireAge: number | null
  currentAge: number | null
  fireDate: string
  countdownDays: number
  freedomYears: number
  freedomMonths: number
  monthlyPassiveIncome: number
  monthlySavings: number
  savingsRate: number
}

interface PartnerProjection {
  userId: string
  fullName: string | null
  isCurrentUser: boolean
  financials: PartnerFinancials
  projection: FireProjectionData
}

interface HouseholdFireData {
  hasHousehold: boolean
  householdName: string
  splitMode: SplitMode
  customSplitPct: number | null
  combined: {
    projection: FireProjectionData
  }
  partners: PartnerProjection[]
  comparison: {
    combinedNetWorth: number
    combinedMonthlyIncome: number
    combinedMonthlyExpenses: number
    combinedMonthlySavings: number
    combinedSavingsRate: number
    combinedFireTarget: number
    combinedFreedomPercentage: number
    sharedFireTarget: number
    individualFireTargets: Array<{
      userId: string
      fullName: string | null
      fireTarget: number
      fireAge: number | null
      freedomPercentage: number
    }>
  }
}

/**
 * HouseholdFireSection - Displays combined and individual FIRE projections
 * for household members. Shows side-by-side partner comparison.
 *
 * Renders on /horizon page when user has a household.
 */
export function HouseholdFireSection() {
  const [data, setData] = useState<HouseholdFireData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { perspective } = usePerspective()

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/household/fire-projections')
      if (!res.ok) {
        if (res.status === 401) {
          setData(null)
          return
        }
        throw new Error('Kon huishoudgegevens niet laden')
      }
      const json = await res.json()
      if (!json.hasHousehold) {
        setData(null)
        return
      }
      setData(json)
    } catch (err) {
      console.error('Error loading household FIRE data:', err)
      setError('Kon huishouden FIRE-gegevens niet laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 1100 })
  const currentUserPartner = partners.find(p => p.isCurrentUser)
  const splitLabel = SPLIT_MODE_LABELS[splitMode] ?? splitMode

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

          {/* Combined FIRE Age */}
          <div>
            <p className="text-[10px] font-medium text-horizon-600/50 uppercase">FIRE leeftijd</p>
            <p className="text-2xl font-bold text-horizon-700" data-testid="combined-fire-age">
              {combined.projection.fireAge !== null ? Math.round(combined.projection.fireAge) : '-'}
            </p>
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
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="household-combined-financials">
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

          {/* 3-way FIRE Age Comparison */}
          <FireAgeComparison
            combined={combined}
            partners={partners}
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

          {/* Combined vs Individual insight */}
          <div className="mt-4 rounded-[var(--r-lg)] border border-horizon-100 bg-horizon-50/50 p-4" data-testid="household-insight">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-horizon-500" />
              <div className="text-sm text-horizon-800">
                <p className="font-medium">Samen sterker</p>
                <p className="mt-1 text-horizon-700/80">
                  {combined.projection.fireAge !== null && partners.every(p => p.projection.fireAge !== null) ? (
                    (() => {
                      const avgIndividual = partners.reduce((sum, p) => sum + (p.projection.fireAge ?? 0), 0) / partners.length
                      const diff = Math.round(avgIndividual - combined.projection.fireAge!)
                      if (diff > 0) {
                        return `Als huishouden bereiken jullie FIRE ${diff} jaar eerder dan het gemiddelde van jullie individuele projecties. Samenwerking loont!`
                      } else if (diff < 0) {
                        return `De individuele FIRE-doelen liggen dichter bij dan het gezamenlijke doel. Overweeg om uitgaven te optimaliseren als huishouden.`
                      }
                      return `Jullie gezamenlijke en individuele FIRE-leeftijden liggen dicht bij elkaar.`
                    })()
                  ) : (
                    `Jullie gecombineerde netto vermogen is ${formatCurrency(comparison.combinedNetWorth)}, dat is ${comparison.combinedFreedomPercentage.toFixed(1)}% richting volledige vrijheid voor het huishouden.`
                  )}
                </p>
              </div>
            </div>
          </div>
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
  hasEntered,
}: {
  combined: { projection: FireProjectionData }
  partners: PartnerProjection[]
  hasEntered: boolean
}) {
  // Build entries: each partner + combined
  type Entry = { label: string; fireAge: number | null; fireDate: string; color: string; isCombined?: boolean }
  const entries: Entry[] = [
    ...partners.map((p, i) => ({
      label: p.fullName ?? (p.isCurrentUser ? 'Jij' : 'Partner'),
      fireAge: p.projection.fireAge,
      fireDate: p.projection.fireDate,
      color: i === 0 ? 'horizon' : 'wil',
    })),
    {
      label: 'Gezamenlijk',
      fireAge: combined.projection.fireAge,
      fireDate: combined.projection.fireDate,
      color: 'emerald',
      isCombined: true,
    },
  ]

  // Find the earliest FIRE age (best)
  const validAges = entries.filter(e => e.fireAge !== null).map(e => e.fireAge as number)
  const earliestAge = validAges.length > 0 ? Math.min(...validAges) : null
  const maxAge = validAges.length > 0 ? Math.max(...validAges) : null

  const colorMap: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    horizon: { bg: 'bg-horizon-50', border: 'border-horizon-300', text: 'text-horizon-700', badge: 'bg-horizon-100 text-horizon-700' },
    wil: { bg: 'bg-wil-50', border: 'border-wil-300', text: 'text-wil-700', badge: 'bg-wil-100 text-wil-700' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  }

  return (
    <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5" data-testid="fire-age-comparison">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-[var(--ink-3)]" />
        <h4 className="text-xs font-semibold tracking-[0.15em] text-[var(--ink-3)] uppercase">
          FIRE-leeftijd vergelijking
        </h4>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {entries.map((entry) => {
          const colors = colorMap[entry.color] ?? colorMap.horizon
          const isEarliest = entry.fireAge !== null && earliestAge !== null && Math.round(entry.fireAge) === Math.round(earliestAge)
          const diffMonths = entry.fireAge !== null && earliestAge !== null
            ? Math.round((entry.fireAge - earliestAge) * 12)
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
              {/* Earliest badge */}
              {isEarliest && (
                <span className={`absolute -top-2.5 right-3 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${colors.badge}`}>
                  ✦ Vroegst
                </span>
              )}

              <p className="mb-1 text-[10px] font-medium text-[var(--ink-3)] uppercase">{entry.label}</p>

              <p className={`font-mono text-3xl font-bold tabular-nums ${isEarliest ? colors.text : 'text-[var(--ink)]'}`}>
                {entry.fireAge !== null ? Math.round(entry.fireAge) : '-'}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                {entry.fireAge !== null ? 'jaar' : 'niet haalbaar'}
              </p>

              {/* Difference from earliest */}
              {diffMonths !== null && diffMonths > 0 && (
                <p className="mt-2 text-[10px] text-[var(--ink-4)]">
                  +{Math.floor(diffMonths / 12)}j {diffMonths % 12}mnd t.o.v. vroegste
                </p>
              )}

              {/* FIRE date */}
              <p className="mt-1 text-[10px] text-[var(--ink-4)]">{entry.fireDate}</p>

              {/* Visual bar representing relative fire age */}
              {maxAge !== null && earliestAge !== null && entry.fireAge !== null && maxAge > earliestAge && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
                  <div
                    className={`h-full rounded-full ${isEarliest ? 'bg-emerald-400' : 'bg-[var(--border-md)]'}`}
                    style={{
                      width: hasEntered
                        ? `${Math.max(100 - ((entry.fireAge - earliestAge) / (maxAge - earliestAge)) * 100, 5)}%`
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
    </div>
  )
}

function ComparisonBar({
  label,
  values,
  testId,
  invertColors = false,
  hasEntered,
}: {
  label: string
  values: Array<{ name: string; value: number; formatted: string }>
  testId: string
  invertColors?: boolean
  hasEntered: boolean
}) {
  const maxValue = Math.max(...values.map(v => Math.abs(v.value)), 1)

  return (
    <div className="mb-4 last:mb-0" data-testid={testId}>
      <p className="mb-1.5 text-xs font-medium text-[var(--ink-3)]">{label}</p>
      <div className="space-y-1.5">
        {values.map((v, i) => {
          const pct = maxValue > 0 ? (Math.abs(v.value) / maxValue) * 100 : 0
          const isLeading = Math.abs(v.value) >= Math.abs(values[1 - i]?.value ?? 0)
          const barColor = invertColors
            ? (isLeading ? 'bg-amber-400' : 'bg-emerald-400')
            : (i === 0 ? 'bg-horizon-400' : 'bg-wil-400')

          return (
            <div key={v.name} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-[var(--ink-3)] truncate">{v.name}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-[var(--border-ed)]">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{
                    width: hasEntered ? `${Math.max(pct, 2)}%` : '0%',
                    transition: hasEntered ? `width 700ms cubic-bezier(.22,1,.36,1) ${i * 80}ms` : 'none',
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-medium text-[var(--ink-2)]">{v.formatted}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HouseholdFireSection
