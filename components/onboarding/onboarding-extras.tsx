'use client'

import { useState } from 'react'
import { WillDots } from '@/components/app/will-dots'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { MiniBankForm, type BankAccountEntry } from './mini-bank-form'
import { MiniAssetForm, type AssetEntry } from './mini-asset-form'
import { MiniDebtForm, type DebtEntry } from './mini-debt-form'

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
  hideBudgets = false,
  budgetteringMode = 'none',
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
  hideBudgets?: boolean
  budgetteringMode?: string
}) {
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    assets: false,
    debts: false,
  })
  const [showBudgetModal, setShowBudgetModal] = useState(false)

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

  /**
   * Validate budget tracking requirement before proceeding.
   * When budgettering is active, at least one bank account must have
   * has_budget_tracking enabled — otherwise we prompt the user.
   */
  const handleNext = () => {
    if (budgetteringMode !== 'none') {
      const hasBudgetAccount = bankAccounts.some((a) => a.has_budget_tracking)
      if (!hasBudgetAccount) {
        setShowBudgetModal(true)
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
        <StepProgress current="startpunt" hideBudgets={hideBudgets} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Je startpunt</p>

      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>
          Als je je rekeningen en bezittingen toevoegt, kan ik meteen je netto vermogen en vrijheidspercentage berekenen. Heb je schulden? Dan laat ik zien hoeveel vrijheid je terugkoopt als je die aflost. Dit is helemaal optioneel &mdash; je kunt het ook later toevoegen.
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
    </div>
  )
}
