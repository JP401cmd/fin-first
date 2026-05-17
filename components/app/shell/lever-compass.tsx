/**
 * Vier-hefbomen-kompas — compact component voor shell header.
 *
 * Toont 4 hefboom-indicatoren (bezittingen, schulden, cashflow, belasting)
 * in één oogopslag. Elke indicator heeft een kleurcode:
 *   - Groen  (score ≥ 60): gezond
 *   - Amber  (score 30–59): aandacht nodig
 *   - Rood   (score < 30): zorg
 *   - Grijs  (null): onvoldoende data
 *
 * Hover/tap op een indicator toont een mini-tooltip met detailinformatie
 * (bv. "4 typen · € 834k" voor bezittingen).
 *
 * Bedoeld voor de sidebar (desktop, naast branding of onder modules) en
 * de AppHeader / TopBar (mobile, in utility-cluster).
 */
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Landmark,
  CreditCard,
  ArrowUpDown,
  Receipt,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Re-export types and computation from shared (non-client) module so that
// existing imports from this file continue to work — but the actual logic
// lives in lever-scores.ts which has NO 'use client', making it safe to
// call from server components (e.g. app/(app)/layout.tsx).
export { computeLeverScores } from '@/components/app/shell/lever-scores'
export type { LeverStatus, LeverScores, LeverEntry } from '@/components/app/shell/lever-scores'

import type { LeverStatus, LeverScores } from '@/components/app/shell/lever-scores'

// ── Lever config ─────────────────────────────────────────────────────────────

type LeverConfig = {
  key: keyof LeverScores
  label: string
  Icon: LucideIcon
}

const LEVERS: LeverConfig[] = [
  { key: 'assets', label: 'Bezittingen', Icon: Landmark },
  { key: 'debts', label: 'Schulden', Icon: CreditCard },
  { key: 'cashflow', label: 'Cashflow', Icon: ArrowUpDown },
  { key: 'tax', label: 'Belasting', Icon: Receipt },
]

// ── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<LeverStatus, { dot: string; text: string; bg: string; border: string }> = {
  green:   { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  amber:   { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  red:     { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  neutral: { dot: 'bg-[var(--ink-4)]', text: 'text-[var(--ink-3)]', bg: 'bg-[var(--subtle)]', border: 'border-[var(--border-ed)]' },
}

const STATUS_LABELS: Record<LeverStatus, string> = {
  green: 'Gezond',
  amber: 'Aandacht',
  red: 'Zorg',
  neutral: 'Geen data',
}

// ── Mini-tooltip (CSS-based, no portal) ─────────────────────────────────────

/**
 * Wrapper that shows a mini-tooltip on hover (desktop) or tap (mobile).
 * Uses relative positioning + CSS visibility toggle — no portals, no state
 * management overhead. Tooltip appears below the trigger.
 */
function MiniTooltip({
  label,
  status,
  detail,
  children,
}: {
  label: string
  status: LeverStatus
  detail: string
  children: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleEnter = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShow(true)
  }, [])

  const handleLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => setShow(false), 150)
  }, [])

  // Mobile: close on outside tap
  useEffect(() => {
    if (!show) return
    const handleOutsideTap = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShow(false)
      }
    }
    document.addEventListener('pointerdown', handleOutsideTap)
    return () => document.removeEventListener('pointerdown', handleOutsideTap)
  }, [show])

  const colors = STATUS_COLORS[status]

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onPointerDown={() => setShow(prev => !prev)}
    >
      {children}
      {show && (
        <div
          className={`absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1.5 whitespace-nowrap px-2.5 py-1.5 border ${colors.border} ${colors.bg} shadow-sm pointer-events-none`}
          role="tooltip"
        >
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} aria-hidden />
            <span className={`text-[11px] font-semibold ${colors.text}`}>
              {label}: {STATUS_LABELS[status]}
            </span>
          </div>
          <div className="text-[10px] text-[var(--ink-3)] mt-0.5 pl-3">
            {detail}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compact render (inline dots — for TopBar / AppHeader) ────────────────────

/**
 * Ultra-compact variant: 4 gekleurde stippen naast elkaar met hover-tooltips.
 * Bedoeld voor TopBar utility-cluster of AppHeader waar ruimte beperkt is.
 */
export function LeverCompassDots({ scores }: { scores: LeverScores }) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Financieel kompas"
    >
      {LEVERS.map(({ key, label }) => {
        const entry = scores[key]
        const colors = STATUS_COLORS[entry.status]
        return (
          <MiniTooltip
            key={key}
            label={label}
            status={entry.status}
            detail={entry.detail}
          >
            <span
              className={`block w-2 h-2 rounded-full ${colors.dot} cursor-default`}
              aria-label={`${label}: ${STATUS_LABELS[entry.status]} — ${entry.detail}`}
            />
          </MiniTooltip>
        )
      })}
    </div>
  )
}

// ── Expanded render (sidebar) ────────────────────────────────────────────────

/**
 * Sidebar-variant: 4 rijen met icon + label + status-dot + hover-tooltip.
 * Past in de sidebar in expanded mode (264px breed).
 */
export function LeverCompassExpanded({ scores }: { scores: LeverScores }) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-2"
      role="group"
      aria-label="Financieel kompas"
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)] mb-0.5">
        Kompas
      </span>
      {LEVERS.map(({ key, label, Icon }) => {
        const entry = scores[key]
        const colors = STATUS_COLORS[entry.status]
        return (
          <MiniTooltip
            key={key}
            label={label}
            status={entry.status}
            detail={entry.detail}
          >
            <div
              className="flex items-center gap-2 py-0.5 cursor-default"
            >
              <Icon className="w-3.5 h-3.5 text-[var(--ink-3)]" aria-hidden />
              <span className="flex-1 text-xs text-[var(--ink-2)] leading-tight">{label}</span>
              <span
                className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`}
                aria-label={`${STATUS_LABELS[entry.status]} — ${entry.detail}`}
              />
            </div>
          </MiniTooltip>
        )
      })}
    </div>
  )
}

/**
 * Collapsed sidebar variant: 4 stippen verticaal gestapeld met hover-tooltips.
 */
export function LeverCompassCollapsed({ scores }: { scores: LeverScores }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 py-2"
      role="group"
      aria-label="Financieel kompas"
    >
      {LEVERS.map(({ key, label }) => {
        const entry = scores[key]
        const colors = STATUS_COLORS[entry.status]
        return (
          <MiniTooltip
            key={key}
            label={label}
            status={entry.status}
            detail={entry.detail}
          >
            <span
              className={`block w-2 h-2 rounded-full ${colors.dot} cursor-default`}
              aria-label={`${label}: ${STATUS_LABELS[entry.status]} — ${entry.detail}`}
            />
          </MiniTooltip>
        )
      })}
    </div>
  )
}
