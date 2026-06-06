'use client'

import { useEffect, useState } from 'react'
import { Banknote, Edit3, FileSpreadsheet, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import type { AppSetupConfig, AppSetupSectionRenderProps } from '../types'
import {
  BUDGET_TEMPLATES,
  type BudgetTemplateId,
} from '@/lib/budget-templates/onboarding-presets'

// ── State ────────────────────────────────────────────────────

type TemplateChoice = BudgetTemplateId | 'empty'

interface BudgetterenState {
  /** IDs van cash-assets die getrackt worden door budgetteren. */
  selectedCashAssetIds: string[]
  /** Welk template wordt geseed (of 'empty' = lege start). */
  templateChoice: TemplateChoice | null
  /** Bevestiging van sectie 3 — gebruiker heeft uitleg gezien. */
  acknowledgedTxLogging: boolean
}

// ── Sectie 1 — Bron-selector ────────────────────────────────

interface CashAsset {
  id: string
  name: string
  current_value: number
  has_budget_tracking: boolean
}

function CashSourceSelector({
  state,
  setState,
}: AppSetupSectionRenderProps<BudgetterenState>) {
  const [assets, setAssets] = useState<CashAsset[] | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    void (async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('assets')
          .select('id, name, current_value, has_budget_tracking')
          .eq('asset_type', 'cash')
          .eq('is_active', true)
          .order('current_value', { ascending: false })
        if (aborted) return
        if (error) throw error
        const rows = (data ?? []) as CashAsset[]
        setAssets(rows)
        // Pre-selecteer rekeningen die al budget-tracking aan hebben staan
        // (dat is de impliciete intentie vanuit onboarding-seeding).
        if (state.selectedCashAssetIds.length === 0) {
          const preSelected = rows
            .filter((a) => a.has_budget_tracking)
            .map((a) => a.id)
          if (preSelected.length > 0) {
            setState((prev) => ({ ...prev, selectedCashAssetIds: preSelected }))
          }
        }
      } catch (err) {
        if (aborted) return
        setErrorMsg(err instanceof Error ? err.message : 'Kon rekeningen niet laden')
      }
    })()
    return () => {
      aborted = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (errorMsg) {
    return (
      <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {errorMsg}
      </p>
    )
  }
  if (assets === null) {
    return <SkeletonRows rows={2} />
  }
  if (assets.length === 0) {
    return (
      <div className="border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/40 px-4 py-5">
        <p className="font-serif italic text-sm leading-relaxed text-[var(--ink-2)]">
          Je hebt nog geen cash-rekening. Voeg er één toe via je{' '}
          <a
            href="/overzicht/cashflow"
            className="underline decoration-[var(--ink-3)] underline-offset-2 hover:decoration-[var(--ink)]"
          >
            Kern-bezittingen
          </a>{' '}
          voordat je Budgetteren instelt.
        </p>
      </div>
    )
  }

  function toggle(id: string) {
    setState((prev) => {
      const has = prev.selectedCashAssetIds.includes(id)
      return {
        ...prev,
        selectedCashAssetIds: has
          ? prev.selectedCashAssetIds.filter((x) => x !== id)
          : [...prev.selectedCashAssetIds, id],
      }
    })
  }

  return (
    <ul className="space-y-2">
      {assets.map((asset) => {
        const checked = state.selectedCashAssetIds.includes(asset.id)
        return (
          <li key={asset.id}>
            <label
              className={`flex min-h-11 cursor-pointer items-center gap-3 border px-3 py-2 transition-colors ${
                checked
                  ? 'border-[var(--ink)] bg-[var(--paper)]'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(asset.id)}
                className="h-4 w-4 accent-[var(--ink)]"
              />
              <Wallet className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
              <span className="flex-1 text-sm text-[var(--ink)]">{asset.name}</span>
              <span className="font-mono tabular-nums text-[12px] text-[var(--ink-3)]">
                € {Math.round(asset.current_value).toLocaleString('nl-NL')}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

// ── Sectie 2 — Template-picker ──────────────────────────────

function BudgetTemplatePicker({
  state,
  setState,
}: AppSetupSectionRenderProps<BudgetterenState>) {
  const choices: { id: TemplateChoice; name: string; subtitle: string; description: string }[] = [
    ...BUDGET_TEMPLATES.map((t) => ({
      id: t.id as TemplateChoice,
      name: t.name,
      subtitle: t.subtitle,
      description: t.description,
    })),
    {
      id: 'empty',
      name: 'Leeg starten',
      subtitle: 'Geen voorgevuld',
      description: 'Begin met een blanco lei en voeg zelf budgetten toe wanneer je ze tegenkomt.',
    },
  ]

  return (
    <div className="space-y-3">
      {choices.map((choice) => {
        const selected = state.templateChoice === choice.id
        const template = choice.id !== 'empty'
          ? BUDGET_TEMPLATES.find((t) => t.id === choice.id)
          : null
        return (
          <button
            type="button"
            key={choice.id}
            onClick={() =>
              setState((prev) => ({ ...prev, templateChoice: choice.id }))
            }
            className={`w-full border px-4 py-3 text-left transition-colors ${
              selected
                ? 'border-[var(--ink)] bg-[var(--paper)]'
                : 'border-[var(--border-ed)] bg-[var(--paper)] hover:bg-[var(--subtle)]/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <h4 className="font-serif text-sm font-semibold text-[var(--ink)]">
                    {choice.name}
                  </h4>
                  <span className="text-[11px] text-[var(--ink-3)]">{choice.subtitle}</span>
                </div>
                <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">
                  {choice.description}
                </p>
                {template && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.categories.map((cat) => (
                      <span
                        key={cat.label}
                        className="inline-flex items-center gap-1 border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-1.5 py-0.5 text-[10px] text-[var(--ink-2)]"
                      >
                        <span aria-hidden="true">{cat.icon}</span>
                        {cat.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span
                aria-hidden="true"
                className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? 'border-[var(--ink)] bg-[var(--ink)]'
                    : 'border-[var(--border-md)] bg-[var(--paper)]'
                }`}
              >
                {selected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--paper)]" />
                )}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Sectie 3 — Transactie-logging uitleg ────────────────────

function TransactionLoggingExplainer({
  state,
  setState,
}: AppSetupSectionRenderProps<BudgetterenState>) {
  const cards = [
    {
      icon: Banknote,
      title: 'Bankkoppeling',
      copy: 'Koppel je bank één keer en transacties komen automatisch binnen. Je categoriseert ze daarna in een paar tikken.',
      hrefLabel: 'Beheer koppelingen',
      href: '/identity/koppelingen',
    },
    {
      icon: Edit3,
      title: 'Handmatig',
      copy: 'Voeg transacties één voor één toe via de "+"-knop op de budget-pagina. Werkt prima als je weinig mutaties hebt.',
      hrefLabel: null,
      href: null,
    },
    {
      icon: FileSpreadsheet,
      title: 'CSV-import',
      copy: 'Download een afschrift bij je bank en upload het als CSV. Handig voor een achterstand inhalen.',
      hrefLabel: null,
      href: null,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.title}
              className="border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-3"
            >
              <Icon className="h-4 w-4 text-[var(--ink-3)]" aria-hidden="true" />
              <h4 className="mt-2 font-serif text-sm font-semibold text-[var(--ink)]">
                {card.title}
              </h4>
              <p className="mt-1 font-serif italic text-[12px] leading-snug text-[var(--ink-2)]">
                {card.copy}
              </p>
              {card.href && (
                <a
                  href={card.href}
                  className="mt-2 inline-block text-[11px] text-[var(--ink)] underline decoration-[var(--ink-3)] underline-offset-2 hover:decoration-[var(--ink)]"
                >
                  {card.hrefLabel} →
                </a>
              )}
            </div>
          )
        })}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2">
        <input
          type="checkbox"
          checked={state.acknowledgedTxLogging}
          onChange={() =>
            setState((prev) => ({
              ...prev,
              acknowledgedTxLogging: !prev.acknowledgedTxLogging,
            }))
          }
          className="h-4 w-4 accent-[var(--ink)]"
        />
        <span className="text-sm text-[var(--ink-2)]">
          Ik snap hoe ik transacties op rekeningen kan loggen.
        </span>
      </label>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse border border-[var(--border-ed)] bg-[var(--subtle)]/40"
        />
      ))}
    </div>
  )
}

// ── Config ──────────────────────────────────────────────────

export const budgetterenSetupConfig: AppSetupConfig<BudgetterenState> = {
  appKey: 'budgetteren',
  featureSlug: APP_SETUP_SLUGS.budgetteren,
  kicker: 'Eenmalige setup',
  title: 'Stel Budgetteren in',
  intro:
    'Drie keuzes bepalen hoe Budgetteren voor jou werkt: welke rekening je tracked, welk budget-template je gebruikt, en hoe je transacties logt. Je kunt alles later aanpassen via Instellingen.',
  initialState: () => ({
    selectedCashAssetIds: [],
    templateChoice: null,
    acknowledgedTxLogging: false,
  }),
  sections: [
    {
      id: 'cash-source',
      kicker: '1. Bron',
      title: 'Welke rekening volg je?',
      hint: 'Transacties van deze rekening(en) worden tegen je budgetten afgezet.',
      render: CashSourceSelector,
    },
    {
      id: 'template',
      kicker: '2. Template',
      title: 'Hoe wil je beginnen?',
      hint: 'Een template seedt categorieën met richtbedragen op basis van je inkomen. Je past ze later aan.',
      render: BudgetTemplatePicker,
    },
    {
      id: 'transactions',
      kicker: '3. Transacties',
      title: 'Zo log je je uitgaven',
      hint: 'Kies de werkwijze die bij jou past — je kunt later switchen of combineren.',
      render: TransactionLoggingExplainer,
    },
  ],
  validate: (state) => {
    if (state.selectedCashAssetIds.length === 0) {
      return { ok: false, reason: 'Kies minstens één rekening die je volgt.' }
    }
    if (state.templateChoice === null) {
      return { ok: false, reason: 'Kies een template of start leeg.' }
    }
    if (!state.acknowledgedTxLogging) {
      return { ok: false, reason: 'Bevestig dat je weet hoe je transacties logt.' }
    }
    return { ok: true }
  },
  endpoint: '/api/budgetteren/setup',
  buildPayload: (state) => ({
    selectedCashAssetIds: state.selectedCashAssetIds,
    templateChoice: state.templateChoice,
  }),
}
