'use client'

import { CreditCard } from 'lucide-react'
import type { AssetType } from '@/lib/asset-data'

/**
 * Stap 4 — "Gekoppelde schuld?"-prompt.
 *
 * Alleen zichtbaar voor de 4 asset-types met een logische debt-pendant
 * (eigen_huis, real_estate, vehicle, deelneming). De prompt gebruikt
 * debt-tinten om visueel te signaleren dat we overstappen naar het
 * schuld-pad; de vraag is in Playfair italic om het editorial karakter
 * vast te houden en de beslissing rustig te laten landen.
 */

export interface StepLinkDebtProps {
  assetType: AssetType
  assetName: string
  onYes: () => void
  onNo: () => void
}

const QUESTION_PER_ASSET: Partial<Record<AssetType, string>> = {
  eigen_huis: 'Heeft deze woning een hypotheek?',
  real_estate: 'Staat hier een hypotheek op?',
  vehicle: 'Heb je hier een lening voor?',
  deelneming: 'Heb je een rekening-courant schuld aan deze BV?',
}

const YES_LABEL: Partial<Record<AssetType, string>> = {
  eigen_huis: 'Ja, hypotheek toevoegen',
  real_estate: 'Ja, hypotheek toevoegen',
  vehicle: 'Ja, autolening toevoegen',
  deelneming: 'Ja, RC-schuld toevoegen',
}

export function StepLinkDebt({ assetType, assetName, onYes, onNo }: StepLinkDebtProps) {
  const question = QUESTION_PER_ASSET[assetType] ?? 'Heeft deze bezitting een schuld?'
  const yesLabel = YES_LABEL[assetType] ?? 'Ja, schuld toevoegen'

  return (
    <div className="flex flex-col items-center gap-5 py-2 text-center">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center bg-[var(--color-debt-100)] text-[var(--color-debt-700)]"
      >
        <CreditCard className="h-6 w-6" strokeWidth={1.5} />
      </div>

      <div className="space-y-2">
        <h4
          tabIndex={-1}
          className="font-serif text-xl italic text-[var(--ink)] leading-snug"
        >
          {question}
        </h4>
        <p className="max-w-[32ch] text-sm text-[var(--ink-3)] leading-relaxed">
          Koppel ze nu, dan berekent TriFinity automatisch je netto vermogen
          voor <span className="font-medium text-[var(--ink-2)]">{assetName}</span>.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={onYes}
          className="inline-flex min-h-[44px] items-center justify-center bg-[var(--color-debt-600)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-debt-700)] active:bg-[var(--color-debt-800)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-debt-500)]"
        >
          {yesLabel}
        </button>

        <button
          type="button"
          onClick={onNo}
          className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 text-sm text-[var(--ink-3)] underline-offset-4 transition-colors hover:text-[var(--ink)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
        >
          Nee, overslaan
        </button>
      </div>
    </div>
  )
}
