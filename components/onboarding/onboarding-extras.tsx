'use client'

import { useState, useEffect } from 'react'
import { WillDots } from '@/components/app/will-dots'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { MiniBankForm, type BankAccountEntry } from './mini-bank-form'
import { MiniAssetForm, type AssetEntry } from './mini-asset-form'
import { MiniDebtForm, type DebtEntry } from './mini-debt-form'
import { type ModuleId } from '@/lib/module-registry'

type Section = 'assets' | 'debts'

export function OnboardingExtras({
  bankAccounts,
  assets,
  debts,
  onBankChange,
  onAssetChange,
  onDebtChange,
  onNext,
  onBack,
  saving = false,
  activeModules = [],
  subStep,
}: {
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
  onBankChange: (items: BankAccountEntry[]) => void
  onAssetChange: (items: AssetEntry[]) => void
  onDebtChange: (items: DebtEntry[]) => void
  onNext: () => void
  onBack: () => void
  saving?: boolean
  activeModules?: ModuleId[]
  subStep?: { current: number; total: number }
}) {
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    assets: false,
    debts: false,
  })
  const [showBudgetModal, setShowBudgetModal] = useState(false)
  const [showHoldingsModal, setShowHoldingsModal] = useState(false)

  const toggle = (section: Section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Combined count for assets section includes bank accounts
  const assetsCount = bankAccounts.length + assets.length

  const sections: { key: Section; label: string; description: string; count: number }[] = [
    { key: 'assets', label: 'Bezittingen', description: 'Bankrekeningen, spaargeld, beleggingen, woning, etc.', count: assetsCount },
    { key: 'debts', label: 'Schulden', description: 'Hypotheek, leningen, creditcard, etc.', count: debts.length },
  ]

  const hasData = bankAccounts.length > 0 || assets.length > 0 || debts.length > 0

  const hasBudgetteren = activeModules.includes('budgetteren')
  const hasAandelenregistratie = activeModules.includes('aandelenregistratie')

  // Auto-seed defaults on mount: ensure required accounts exist for active modules
  useEffect(() => {
    if (hasBudgetteren && !bankAccounts.some((a) => a.has_budget_tracking)) {
      onBankChange([
        ...bankAccounts,
        {
          name: 'Lopende rekening',
          bank_name: '',
          account_type: 'checking',
          balance: '0',
          has_budget_tracking: true,
        },
      ])
    }
    if (hasAandelenregistratie && !assets.some((a) => a.asset_type === 'investment')) {
      onAssetChange([
        ...assets,
        {
          name: 'Beleggingsrekening',
          asset_type: 'investment',
          current_value: '0',
          purchase_value: '0',
          expected_return: '0.07',
          monthly_contribution: '0',
          institution: '',
          subtype: 'etf',
          risk_profile: 'middel',
          tax_benefit: false,
          is_liquid: true,
          lock_end_date: '',
          ticker_symbol: '',
          rental_income: '',
          woz_value: '',
          retirement_provider_type: '',
          depreciation_rate: '',
          address_postcode: '',
          address_house_number: '',
          expiry_date: '',
          beneficiary: '',
          kvk_number: '',
          ownership_percentage: '',
          annual_dividend: '',
        } as AssetEntry,
      ])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Validate module-specific requirements before proceeding.
   * - budgetteren: at least one bank account must have has_budget_tracking enabled.
   * - aandelenregistratie: at least one investment asset must have has_holdings_tracking enabled.
   * Missing prerequisites prompt the user to auto-create a sensible default.
   */
  const handleNext = () => {
    if (hasBudgetteren) {
      const hasBudgetAccount = bankAccounts.some((a) => a.has_budget_tracking)
      if (!hasBudgetAccount) {
        setShowBudgetModal(true)
        return
      }
    }
    if (hasAandelenregistratie) {
      const hasHoldingsAsset = assets.some(
        (a) => a.asset_type === 'investment' && (a as unknown as Record<string, unknown>).has_holdings_tracking
      )
      if (!hasHoldingsAsset) {
        setShowHoldingsModal(true)
        return
      }
    }
    onNext()
  }

  /** Auto-create a default checking account with budget tracking enabled */
  const handleAutoCreate = () => {
    onBankChange([
      ...bankAccounts,
      {
        name: 'Lopende rekening',
        bank_name: '',
        account_type: 'checking',
        balance: '0',
        has_budget_tracking: true,
      },
    ])
    setShowBudgetModal(false)
    onNext()
  }

  /**
   * Auto-create a default investment asset so the user can proceed.
   * AssetEntry does not carry has_holdings_tracking — that flag lives on the
   * persisted record written by the server. Creating the investment asset here
   * satisfies the server-side save path which sets the flag automatically.
   */
  const handleAutoCreateHoldings = () => {
    onAssetChange([
      ...assets,
      {
        name: 'Beleggingsrekening',
        asset_type: 'investment',
        current_value: '0',
        purchase_value: '0',
        expected_return: '0.07',
        monthly_contribution: '0',
        institution: '',
        subtype: 'etf',
        risk_profile: 'middel',
        tax_benefit: false,
        is_liquid: true,
        lock_end_date: '',
        ticker_symbol: '',
        rental_income: '',
        woz_value: '',
        retirement_provider_type: '',
        depreciation_rate: '',
        address_postcode: '',
        address_house_number: '',
        expiry_date: '',
        beneficiary: '',
        kvk_number: '',
        ownership_percentage: '',
        annual_dividend: '',
      } as AssetEntry,
    ])
    setShowHoldingsModal(false)
    onNext()
  }

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress currentPhase="instellen" subStep={subStep} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Je startpunt</p>

      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>
          Voeg je rekeningen, bezittingen en schulden toe zodat ik je netto vermogen en vrijheidspercentage kan berekenen. Later kun je in de app transacties uploaden of je bankrekening koppelen om je uitgaven automatisch te volgen. Dit is helemaal optioneel &mdash; je kunt het ook later toevoegen.
        </SpeechBubble>
      </div>

      <div className="space-y-4">
        {sections.map(({ key, label, description, count }) => (
          <div key={key} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-sm">
            <button
              onClick={() => toggle(key)}
              className="flex w-full min-h-[44px] items-center justify-between px-4 py-3.5 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-semibold tracking-[-0.02em] text-[var(--ink)]">{label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-wil-100 px-1.5 py-0.5 text-[10px] font-bold text-wil-700">
                      {count}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--ink-3)]">{description}</p>
              </div>
              <svg
                className={`h-4 w-4 text-[var(--ink-4)] transition-transform ${openSections[key] ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {openSections[key] && (
              <div className="border-t border-[var(--border-ed)] px-4 py-3">
                {key === 'assets' && (
                  <div className="space-y-4">
                    {/* Cash & Bankrekeningen subsection */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
                        Cash &amp; Bankrekeningen
                      </p>
                      <MiniBankForm items={bankAccounts} onChange={onBankChange} />
                    </div>

                    {/* Visual divider between bank accounts and other assets */}
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-[var(--border-ed)]" />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--ink-4)]">Overige bezittingen</span>
                      <div className="h-px flex-1 bg-[var(--border-ed)]" />
                    </div>

                    <MiniAssetForm items={assets} onChange={onAssetChange} />
                  </div>
                )}
                {key === 'debts' && <MiniDebtForm items={debts} onChange={onDebtChange} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky nav on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={handleNext}
          disabled={saving}
          data-testid="onboarding-save-next"
          className="w-full min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasData ? 'Volgende' : 'Overslaan'}
        </button>
      </div>

      {/* Budget tracking validation modal */}
      <BottomSheet open={showBudgetModal} onClose={() => setShowBudgetModal(false)} title="Budgetteren" size="sm">
        <div className="space-y-4 px-1 pb-2">
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            Je hebt budgetteren ingeschakeld, maar geen enkele bankrekening is gekoppeld aan je budget.
            Om transacties bij te houden heb je minstens &eacute;&eacute;n rekening nodig met budgetteren aan.
          </p>
          <p className="text-sm text-[var(--ink-3)]">
            Wil je dat we automatisch een standaard lopende rekening aanmaken?
          </p>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={handleAutoCreate}
              className="w-full min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800"
            >
              Lopende rekening aanmaken
            </button>
            <button
              onClick={() => setShowBudgetModal(false)}
              className="w-full min-h-[44px] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              Terug naar bezittingen
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Holdings tracking validation modal */}
      <BottomSheet open={showHoldingsModal} onClose={() => setShowHoldingsModal(false)} title="Aandelenregistratie">
        <p className="mb-4 text-sm text-[var(--ink-2)]">
          Je hebt aandelenregistratie geactiveerd, maar nog geen beleggingsrekening. Wil je er een aanmaken?
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setShowHoldingsModal(false)}
            className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-2 text-sm font-medium text-[var(--ink-2)]"
          >
            Zelf toevoegen
          </button>
          <button
            onClick={handleAutoCreateHoldings}
            className="flex-1 min-h-[44px] rounded-xl bg-kern-600 px-4 py-2 text-sm font-medium text-white"
          >
            Maak aan
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
