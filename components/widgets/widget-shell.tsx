'use client'

import { memo, useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { WidgetModule, WidgetSize } from '@/lib/widget-catalog'

// ── Module accent colors ──────────────────────────────────────
const MODULE_ACCENT: Record<WidgetModule, string> = {
  kern:    'bg-kern-500',
  wil:     'bg-wil-500',
  horizon: 'bg-horizon-500',
  cross:   'bg-[var(--border-md)]',
}

const MODULE_HOVER_BORDER: Record<WidgetModule, string> = {
  kern:    'hover:border-kern-200',
  wil:     'hover:border-wil-200',
  horizon: 'hover:border-horizon-200',
  cross:   'hover:border-[var(--border-md)]',
}

const MODULE_KICKER: Record<WidgetModule, string> = {
  kern:    'text-kern-600',
  wil:     'text-wil-600',
  horizon: 'text-horizon-600',
  cross:   'text-[var(--ink-3)]',
}

// ── Fixed heights (match grid row heights) ──
// Mobile: 64px rows, 12px gap → mini = 64px, quarter = 64×2+12 = 140px, full = 140×2+12 = 296px (approximation via 2-row spans)
// Desktop (sm+): 160px rows, 16px gap → quarter/half = 160px, full = 160×2 + 16 = 336px
const SIZE_HEIGHT: Record<WidgetSize, string> = {
  mini:    'h-[64px]',
  quarter: 'h-[140px] sm:h-[160px]',
  half:    'h-[140px] sm:h-[160px]',
  full:    'h-[296px] sm:h-[336px]',
  // xl (Double) spant 2 rijen net als full — alleen breder (4 kolommen)
  xl:      'h-[296px] sm:h-[336px]',
}

// ── Scroll-fade wrapper for full-size content ─────────────────
function ScrollableContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canScroll, setCanScroll] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setCanScroll(el.scrollHeight > el.clientHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <div ref={ref} className="overflow-x-hidden overflow-y-auto h-full min-w-0 scrollbar-thin">
        {children}
      </div>
      {canScroll && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-[var(--paper)] to-transparent" />
      )}
    </div>
  )
}

// ── WidgetShell ───────────────────────────────────────────────

interface WidgetShellProps {
  module: WidgetModule
  size: WidgetSize
  kicker: string
  href?: string
  onClick?: () => void
  children: React.ReactNode
  className?: string
  /** Render kicker as rotated vertical label on the left side */
  kickerPosition?: 'top' | 'left'
}

export const WidgetShell = memo(function WidgetShell({ module, size, kicker, href, onClick, children, className = '', kickerPosition = 'top' }: WidgetShellProps) {
  const accent = MODULE_ACCENT[module]
  const hoverBorder = MODULE_HOVER_BORDER[module]
  const kickerColor = MODULE_KICKER[module]
  const h = SIZE_HEIGHT[size]
  const isInteractive = !!(href ?? onClick)
  const isMini = size === 'mini'
  const isQuarter = size === 'quarter'

  const baseClasses = `group relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] transition-all ${h} ${className}`
  const interactiveClasses = isInteractive
    ? isMini
      ? `cursor-pointer text-left w-full ${hoverBorder} hover:shadow-[var(--s1)]`
      : `cursor-pointer text-left w-full ${hoverBorder} hover:shadow-[var(--s1)] hover:-translate-y-px`
    : ''

  // ── Mini layout: ultra-compact single row ──
  if (isMini) {
    const miniContent = (
      <>
        <div className={`h-[2px] w-full ${accent}`} />
        <div className="flex h-[62px] items-center px-3">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <p className={`text-[9px] font-bold uppercase tracking-[0.10em] leading-none ${kickerColor}`}>
              {kicker}
            </p>
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </>
    )

    if (href) {
      return (
        <Link href={href} className={`block ${baseClasses} ${interactiveClasses}`}>
          {miniContent}
        </Link>
      )
    }
    if (onClick) {
      return (
        <button type="button" onClick={onClick} className={`${baseClasses} ${interactiveClasses}`}>
          {miniContent}
        </button>
      )
    }
    return <div className={baseClasses}>{miniContent}</div>
  }

  const content = kickerPosition === 'left' ? (
    <>
      {/* 3px top accent bar */}
      <div className={`h-[3px] w-full ${accent}`} />

      <div className="flex h-[calc(100%-3px)]">
        {/* Vertical kicker on the left — max-h + overflow zodat een lange
            (favoriet)naam de tegel niet oprekt of hard wegknipt */}
        <div className="flex min-h-0 shrink-0 items-center justify-center border-r border-[var(--border-ed)] px-1.5">
          <p className={`label-editorial ${kickerColor} [writing-mode:vertical-rl] rotate-180 max-h-full overflow-hidden text-ellipsis whitespace-nowrap`}>
            {kicker}
          </p>
        </div>

        {/* Content area */}
        <div className="flex-1 flex flex-col p-3 min-w-0 overflow-hidden">
          {size === 'full' ? (
            <ScrollableContent>{children}</ScrollableContent>
          ) : (
            <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
          )}
          {isInteractive && !isQuarter && (
            <div className="mt-1 flex justify-end">
              <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-4)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          )}
        </div>
      </div>
    </>
  ) : (
    <>
      {/* 3px top accent bar */}
      <div className={`h-[3px] w-full ${accent}`} />

      <div className={`${isQuarter || size === 'half' ? 'p-3' : 'p-4'} flex flex-col h-full overflow-hidden`}>
        {/* Kicker — op één regel geklemd zodat lange (favoriet)namen de tegel niet oprekken */}
        <p className={`label-editorial truncate ${kickerColor} ${isQuarter ? 'mb-0.5 !text-[9px]' : size === 'half' ? 'mb-1' : 'mb-2'}`}>{kicker}</p>

        {/* Widget content */}
        {size === 'full' ? (
          <ScrollableContent>{children}</ScrollableContent>
        ) : (
          <div className="flex-1 min-w-0 overflow-hidden">{children}</div>
        )}

        {/* Hover arrow — hidden on quarter (too compact) */}
        {isInteractive && !isQuarter && (
          <div className="mt-3 flex justify-end">
            <ArrowRight className="h-3.5 w-3.5 text-[var(--ink-4)] opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        )}
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`block ${baseClasses} ${interactiveClasses}`}>
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${baseClasses} ${interactiveClasses}`}>
        {content}
      </button>
    )
  }

  return (
    <div className={baseClasses}>
      {content}
    </div>
  )
})

