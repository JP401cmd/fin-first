'use client'

import Link from 'next/link'
import { Shield, Telescope, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'

interface ModuleStripProps {
  /** Monthly net worth growth (income - expenses) */
  monthlyGrowth: number
  /** Growth formatted as freedom-time string */
  growthDaysStr: string | null
  /** Simulation-derived FIRE countdown, or null */
  simFireCountdown: {
    countdownYears: number
    countdownMonths: number
    countdownDays: number
  } | null
}

export function ModuleStrip({
  monthlyGrowth,
  growthDaysStr,
  simFireCountdown,
}: ModuleStripProps) {
  const growthSign = monthlyGrowth >= 0 ? '+' : ''
  const growthLabel = `${growthSign}${formatCurrency(monthlyGrowth)}`
  const growthSub = growthDaysStr ? ` (${growthDaysStr})` : ''

  const countdownLabel = simFireCountdown
    ? `${simFireCountdown.countdownYears} jaar en ${simFireCountdown.countdownMonths} maanden`
    : '—'

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* De Kern */}
      <Link
        href="/core"
        className="card-editorial flex items-center gap-3 border-l-3 border-kern-400 p-4 no-underline"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-kern-100">
          <Shield className="h-5 w-5 text-kern-700" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-kern-700">
            De Kern
          </p>
          <p className="mt-0.5 truncate font-mono text-xs tabular-nums text-[var(--ink-3)]">
            {growthLabel}
            {growthSub}
          </p>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
      </Link>

      {/* De Horizon */}
      <Link
        href="/horizon"
        className="card-editorial flex items-center gap-3 border-l-3 border-horizon-400 p-4 no-underline"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-horizon-100">
          <Telescope className="h-5 w-5 text-horizon-700" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-horizon-700">
            De Horizon
          </p>
          <p className="mt-0.5 truncate font-mono text-xs tabular-nums text-[var(--ink-3)]">
            {countdownLabel}
          </p>
        </div>

        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--ink-4)]" />
      </Link>
    </div>
  )
}
