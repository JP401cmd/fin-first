'use client'

import { useState, useEffect, useCallback } from 'react'
import { EyeOff, Info } from 'lucide-react'
import type { PrivacySettings, PrivacyLevel } from '@/lib/household-data'

// ── Hook: usePartnerPrivacy ──────────────────────────────────────────────

export interface PartnerPrivacyData {
  hasPartner: boolean
  partnerPrivacy: PrivacySettings | null
  hiddenCategories: (keyof PrivacySettings)[]
  loading: boolean
}

/**
 * Hook to fetch the partner's privacy settings.
 * Returns which categories the partner has hidden or restricted.
 */
export function usePartnerPrivacy(): PartnerPrivacyData {
  const [data, setData] = useState<PartnerPrivacyData>({
    hasPartner: false,
    partnerPrivacy: null,
    hiddenCategories: [],
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/household/partner-privacy')
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (cancelled) return
        setData({
          hasPartner: json.hasPartner ?? false,
          partnerPrivacy: json.partnerPrivacy ?? null,
          hiddenCategories: json.hiddenCategories ?? [],
          loading: false,
        })
      } catch {
        if (!cancelled) setData(prev => ({ ...prev, loading: false }))
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return data
}

/**
 * Check if a specific category is hidden by the partner.
 */
export function isCategoryHidden(
  partnerPrivacy: PrivacySettings | null,
  category: keyof PrivacySettings,
): boolean {
  if (!partnerPrivacy) return false
  return partnerPrivacy[category] === 'hidden'
}

/**
 * Get the privacy level for a specific category.
 */
export function getCategoryPrivacyLevel(
  partnerPrivacy: PrivacySettings | null,
  category: keyof PrivacySettings,
): PrivacyLevel {
  if (!partnerPrivacy) return 'full'
  return partnerPrivacy[category]
}

/**
 * Filter partner items from a data array based on privacy settings.
 * Returns only items that should be visible (removes partner's personal items
 * for hidden categories).
 */
export function filterPartnerItems<T extends { ownership?: string; user_id?: string }>(
  items: T[],
  userId: string,
  partnerPrivacy: PrivacySettings | null,
  category: keyof PrivacySettings,
): T[] {
  if (!partnerPrivacy || partnerPrivacy[category] !== 'hidden') {
    return items
  }
  // Remove partner's personal items (keep own items + shared items)
  return items.filter(
    item => item.user_id === userId || item.ownership === 'shared'
  )
}

// ── Component: PrivacyHiddenNotice ───────────────────────────────────────

interface PrivacyHiddenNoticeProps {
  /** Which categories are hidden */
  hiddenCategories: (keyof PrivacySettings)[]
  /** Only show notice for specific categories (filter) */
  forCategories?: (keyof PrivacySettings)[]
  /** Compact mode — just an icon with tooltip */
  compact?: boolean
}

const CATEGORY_LABELS: Record<keyof PrivacySettings, string> = {
  assets: 'vermogen',
  debts: 'schulden',
  budgets: 'budgetten',
  transactions: 'transacties',
  income: 'inkomen',
}

/**
 * Subtle notice that some partner data is hidden by their privacy settings.
 * Feature #537: "Controleer dat er een subtiele indicatie is dat niet alle data zichtbaar is"
 */
export function PrivacyHiddenNotice({
  hiddenCategories,
  forCategories,
  compact = false,
}: PrivacyHiddenNoticeProps) {
  // Filter to only relevant categories
  const relevant = forCategories
    ? hiddenCategories.filter(c => forCategories.includes(c))
    : hiddenCategories

  if (relevant.length === 0) return null

  const labels = relevant.map(c => CATEGORY_LABELS[c])
  const text = labels.length === 1
    ? `Partner ${labels[0]} is privé`
    : `Partner ${labels.join(' en ')} zijn privé`

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-4)]"
        title={text}
        data-testid="privacy-hidden-notice"
      >
        <EyeOff className="h-3 w-3" />
      </span>
    )
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded-lg bg-[var(--subtle)] px-2.5 py-1.5 text-[11px] text-[var(--ink-4)]"
      data-testid="privacy-hidden-notice"
    >
      <EyeOff className="h-3 w-3 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
