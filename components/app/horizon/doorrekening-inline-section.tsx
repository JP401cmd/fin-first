'use client'

/**
 * DoorrekeningInlineSection — collapsible inline embedding of the doorrekening
 * perspectives (Opbouw | Afbouw | Overzicht) directly on the /horizon page.
 *
 * Uses dynamic imports to lazy-load the tab content panels and wraps them in
 * the DoorrekeningSettingsProvider so the shared useDoorrekeningSettings()
 * context is available. Only renders when simResult exists and currentAge is
 * known (sufficient data for projections).
 *
 * Feature #796 — "Tijdas toont doorrekening resultaten inline"
 */

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import {
  DoorrekeningSettingsProvider,
  type DoorrekeningDefaults,
} from '@/app/(app)/horizon/doorrekening-test/settings-context'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { FireParams } from '@/lib/fire-params'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { LifeEvent } from '@/lib/horizon-data'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Lazy-loaded tab content panels ─────────────────────────────────

const OpbouwClient = dynamic(
  () =>
    import('@/app/(app)/horizon/doorrekening-test/opbouw/opbouw-client').then(
      (m) => ({ default: m.OpbouwClient }),
    ),
  {
    ssr: false,
    loading: () => <TabSkeleton />,
  },
)

const AfbouwClient = dynamic(
  () =>
    import('@/app/(app)/horizon/doorrekening-test/afbouw/afbouw-client').then(
      (m) => ({ default: m.AfbouwClient }),
    ),
  {
    ssr: false,
    loading: () => <TabSkeleton />,
  },
)

const OverzichtClient = dynamic(
  () =>
    import('@/app/(app)/horizon/doorrekening-test/overzicht/overzicht-client').then(
      (m) => ({ default: m.OverzichtClient }),
    ),
  {
    ssr: false,
    loading: () => <TabSkeleton />,
  },
)

// ── Skeleton placeholder while dynamic imports load ────────────────

function TabSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-6">
      <div className="h-4 w-1/3 rounded bg-[var(--subtle)]" />
      <div className="h-32 w-full rounded-lg bg-[var(--subtle)]" />
      <div className="h-4 w-2/3 rounded bg-[var(--subtle)]" />
      <div className="h-4 w-1/2 rounded bg-[var(--subtle)]" />
    </div>
  )
}

// ── Tab definitions ────────────────────────────────────────────────

type TabKey = 'opbouw' | 'afbouw' | 'overzicht'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'opbouw', label: 'Opbouw' },
  { key: 'afbouw', label: 'Afbouw' },
  { key: 'overzicht', label: 'Overzicht' },
]

// ── Props interface ────────────────────────────────────────────────

export interface DoorrekeningInlineProps {
  assets: Asset[]
  debts: Debt[]
  lifeEvents: LifeEvent[]
  fireParams: FireParams
  fireStrategy: { strategy: FireEndStrategy; endAge: number; legacyAmount: number }
  netWorth: number
  totalAssets: number
  totalDebts: number
  yearlyMustExpenses: number
  cashflows: SimCashflow[]
  userAowAge: number
  weightedGrossReturn: number
  currentAge: number | null
  savingsRate6m: number
  estimatedYearlyIncome: number
  profile: Record<string, unknown> | null
}

// ── Main component ─────────────────────────────────────────────────

export function DoorrekeningInlineSection({
  assets,
  debts,
  lifeEvents,
  fireParams,
  fireStrategy,
  netWorth,
  totalAssets,
  totalDebts,
  yearlyMustExpenses,
  cashflows,
  userAowAge,
  weightedGrossReturn,
  currentAge,
  savingsRate6m,
  estimatedYearlyIncome,
  profile,
}: DoorrekeningInlineProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overzicht')

  // Gate: only show when we have sufficient data for projections
  if (currentAge == null) return null

  // Derive defaults for the DoorrekeningSettingsProvider from the user's
  // active fire strategy configuration
  const defaults: DoorrekeningDefaults = {
    endStrategy: fireStrategy.strategy,
    endAge: fireStrategy.endAge,
    legacyAmount: fireStrategy.legacyAmount,
  }

  return (
    <section className="mt-5 sm:mt-8">
      <CollapsibleSection
        storageKey="doorrekening-inline"
        title="Doorrekening"
        summary="Gedetailleerde projectie per fase: opbouw, afbouw en overzicht"
        defaultOpen={false}
        icon={
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: 'var(--module-active-700)' }}
          >
            DR
          </span>
        }
      >
        {/* Kicker — editorial horizon styling */}
        <div className="mb-4 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Horizon · doorrekening
        </div>

        {/* Segmented control (tabs) */}
        <div className="mb-5 border-b border-[var(--border-ed)]">
          <nav className="-mb-px flex gap-1" aria-label="Doorrekening perspectief">
            {TABS.map((tab) => {
              const active = tab.key === activeTab
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`whitespace-nowrap border-b-2 px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                    active
                      ? 'text-[var(--module-active-700)]'
                      : 'border-transparent text-[var(--ink-3)] hover:text-[var(--module-active-700)]'
                  }`}
                  style={active ? { borderColor: 'var(--module-active-500)' } : undefined}
                  aria-selected={active}
                  role="tab"
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Tab content wrapped in settings provider */}
        <DoorrekeningSettingsProvider defaults={defaults}>
          <div role="tabpanel" aria-label={`${activeTab} perspectief`}>
            {activeTab === 'opbouw' && (
              <OpbouwClient
                assets={assets}
                debts={debts}
                profile={profile}
                fireParams={fireParams}
                cashflows={cashflows}
                lifeEvents={lifeEvents}
                savingsRate6m={savingsRate6m}
                estimatedYearlyIncome={estimatedYearlyIncome}
                netWorth={netWorth}
                yearlyMustExpenses={yearlyMustExpenses}
                userAowAge={userAowAge}
                weightedGrossReturn={weightedGrossReturn}
              />
            )}
            {activeTab === 'afbouw' && (
              <AfbouwClient
                assets={assets}
                debts={debts}
                profile={profile}
                fireParams={fireParams}
                yearlyMustExpenses={yearlyMustExpenses}
                lifeEvents={lifeEvents}
                cashflows={cashflows}
                netWorth={netWorth}
                weightedGrossReturn={weightedGrossReturn}
                userAowAge={userAowAge}
                savingsRate6m={savingsRate6m}
                estimatedYearlyIncome={estimatedYearlyIncome}
              />
            )}
            {activeTab === 'overzicht' && (
              <OverzichtClient
                assets={assets}
                debts={debts}
                profile={profile}
                fireParams={fireParams}
                netWorth={netWorth}
                totalAssets={totalAssets}
                totalDebts={totalDebts}
                yearlyMustExpenses={yearlyMustExpenses}
                lifeEvents={lifeEvents}
                cashflows={cashflows}
                userAowAge={userAowAge}
                weightedGrossReturn={weightedGrossReturn}
                savingsRate6m={savingsRate6m}
                estimatedYearlyIncome={estimatedYearlyIncome}
              />
            )}
          </div>
        </DoorrekeningSettingsProvider>
      </CollapsibleSection>
    </section>
  )
}
