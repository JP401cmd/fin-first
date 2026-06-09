'use client'

/**
 * HorizonSetupPane — basis-instellingen voor de FIRE-prognose.
 *
 * Vervangt voor first-time users de hoofd-grafiek op /horizon: een
 * intro-card lokt klikken naar deze pane. Bevat drie secties:
 *   1. Spaargeld per maand (override op asset-aggregaat)
 *   2. FIRE-eindstrategie (perpetual / legacy / deplete / pensioen)
 *   3. Uitgaven na pensioen (essential_budgets / custom_amount / current_income)
 *
 * Na 'Opslaan' wordt een feature-visits-record gezet met slug
 * `horizon_setup_completed`. Server-loader leest die marker en de
 * intro-card verdwijnt vanaf het volgende paginabezoek.
 *
 * Driewegregel: ShellOverlay kind="pane" — desktop SlideInPane,
 * mobile BottomSheet-fallback (Fase 0.5).
 */

import { useCallback, useState } from 'react'
import { ShellOverlay, type PaneAction } from '@/components/app/shell/shell-overlay'
import { FireSavingsPanel, type FireSavingsPanelValue } from '@/components/horizon/fire-savings-panel'
import { FireEndStrategyPanel, type FireEndStrategyPanelValue } from '@/components/horizon/fire-end-strategy-panel'
import { FireRetirementExpensePanel, type FireRetirementExpensePanelValue } from '@/components/horizon/fire-retirement-expense-panel'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'

export const HORIZON_SETUP_COMPLETED_SLUG = 'horizon_setup_completed'

export interface HorizonSetupPaneProps {
  open: boolean
  onClose: () => void
  /** Aangeroepen na succesvolle save zodat de parent intro-card kan verbergen
   *  én direct de nieuwe spaar-override in de prognose-hook kan injecteren
   *  (geen reload nodig). */
  onCompleted: (saved: { monthlySavingsOverride: number | null }) => void

  /** Initiële spaar-override uit profiles.monthly_savings_override. */
  initialMonthlySavingsOverride: number | null
  /** Asset-aggregaat (assets.monthly_contribution som). Voor read-only summary. */
  monthlyContributionFromAssets: number | null
  /** Budget-surplus (6m gemiddelde). Voor read-only summary als budgetteren actief. */
  monthlySurplusFromBudget: number | null
  /** Spaarquote × inkomen per maand uit de cashflow-pagina — exact het bedrag dat
   *  de prognose gebruikt als deze override leeg is. Null als nog onbekend. */
  baseMonthlySavingsFromCashflow: number | null
  budgetingActive: boolean

  /** Initiële eindstrategie uit fireStrategy. */
  initialEndStrategy: FireEndStrategy
  initialEndAge: number
  initialLegacyAmount: number

  /** Initiële retirement-expense methode uit profile. */
  initialRetirementMethod: RetirementExpenseMethod | null
  initialRetirementCustomAmount: number | null
}

export function HorizonSetupPane({
  open,
  onClose,
  onCompleted,
  initialMonthlySavingsOverride,
  monthlyContributionFromAssets,
  monthlySurplusFromBudget,
  baseMonthlySavingsFromCashflow,
  budgetingActive,
  initialEndStrategy,
  initialEndAge,
  initialLegacyAmount,
  initialRetirementMethod,
  initialRetirementCustomAmount,
}: HorizonSetupPaneProps) {
  // ── Local form state, geinitialiseerd uit props ─────────────────
  const [savings, setSavings] = useState<FireSavingsPanelValue>({
    override: initialMonthlySavingsOverride == null ? '' : String(initialMonthlySavingsOverride),
  })
  const [endStrategy, setEndStrategy] = useState<FireEndStrategyPanelValue>({
    strategy: initialEndStrategy,
    endAge: String(initialEndAge),
    legacyAmount: initialLegacyAmount > 0 ? String(initialLegacyAmount) : '',
  })
  const [retirement, setRetirement] = useState<FireRetirementExpensePanelValue>({
    method: initialRetirementMethod ?? 'essential_budgets',
    customAmount: initialRetirementCustomAmount != null ? String(initialRetirementCustomAmount) : '',
  })

  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Save: één PUT /api/fire-settings + één POST /api/feature-visits ─
  const handleSave = useCallback(async () => {
    setSaving(true)
    setErrorMsg(null)
    try {
      const overrideNum = savings.override === '' ? null : Number(savings.override)
      const endAgeNum = Number(endStrategy.endAge) || 90
      const legacyNum = endStrategy.legacyAmount === '' ? null : Number(endStrategy.legacyAmount)
      const customNum = retirement.customAmount === '' ? null : Number(retirement.customAmount)

      const fireRes = await fetch('/api/fire-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fire_end_strategy: endStrategy.strategy,
          fire_end_age: endAgeNum,
          fire_legacy_amount: legacyNum,
          retirement_expense_method: retirement.method,
          retirement_expense_custom_amount: customNum,
          monthly_savings_override: overrideNum,
        }),
      })
      if (!fireRes.ok) {
        const data = await fireRes.json().catch(() => ({}))
        throw new Error(data.error ?? 'Opslaan van prognose-instellingen mislukt')
      }

      // Setup-marker — best-effort, fail-silently om save niet te blokkeren
      // als user_feature_visits-tabel ontbreekt op legacy DBs.
      try {
        await fetch('/api/feature-visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feature_slug: HORIZON_SETUP_COMPLETED_SLUG }),
        })
      } catch {
        // ignore — intro-card blijft staan tot volgende refresh, geen blocker
      }

      onCompleted({ monthlySavingsOverride: overrideNum })
      onClose()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Onbekende fout bij opslaan')
    } finally {
      setSaving(false)
    }
  }, [savings, endStrategy, retirement, onClose, onCompleted])

  const primaryAction: PaneAction = {
    label: saving ? 'Opslaan' : 'Opslaan',
    onClick: handleSave,
    loading: saving,
    disabled: saving,
  }
  const secondaryAction: PaneAction = {
    label: 'Annuleren',
    onClick: onClose,
    disabled: saving,
  }

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="pane"
      title="Stel je FIRE-prognose in"
      primaryAction={primaryAction}
      secondaryAction={secondaryAction}
    >
      <div>
        <p className="mb-6 font-sans text-sm text-[var(--ink-2)] leading-relaxed">
          Drie basis-instellingen die het verloop van je FIRE-prognose bepalen.
          Je kunt deze later altijd aanpassen via Instellingen.
        </p>

        <FireSavingsPanel
          value={savings}
          onChange={setSavings}
          monthlyContributionFromAssets={monthlyContributionFromAssets}
          monthlySurplusFromBudget={monthlySurplusFromBudget}
          baseMonthlySavingsFromCashflow={baseMonthlySavingsFromCashflow}
          budgetingActive={budgetingActive}
        />

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        <FireEndStrategyPanel value={endStrategy} onChange={setEndStrategy} />

        <div className="my-6 border-t border-dashed border-[var(--border-ed)]" />

        <FireRetirementExpensePanel
          value={retirement}
          onChange={setRetirement}
          showDeepLink={false}
        />

        {errorMsg && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMsg}
          </p>
        )}
      </div>
    </ShellOverlay>
  )
}
