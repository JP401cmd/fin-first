'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Wallet } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import {
  ASSET_QUICK_ADD_LABELS,
  ASSET_TYPE_COLORS,
  ASSET_TYPE_ICONS,
  type AssetType,
} from '@/lib/asset-data'
import {
  DEBT_QUICK_ADD_LABELS,
  DEBT_TYPE_COLORS,
  DEBT_TYPE_ICONS,
  type DebtType,
} from '@/lib/debt-data'
import type { ModuleId } from '@/lib/module-registry'
import type { AssetQuickInput, DebtQuickInput, QuickAddInput } from '@/lib/quick-add/types'
import { QuickAddWizard } from '@/components/app/quick-add-wizard/quick-add-wizard'
import { TypeIcon } from '@/components/app/quick-add-wizard/icon-map'
import { MaskedAmount } from '@/components/app/masked-amount'

/**
 * Onboarding-stap voor bezittingen en schulden — gebruikt dezelfde
 * QuickAddWizard als de Kern-pagina, maar in `collect`-mode: items worden
 * lokaal verzameld en pas in de slot-batch (save-own-data) doorgestuurd.
 *
 * Verschillen met OnboardingExtras (oude flow):
 *   · Geen aparte bank-form — een lopende rekening is een `cash`-type asset
 *     met de bank-naam in `field3`.
 *   · Geen mini-form met 17+ velden per item; de wizard vraagt naam, bedrag
 *     en één type-specifiek veld. De rest wordt via de full form later
 *     ingevuld door de gebruiker.
 *   · Geen module-vereisten-modals (BudgetModal/HoldingsModal). Server-side
 *     auto-seed in save-own-data zorgt voor de fallback bij actieve modules
 *     zonder bijbehorende rekening.
 */
export function OnboardingBezittingen({
  quickAssets,
  quickDebts,
  onAssetsChange,
  onDebtsChange,
  onNext,
  onBack,
  saving = false,
  activeModules = [],
  onActivateBudgetteren,
  subStep,
}: {
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  onAssetsChange: (items: AssetQuickInput[]) => void
  onDebtsChange: (items: DebtQuickInput[]) => void
  onNext: () => void
  onBack: () => void
  saving?: boolean
  activeModules?: ModuleId[]
  /** Callback die budgetteren-module activeert. Pas getriggerd door de prompt
   *  die opent na het toevoegen van de eerste cash-asset. */
  onActivateBudgetteren?: () => void
  subStep?: { current: number; total: number }
}) {
  const [wizardIntent, setWizardIntent] = useState<'asset' | 'debt' | null>(null)
  // Cash-asset waarvoor we de budgetteren-prompt tonen. `null` = geen prompt
  // open. Wordt gevuld zodra de wizard een cash-item collectt en budgetteren
  // nog niet actief is. We tonen de prompt eenmalig per sessie: eenmaal
  // afgewezen → blijft uit (gebruiker kan budgetteren later in Instellingen
  // alsnog activeren).
  const [budgetPromptCash, setBudgetPromptCash] = useState<AssetQuickInput | null>(null)
  const [budgetPromptDismissed, setBudgetPromptDismissed] = useState(false)

  const isBudgetterenActive = activeModules.includes('budgetteren')

  const handleCollect = (item: QuickAddInput) => {
    if (item.kind === 'asset') {
      onAssetsChange([...quickAssets, item.asset])
      // Cash-asset toegevoegd & budgetteren nog niet actief & nog niet afgewezen
      // → vraag of de gebruiker deze rekening wil koppelen aan budgetteren.
      if (
        item.asset.asset_type === 'cash' &&
        !isBudgetterenActive &&
        !budgetPromptDismissed
      ) {
        setBudgetPromptCash(item.asset)
      }
    } else if (item.kind === 'debt') {
      onDebtsChange([...quickDebts, item.debt])
    }
    // `asset_with_debt` komt niet voor in collect-mode (zie wizard).
  }

  const acceptBudgetPrompt = () => {
    setBudgetPromptCash(null)
    onActivateBudgetteren?.()
  }
  const declineBudgetPrompt = () => {
    setBudgetPromptCash(null)
    setBudgetPromptDismissed(true)
  }

  const removeAsset = (i: number) =>
    onAssetsChange(quickAssets.filter((_, idx) => idx !== i))
  const removeDebt = (i: number) =>
    onDebtsChange(quickDebts.filter((_, idx) => idx !== i))

  const totalAssets = useMemo(
    () => quickAssets.reduce((s, a) => s + (Number(a.current_value) || 0), 0),
    [quickAssets],
  )
  const totalDebts = useMemo(
    () => quickDebts.reduce((s, d) => s + (Number(d.current_balance) || 0), 0),
    [quickDebts],
  )
  const hasData = quickAssets.length > 0 || quickDebts.length > 0

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress currentPhase="instellen" subStep={subStep} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Je startpunt</p>

      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0">
          <WillDots size={48} />
        </div>
        <SpeechBubble>
          Voeg je bezittingen en schulden toe zodat ik je netto vermogen kan
          berekenen. Per item vraag ik alleen het minimum &mdash; naam, bedrag
          en &eacute;&eacute;n type-specifiek veld. De rest kun je later
          aanvullen.
        </SpeechBubble>
      </div>

      {/* ── Bezittingen ──────────────────────────────────────── */}
      <section className="mb-6 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-sm">
        <SectionHeader
          label="Bezittingen"
          count={quickAssets.length}
          total={totalAssets}
          tone="asset"
        />

        <div className="mt-3 space-y-2">
          {quickAssets.map((item, i) => (
            <AssetRow
              key={i}
              item={item}
              onRemove={() => removeAsset(i)}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setWizardIntent('asset')}
          className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-kern-300 py-2.5 text-sm font-medium text-kern-700 transition-colors hover:bg-kern-50 active:bg-kern-100"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Bezitting toevoegen
        </button>
      </section>

      {/* ── Schulden ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-sm">
        <SectionHeader
          label="Schulden"
          count={quickDebts.length}
          total={totalDebts}
          tone="debt"
        />

        <div className="mt-3 space-y-2">
          {quickDebts.map((item, i) => (
            <DebtRow key={i} item={item} onRemove={() => removeDebt(i)} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setWizardIntent('debt')}
          className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-debt-300,#fca5a5)] py-2.5 text-sm font-medium text-[var(--color-debt-700,#b91c1c)] transition-colors hover:bg-red-50 active:bg-red-100"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Schuld toevoegen
        </button>
      </section>

      {/* Sticky nav on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onNext}
          disabled={saving}
          data-testid="onboarding-bezittingen-next"
          className="w-full min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasData ? 'Volgende' : 'Overslaan'}
        </button>
      </div>

      {/* Wizard in collect-mode — items komen via onCollect terug. */}
      <QuickAddWizard
        open={wizardIntent !== null}
        onClose={() => setWizardIntent(null)}
        initialIntent={wizardIntent ?? undefined}
        mode="collect"
        onCollect={handleCollect}
      />

      {/* Budgetteren-opt-in: opent zodra de eerste cash-asset is toegevoegd
          en budgetteren nog niet actief is. Acceptatie schakelt de module
          aan; de budgets-stap verschijnt automatisch in de step-order.
          Afwijzing markeert de prompt als afgehandeld voor deze sessie. */}
      <BottomSheet
        open={budgetPromptCash !== null}
        onClose={declineBudgetPrompt}
        title="Budgetteren koppelen?"
        size="sm"
      >
        <div className="space-y-4 px-1 pb-2">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wil-100 text-wil-700">
              <Wallet className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p className="font-serif text-base italic leading-snug text-[var(--ink)]">
                Wil je <strong className="not-italic font-semibold">{budgetPromptCash?.name ?? 'deze rekening'}</strong>{' '}
                gebruiken om je uitgaven te budgetteren?
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-3)]">
                Dan activeer ik budgetteren en stel je in een volgende stap je
                budgetten in. Je kunt dit later altijd uit zetten in
                Instellingen.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={acceptBudgetPrompt}
              className="w-full min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800"
            >
              Ja, gebruik voor budgetteren
            </button>
            <button
              type="button"
              onClick={declineBudgetPrompt}
              className="w-full min-h-[44px] rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
            >
              Niet nu
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  total,
  tone,
}: {
  label: string
  count: number
  total: number
  tone: 'asset' | 'debt'
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-display text-sm font-semibold tracking-[-0.02em] text-[var(--ink)]">
          {label}
        </span>
        {count > 0 && (
          <span className="rounded-full bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink-3)]">
            {count}
          </span>
        )}
      </div>
      {count > 0 && (
        <span className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
          <MaskedAmount value={total} tone={tone === 'asset' ? 'kern' : 'kern'} />
        </span>
      )}
    </div>
  )
}

function AssetRow({
  item,
  onRemove,
}: {
  item: AssetQuickInput
  onRemove: () => void
}) {
  const iconName = ASSET_TYPE_ICONS[item.asset_type as AssetType]
  const color = ASSET_TYPE_COLORS[item.asset_type as AssetType]
  const typeLabel = ASSET_QUICK_ADD_LABELS[item.asset_type as AssetType]
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`, color }}
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
        <p className="text-[11px] text-[var(--ink-3)]">{typeLabel}</p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        <MaskedAmount value={item.current_value} tone="kern" />
      </span>
      <button
        onClick={onRemove}
        className="ml-1 rounded-md p-1 text-[var(--ink-4)] hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
        aria-label={`Verwijder ${item.name}`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}

function DebtRow({
  item,
  onRemove,
}: {
  item: DebtQuickInput
  onRemove: () => void
}) {
  const iconName = DEBT_TYPE_ICONS[item.debt_type as DebtType]
  const color = DEBT_TYPE_COLORS[item.debt_type as DebtType]
  const typeLabel = DEBT_QUICK_ADD_LABELS[item.debt_type as DebtType]
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`, color }}
      >
        <TypeIcon name={iconName} className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
        <p className="text-[11px] text-[var(--ink-3)]">{typeLabel}</p>
      </div>
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink-2)]">
        <MaskedAmount value={item.current_balance} tone="kern" signPrefix="-" />
      </span>
      <button
        onClick={onRemove}
        className="ml-1 rounded-md p-1 text-[var(--ink-4)] hover:bg-[var(--paper)] hover:text-[var(--ink-2)]"
        aria-label={`Verwijder ${item.name}`}
      >
        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
