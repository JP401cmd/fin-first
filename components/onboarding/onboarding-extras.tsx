'use client'

import { useState } from 'react'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { MiniBankForm, type BankAccountEntry } from './mini-bank-form'
import { MiniAssetForm, type AssetEntry } from './mini-asset-form'
import { MiniDebtForm, type DebtEntry } from './mini-debt-form'

type Section = 'bank' | 'assets' | 'debts'

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
}) {
  const [openSections, setOpenSections] = useState<Record<Section, boolean>>({
    bank: false,
    assets: false,
    debts: false,
  })

  const toggle = (section: Section) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const sections: { key: Section; label: string; description: string; count: number }[] = [
    { key: 'bank', label: 'Bankrekeningen', description: 'Betaal- en spaarrekeningen', count: bankAccounts.length },
    { key: 'assets', label: 'Bezittingen', description: 'Spaargeld, beleggingen, woning, etc.', count: assets.length },
    { key: 'debts', label: 'Schulden', description: 'Hypotheek, leningen, creditcard, etc.', count: debts.length },
  ]

  const hasData = bankAccounts.length > 0 || assets.length > 0 || debts.length > 0

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
                {key === 'bank' && <MiniBankForm items={bankAccounts} onChange={onBankChange} />}
                {key === 'assets' && <MiniAssetForm items={assets} onChange={onAssetChange} />}
                {key === 'debts' && <MiniDebtForm items={debts} onChange={onDebtChange} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky nav on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onNext}
          disabled={saving}
          data-testid="onboarding-save-next"
          className="w-full min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasData ? 'Volgende' : 'Overslaan'}
        </button>
      </div>
    </div>
  )
}
