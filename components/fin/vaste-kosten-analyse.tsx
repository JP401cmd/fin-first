'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
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
  ChevronDown,
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
  /** Wanneer false: geen collapse-toggle, content altijd zichtbaar.
   *  Default true (backwards-compat met FinLanding-gebruik). */
  collapsible?: boolean
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
  collapsible = true,
}: VasteKostenAnalyseProps) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const [scanning, setScanning] = useState(false)
  const [classifyItem, setClassifyItem] = useState<ClassifyItemData | null>(null)
  const [aiSheetOpen, setAiSheetOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'abonnementen' | 'vaste-kosten'>('abonnementen')
  // Wanneer non-collapsible: altijd open, geen localStorage-state.
  const [isOpen, setIsOpen] = useState(!collapsible)
  const [mounted, setMounted] = useState(false)
  const totalCount = subscriptions.length + vasteKosten.length

  useEffect(() => {
    if (!collapsible) {
      setMounted(true)
      return
    }
    try {
      const stored = localStorage.getItem('collapsible_will-vaste-kosten-analyse')
      if (stored !== null) setIsOpen(stored === 'true')
    } catch { /* localStorage not available */ }
    setMounted(true)
  }, [collapsible])

  function toggleOpen() {
    if (!collapsible) return
    const next = !isOpen
    setIsOpen(next)
    try { localStorage.setItem('collapsible_will-vaste-kosten-analyse', String(next)) } catch { /* */ }
  }

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
    <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
      {/* ── Accent bar ── */}
      <div className="h-[3px] w-full bg-wil-500" />

      {/* ── Header — collapsible OF static (op aparte tab) ── */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={collapsible ? isOpen : undefined}
        disabled={!collapsible}
        className={`flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors sm:px-5 ${
          collapsible ? 'hover:bg-[var(--subtle)] cursor-pointer' : 'cursor-default'
        }`}
      >
        {collapsible && (
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        )}
        <div className="flex min-w-0 flex-1 items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-wil-500" />
            <h3 className="label-editorial text-[var(--ink-2)]">Vaste Kosten Analyse</h3>
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
              {totalCount}
            </span>
          </div>
          <p className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
            {fc(totalMonthly)}/mnd
          </p>
        </div>
      </button>

      {/* ── Collapsible content ── */}
      <div className={`transition-all duration-300 ease-in-out ${
        isOpen && mounted ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
      }`}>

      {/* ── Empty state: geen transacties ── */}
      {totalCount === 0 && (
        <div className="px-5 py-8 text-center">
          <CreditCard className="mx-auto mb-3 h-8 w-8 text-[var(--ink-4)]" />
          <p className="text-sm font-medium text-[var(--ink-2)]">Nog geen vaste kosten gevonden</p>
          <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-[var(--ink-4)]">
            Upload transacties of koppel een bankrekening zodat we je vaste kosten en abonnementen automatisch kunnen herkennen.
          </p>
        </div>
      )}

      {totalCount > 0 && (<>
      {/* ── Mobile tab bar (< md) ── */}
      <div className="border-b border-[var(--border-ed)] px-5 pb-3 pt-3 md:hidden">
        <div className="flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
          <button
            onClick={() => setActiveTab('abonnementen')}
            role="tab"
            aria-selected={activeTab === 'abonnementen'}
            className={`flex-1 rounded-[var(--r-sm)] px-2 py-2 text-[11px] font-semibold transition-colors ${
              activeTab === 'abonnementen'
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            Abonnementen ({subscriptions.length})
          </button>
          <button
            onClick={() => setActiveTab('vaste-kosten')}
            role="tab"
            aria-selected={activeTab === 'vaste-kosten'}
            className={`flex-1 rounded-[var(--r-sm)] px-2 py-2 text-[11px] font-semibold transition-colors ${
              activeTab === 'vaste-kosten'
                ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
            }`}
          >
            Vaste Kosten ({vasteKosten.length})
          </button>
        </div>
      </div>

      {/* ── Content grid — tabs on mobile, 2-col on desktop ── */}
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* ── Linker kolom: Abonnementen ── */}
        <div className={`p-5 md:border-r md:border-[var(--border-ed)] ${
          activeTab !== 'abonnementen' ? 'hidden md:block' : ''
        }`}>
          <div className="mb-3 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-wil-500" />
            <h4 className="label-editorial text-[var(--ink-2)]">Abonnementen</h4>
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
              {subscriptions.length}
            </span>
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
                    aria-label={`${sub.name} classificeren — ${fc(sub.monthlyAmount)} per maand`}
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
                      {fc(sub.monthlyAmount)}/mnd
                    </p>
                  </button>
                  {/* Opzeg button — opens cancellation modal */}
                  <button
                    type="button"
                    onClick={(e) => handleSubscriptionOpzeg(sub, e)}
                    aria-label={`${sub.name} opzeggen`}
                    title="Opzeggen"
                    className="flex shrink-0 items-center self-stretch border-l border-[var(--border-ed)] px-3 text-[var(--ink-4)] transition-colors hover:bg-[var(--negative)]/10 hover:text-[var(--negative)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wil-500"
                  >
                    <Ban className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
                <span className="text-xs font-medium text-[var(--ink-2)]">Subtotaal</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {fc(totalMonthlySubscriptions)}/mnd
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Rechter kolom: Vaste Kosten ── */}
        <div className={`p-5 ${
          activeTab !== 'vaste-kosten' ? 'hidden md:block' : ''
        }`}>
          <div className="mb-3 flex items-center gap-2">
            <Home className="h-4 w-4 text-wil-500" />
            <h4 className="label-editorial text-[var(--ink-2)]">Vaste Kosten</h4>
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--subtle)] px-1.5 font-mono text-[10px] font-bold tabular-nums text-[var(--ink-3)]">
              {vasteKosten.length}
            </span>
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
                  aria-label={`${item.name} classificeren — ${fc(item.monthlyAmount)} per maand`}
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
                      {fc(item.monthlyAmount)}/mnd
                    </p>
                    <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" aria-hidden="true" />
                  </div>
                </button>
              ))}

              <div className="flex items-center justify-between border-t border-[var(--border-ed)] pt-3">
                <span className="text-xs font-medium text-[var(--ink-2)]">Subtotaal</span>
                <span className="font-mono text-sm font-semibold tabular-nums text-[var(--ink)]">
                  {fc(totalMonthlyVasteKosten)}/mnd
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Grand total + Nu scannen ── */}
      <div className="border-t border-[var(--border-ed)] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--ink)]">Totaal vaste lasten</span>
          <div className="text-right">
            <span className="font-mono text-base font-bold tabular-nums text-[var(--ink)]">
              {fc(totalMonthly)}/mnd
            </span>
            <p className="font-mono text-xs tabular-nums text-[var(--ink-3)]">
              {fc(totalMonthly * 12)}/jaar
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
            Laat Fin analyseren
          </button>
        </div>
      </div>
      </>)}

      {/* end collapsible content */}
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
    </div>
  )
}
