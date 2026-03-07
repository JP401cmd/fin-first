'use client'

import { useState } from 'react'
import { FinnAvatar } from '@/components/app/avatars'
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
  onSkip,
  onBack,
  saving = false,
}: {
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
  onBankChange: (items: BankAccountEntry[]) => void
  onAssetChange: (items: AssetEntry[]) => void
  onDebtChange: (items: DebtEntry[]) => void
  onNext: () => void
  onSkip: () => void
  onBack: () => void
  saving?: boolean
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

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 active:text-zinc-900 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-6">
        <StepProgress current="startpunt" />
      </div>

      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>
          Optioneel: voeg je rekeningen, bezittingen of schulden toe. Dit kan altijd later.
        </SpeechBubble>
      </div>

      <div className="space-y-3">
        {sections.map(({ key, label, description, count }) => (
          <div key={key} className="rounded-xl border border-zinc-200 bg-white">
            <button
              onClick={() => toggle(key)}
              className="flex w-full min-h-[44px] items-center justify-between px-4 py-3.5 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-800">{label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-wil-100 px-1.5 py-0.5 text-[10px] font-bold text-wil-700">
                      {count}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
              </div>
              <svg
                className={`h-4 w-4 text-zinc-400 transition-transform ${openSections[key] ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {openSections[key] && (
              <div className="border-t border-zinc-100 px-4 py-3">
                {key === 'bank' && <MiniBankForm items={bankAccounts} onChange={onBankChange} />}
                {key === 'assets' && <MiniAssetForm items={assets} onChange={onAssetChange} />}
                {key === 'debts' && <MiniDebtForm items={debts} onChange={onDebtChange} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sticky nav on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-zinc-200 bg-white/80 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-6 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onSkip}
          disabled={saving}
          className="flex-1 min-h-[44px] rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sla over
        </button>
        <button
          onClick={onNext}
          disabled={saving}
          data-testid="onboarding-save-next"
          className="flex-1 min-h-[44px] rounded-lg bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Volgende
        </button>
      </div>
    </div>
  )
}
