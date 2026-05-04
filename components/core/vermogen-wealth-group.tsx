'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { MaskedAmount } from '@/components/app/masked-amount'
import {
  type WealthGroup,
  WEALTH_GROUP_LABELS,
  WEALTH_GROUP_COLORS,
} from '@/lib/wealth-composition'

// ── Props ───────────────────────────────────────────────────

interface VermogenWealthGroupProps {
  layer: WealthGroup
  totalValue: number
  count: number
  defaultOpen?: boolean
  children: ReactNode
}

// ── Component ───────────────────────────────────────────────

export function VermogenWealthGroup({
  layer,
  totalValue,
  count,
  defaultOpen = true,
  children,
}: VermogenWealthGroupProps) {
  const [open, setOpen] = useState(defaultOpen)
  const accentColor = WEALTH_GROUP_COLORS[layer]

  return (
    <section>
      {/* Group header — clickable on mobile, always-expanded indicator on desktop */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 py-2 text-left sm:pointer-events-none"
        aria-expanded={open}
      >
        {/* Left: accent bar + label + count */}
        <div className="flex items-center gap-2.5">
          <div
            className="h-4 w-[3px] shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <span className="label-editorial text-[var(--ink-2)]">
            {WEALTH_GROUP_LABELS[layer]}
          </span>
          <span className="text-[10px] font-medium tabular-nums text-[var(--ink-4)]">
            ({count})
          </span>
        </div>

        {/* Right: total value + chevron */}
        <div className="flex items-center gap-1.5">
          <MaskedAmount value={totalValue} tone="kern" className="text-sm font-semibold text-[var(--ink)]" />
          <ChevronDown
            className={`h-4 w-4 text-[var(--ink-4)] transition-transform duration-200 sm:hidden ${
              open ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Content: card grid — toggled on mobile, always visible on desktop */}
      <div
        className={`mt-1 ${open ? 'block' : 'hidden'} sm:block`}
      >
        {children}
      </div>
    </section>
  )
}
