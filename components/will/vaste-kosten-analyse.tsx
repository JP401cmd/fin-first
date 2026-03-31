'use client'

import { useState } from 'react'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { formatCurrency } from '@/lib/format'
import { CATEGORY_LABELS, type RecurringCategory } from '@/lib/recurring-detection'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import {
  RecurringClassifySheet,
  type ClassifyItemData,
} from '@/components/app/recurring-classify-sheet'
import {
  AiVasteKostenSheet,
} from '@/components/app/ai-vaste-kosten-sheet'
import {
  CreditCard,
  Home,
  Building,
  Zap,
  Shield,
  Car,
  HelpCircle,
  ChevronRight,
  Ban,
  RefreshCw,
  Sparkles,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────

export type RecurringItem = {
  id: string
  name: string
  averageAmount: number
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  nextDate: string | null
  confidence: 'high' | 'medium' | 'low'
  isVariableAmount: boolean
  occurrences: number | null
  alreadyConfirmed: boolean
  category: RecurringCategory
  categoryLabel: string
  /** User override classification: null = auto-detected category is used */
  categoryOverride: string | null
}

interface VasteKostenAnalyseProps {
  subscriptions: RecurringItem[]
  vasteKosten: RecurringItem[]
  totalMonthlySubscriptions: number
  totalMonthlyVasteKosten: number
  totalMonthly: number
  userProfile: { full_name: string | null } | null
  onCancellationOpen: (metadata: CancellationMetadata) => void
  onRefresh: () => Promise<void>
}

// ── Category icons ───────────────────────────────────────────

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  subscription: CreditCard,
  rent: Home,
  mortgage: Building,
  utility: Zap,
  insurance: Shield,
  transport: Car,
}

function getCategoryIcon(category: string | null) {
  if (!category) return <HelpCircle className="h-3.5 w-3.5 text-[var(--ink-4)]" />
  const Icon = CATEGORY_ICON_MAP[category] ?? HelpCircle
  return <Icon className="h-3.5 w-3.5 text-wil-500" />
}

// ── Frequency labels ─────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = {
  weekly: 'per week',
  monthly: 'per maand',
  quarterly: 'per kwartaal',
  yearly: 'per jaar',
}

// ── Component ────────────────────────────────────────────────

export function VasteKostenAnalyse({
  subscriptions,
  vasteKosten,
  totalMonthlySubscriptions,
  totalMonthlyVasteKosten,
  totalMonthly,
  userProfile,
  onCancellationOpen,
  onRefresh,
}: VasteKostenAnalyseProps) {
  const [scanning, setScanning] = useState(false)
  const [classifyItem, setClassifyItem] = useState<ClassifyItemData | null>(null)
  const [aiSheetOpen, setAiSheetOpen] = useState(false)
  const totalCount = subscriptions.length + vasteKosten.length

  const handleScan = async () => {
    setScanning(true)
    try {
      await onRefresh()
    } finally {
      setScanning(false)
    }
  }

  /** Open the classify sheet for any recurring item */
  const handleClassifyClick = (item: RecurringItem) => {
    setClassifyItem({
      id: item.id,
      name: item.name,
      monthlyAmount: item.monthlyAmount,
      frequency: item.frequency,
      category: item.category,
      categoryOverride: item.categoryOverride,
      alreadyConfirmed: item.alreadyConfirmed,
    })
  }

  /** Open the cancellation/opzeg modal for a subscription */
  const handleSubscriptionOpzeg = (sub: RecurringItem, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent the classify sheet from opening
    const metadata: CancellationMetadata = {
      type: 'subscription_cancellation',
      subscription_name: sub.name,
      monthly_amount: sub.monthlyAmount,
      frequency: sub.frequency,
      user_name: userProfile?.full_name ?? '',
      user_address: '',
      user_postcode: '',
      user_city: '',
    }
    onCancellationOpen(metadata)
  }

  return (
    <CollapsibleSection
      storageKey="will-vaste-kosten-analyse"
      title={`Vaste Kosten Analyse (${totalCount})`}
      summary={`${formatCurrency(totalMonthly)}/mnd`}
      defaultOpen={false}
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">

        {/* ── Linker kolom: Abonnementen ── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-wil-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Abonnementen ({subscriptions.length})
            </h4>
          </div>

          {subscriptions.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--ink-4)]">
              Geen abonnementen gedetecteerd
            </p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map(sub => (
                <div
                  key={sub.id}
                  className="flex items-center rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] transition-colors hover:bg-[var(--subtle)]"
                >
                  {/* Main clickable area — opens classify sheet */}
                  <button
                    type="button"
                    onClick={() => handleClassifyClick(sub)}
                    aria-label={`${sub.name} classificeren — ${formatCurrency(sub.monthlyAmount)} per maand`}
                    className="flex min-w-0 flex-1 items-center justify-between px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wil-500"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <CreditCard className="h-3.5 w-3.5 shrink-0 text-wil-500" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--ink)]">{sub.name}</p>
                        <p className="text-xs text-[var(--ink-3)]">{FREQ_LABELS[sub.frequency] ?? sub.frequency}</p>
                      </div>
                    </div>
                    <p className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink)]">
                      {formatCurrency(sub.monthlyAmount)}/mnd
                    </p>
                  </button>
                  {/* Opzeg button — opens cancellation modal */}
                  <button
                    type="button"
                    onClick={(e) => handleSubscriptionOpzeg(sub, e)}
                    aria-label={`${sub.name} opzeggen`}
                    title="Opzeggen"
                    className="flex shrink-0 items-center self-stretch border-l border-[var(--border-ed)] px-3 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wil-500 dark:hover:bg-red-950"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
                <span className="text-xs font-medium text-[var(--ink-2)]">Subtotaal</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {formatCurrency(totalMonthlySubscriptions)}/mnd
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Rechter kolom: Vaste Kosten ── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Home className="h-4 w-4 text-wil-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              Vaste Kosten ({vasteKosten.length})
            </h4>
          </div>

          {vasteKosten.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--ink-4)]">
              Geen vaste kosten gedetecteerd
            </p>
          ) : (
            <div className="space-y-2">
              {vasteKosten.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleClassifyClick(item)}
                  aria-label={`${item.name} classificeren — ${formatCurrency(item.monthlyAmount)} per maand`}
                  className="flex w-full items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wil-500 focus-visible:ring-offset-1"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {getCategoryIcon(item.category)}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{item.name}</p>
                      <p className="text-xs text-[var(--ink-3)]">
                        {CATEGORY_LABELS[item.category] ?? item.category} &middot; {FREQ_LABELS[item.frequency] ?? item.frequency}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                      {formatCurrency(item.monthlyAmount)}/mnd
                    </p>
                    <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" aria-hidden="true" />
                  </div>
                </button>
              ))}

              <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
                <span className="text-xs font-medium text-[var(--ink-2)]">Subtotaal</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {formatCurrency(totalMonthlyVasteKosten)}/mnd
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Grand total + Nu scannen ── */}
      <div className="mt-6 border-t border-[var(--border-md)] pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--ink)]">Totaal vaste lasten</span>
          <div className="text-right">
            <span className="font-mono text-base font-bold tabular-nums text-[var(--ink)]">
              {formatCurrency(totalMonthly)}/mnd
            </span>
            <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
              {formatCurrency(totalMonthly * 12)}/jaar
            </p>
          </div>
        </div>

        <div className="mt-3 flex justify-center gap-3">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scannen...' : 'Nu scannen'}
          </button>
          <button
            type="button"
            onClick={() => setAiSheetOpen(true)}
            className="flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-wil-600 transition-colors hover:text-wil-700 dark:text-wil-400 dark:hover:text-wil-300"
          >
            <Sparkles className="h-3.5 w-3.5" />
            AI analyse vaste kosten
          </button>
        </div>
      </div>
      {/* ── Classify sheet ──────────────────────────────── */}
      <RecurringClassifySheet
        open={!!classifyItem}
        onOpenChange={(open) => { if (!open) setClassifyItem(null) }}
        item={classifyItem}
        onSaved={() => {
          setClassifyItem(null)
          onRefresh?.()
        }}
      />
      {/* ── AI vaste kosten sheet ──────────────────────── */}
      <AiVasteKostenSheet
        open={aiSheetOpen}
        onOpenChange={setAiSheetOpen}
        onComplete={() => {
          setAiSheetOpen(false)
          onRefresh?.()
        }}
      />
    </CollapsibleSection>
  )
}
