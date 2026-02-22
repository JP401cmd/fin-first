import Link from 'next/link'
import { Lock, ArrowRight } from 'lucide-react'
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

// ── Min heights ───────────────────────────────────────────────
const SIZE_HEIGHT: Record<WidgetSize, string> = {
  half: 'min-h-[180px]',
  full: 'min-h-[360px]',
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
}

export function WidgetShell({ module, size, kicker, href, onClick, children, className = '' }: WidgetShellProps) {
  const accent = MODULE_ACCENT[module]
  const hoverBorder = MODULE_HOVER_BORDER[module]
  const kickerColor = MODULE_KICKER[module]
  const minH = SIZE_HEIGHT[size]
  const isInteractive = !!(href ?? onClick)

  const baseClasses = `group relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] transition-all ${minH} ${className}`
  const interactiveClasses = isInteractive
    ? `cursor-pointer text-left w-full ${hoverBorder} hover:shadow-[var(--s1)] hover:-translate-y-px`
    : ''

  const content = (
    <>
      {/* 3px top accent bar */}
      <div className={`h-[3px] w-full ${accent}`} />

      <div className="p-4 flex flex-col h-full">
        {/* Kicker */}
        <p className={`label-editorial ${kickerColor} mb-2`}>{kicker}</p>

        {/* Widget content */}
        <div className="flex-1 min-w-0">
          {children}
        </div>

        {/* Hover arrow */}
        {isInteractive && (
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
}

// ── LockedWidgetShell ─────────────────────────────────────────

interface LockedWidgetShellProps {
  module: WidgetModule
  size: WidgetSize
  name: string
  requiredPhase: string
}

export function LockedWidgetShell({ module, size, name, requiredPhase }: LockedWidgetShellProps) {
  const accent = MODULE_ACCENT[module]
  const minH = SIZE_HEIGHT[size]

  return (
    <div
      className={`relative overflow-hidden rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/80 opacity-60 ${minH}`}
    >
      {/* Faded accent bar */}
      <div className={`h-[3px] w-full ${accent} opacity-30`} />

      <div className="flex flex-col items-center justify-center h-[calc(100%-3px)] gap-2 p-4 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--subtle)] border border-[var(--border-ed)]">
          <Lock className="h-4 w-4 text-[var(--ink-4)]" />
        </div>
        <p className="text-sm font-medium text-[var(--ink-3)]">{name}</p>
        <span className="rounded-full bg-[var(--subtle)] border border-[var(--border-ed)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
          Beschikbaar in {requiredPhase}
        </span>
      </div>
    </div>
  )
}
