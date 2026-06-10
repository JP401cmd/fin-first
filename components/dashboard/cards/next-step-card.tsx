'use client'

import { useState, useCallback } from 'react'
import { ArrowRight, X, Zap, Target, PiggyBank, ShoppingCart, Building2, Receipt, Compass, BarChart3, Lightbulb, TrendingUp, Wallet, CreditCard, FileText, Download, Upload, Settings, Star, Award, Flag, Clock, Calendar, Shield, Heart, BookOpen } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import type { NextStepCardSpec } from '@/lib/briefing/types'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  zap: Zap, target: Target, 'piggy-bank': PiggyBank,
  'shopping-cart': ShoppingCart, building: Building2,
  receipt: Receipt, compass: Compass, 'bar-chart': BarChart3,
  lightbulb: Lightbulb, 'trending-up': TrendingUp, wallet: Wallet,
  'credit-card': CreditCard, 'file-text': FileText, download: Download,
  upload: Upload, settings: Settings, star: Star, award: Award,
  flag: Flag, clock: Clock, calendar: Calendar, shield: Shield,
  heart: Heart, 'book-open': BookOpen,
}

const MODULE_BORDER: Record<string, string> = {
  kern: 'border-l-kern-500',
  wil: 'border-l-wil-500',
  horizon: 'border-l-horizon-500',
  cross: 'border-l-zinc-400',
}

const MODULE_BADGE: Record<string, string> = {
  kern: 'bg-kern-100 text-kern-700',
  wil: 'bg-wil-100 text-wil-700',
  horizon: 'bg-horizon-100 text-horizon-700',
  cross: 'bg-zinc-100 text-zinc-700',
}

const MODULE_ICON_BG: Record<string, string> = {
  kern: 'bg-kern-50',
  wil: 'bg-wil-50',
  horizon: 'bg-horizon-50',
  cross: 'bg-[var(--subtle)]',
}

const MODULE_ICON_COLOR: Record<string, string> = {
  kern: 'text-kern-600',
  wil: 'text-wil-600',
  horizon: 'text-horizon-600',
  cross: 'text-[var(--ink-3)]',
}

interface Props {
  spec: NextStepCardSpec
}

export function NextStepBriefingCard({ spec }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [dismissing, setDismissing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const Icon = ICON_MAP[spec.icon] ?? Zap
  const badgeClass = MODULE_BADGE[spec.module] ?? MODULE_BADGE.cross
  const borderClass = MODULE_BORDER[spec.module] ?? MODULE_BORDER.cross
  const iconBg = MODULE_ICON_BG[spec.module] ?? MODULE_ICON_BG.cross
  const iconColor = MODULE_ICON_COLOR[spec.module] ?? MODULE_ICON_COLOR.cross

  const handleDismiss = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dismissing || !spec.dismissKey) return

    // Optimistic UI: start fade-out immediately
    setFadingOut(true)
    setDismissing(true)
    setError(null)

    try {
      const res = await fetch('/api/next-steps/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: spec.dismissKey }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // Wait for fade-out animation to complete, then remove from DOM
      setTimeout(() => setDismissed(true), 200)
    } catch {
      // Revert: show the card again with error message
      setFadingOut(false)
      setError('Kon suggestie niet verbergen. Probeer opnieuw.')
      // Auto-clear error after 3 seconds
      setTimeout(() => setError(null), 3000)
    } finally {
      setDismissing(false)
    }
  }, [dismissing, spec.dismissKey])

  if (dismissed) return null

  return (
    <div
      className="transition-all duration-200 ease-out"
      style={{
        opacity: fadingOut ? 0 : 1,
        transform: fadingOut ? 'scale(0.95)' : 'scale(1)',
      }}
    >
      <BriefingCard module={spec.module} href={spec.href} className={`border-l-[3px] ${borderClass}`}>
        <div className="flex items-start gap-3">
          {/* Module-colored icon — 20px mobile, 24px desktop */}
          <div className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-[var(--r)] ${iconBg}`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeClass}`}>
                Volgende Stap
              </span>
            </div>
            <p className="text-sm font-semibold leading-snug text-[var(--ink)] line-clamp-2">{spec.title}</p>
            <p className="text-xs sm:text-sm leading-relaxed text-[var(--ink-3)] mt-1 line-clamp-2">{spec.description}</p>
            {/* CTA — full-width tap target, min 44px height on mobile */}
            <div className="flex items-center gap-1 text-xs font-medium text-[var(--ink-4)] mt-2 min-h-[44px] sm:min-h-0">
              <ArrowRight className="h-3.5 w-3.5" />
              <span>Ga aan de slag</span>
            </div>
          </div>

          {/* Dismiss button — 44x44px touch target, doesn't overlap text */}
          {spec.dismissKey && (
            <button
              type="button"
              onClick={handleDismiss}
              disabled={dismissing}
              className="flex shrink-0 items-center justify-center min-w-[44px] min-h-[44px] -mr-2 -mt-2 rounded-[var(--r)] text-[var(--ink-4)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors"
              aria-label="Verberg suggestie"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Error toast — shows briefly when dismiss fails */}
        {error && (
          <p className="mt-2 text-xs text-negative animate-fade-up">{error}</p>
        )}
      </BriefingCard>
    </div>
  )
}
