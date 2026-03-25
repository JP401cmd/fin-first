'use client'

import { useState } from 'react'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { formatCurrency } from '@/lib/format'
import { CATEGORY_LABELS, type RecurringCategory } from '@/lib/recurring-detection'
import type { CancellationMetadata } from '@/lib/cancellation-types'
import {
  CreditCard,
  Home,
  Building,
  Zap,
  Shield,
  Car,
  HelpCircle,
  ChevronRight,
  RefreshCw,
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
  const totalCount = subscriptions.length + vasteKosten.length

  const handleScan = async () => {
    setScanning(true)
    try {
      await onRefresh()
    } finally {
      setScanning(false)
    }
  }

  const handleSubscriptionClick = (sub: RecurringItem) => {
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
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => handleSubscriptionClick(sub)}
                  aria-label={`${sub.name} opzeggen — ${formatCurrency(sub.monthlyAmount)} per maand`}
                  className="flex w-full items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wil-500 focus-visible:ring-offset-1"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CreditCard className="h-3.5 w-3.5 shrink-0 text-wil-500" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{sub.name}</p>
                      <p className="text-xs text-[var(--ink-3)]">{FREQ_LABELS[sub.frequency] ?? sub.frequency}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="font-mono text-sm tabular-nums text-[var(--ink)]">
                      {formatCurrency(sub.monthlyAmount)}/mnd
                    </p>
                    <ChevronRight className="h-4 w-4 text-[var(--ink-4)]" aria-hidden="true" />
                  </div>
                </button>
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
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3"
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
                  <p className="shrink-0 font-mono text-sm tabular-nums text-[var(--ink)]">
                    {formatCurrency(item.monthlyAmount)}/mnd
                  </p>
                </div>
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

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex min-h-[44px] items-center gap-1.5 px-3 text-sm text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scannen...' : 'Nu scannen'}
          </button>
        </div>
      </div>
    </CollapsibleSection>
  )
}
