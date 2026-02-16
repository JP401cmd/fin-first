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
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-6">
        <StepProgress current="extras" />
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
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-800">{label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">
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

      <div className="mt-6 flex gap-3">
        <button
          onClick={onSkip}
          disabled={saving}
          className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sla over
        </button>
        <button
          onClick={onNext}
          disabled={saving}
          data-testid="onboarding-save-next"
          className="flex-1 rounded-lg bg-teal-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Opslaan...' : 'Opslaan & verder'}
        </button>
      </div>
    </div>
  )
}
