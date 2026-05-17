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
 * Bedoeld voor de sidebar (desktop, naast branding of onder modules) en
 * de AppHeader / TopBar (mobile, in utility-cluster).
 */
'use client'

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
export type { LeverStatus, LeverScores } from '@/components/app/shell/lever-scores'

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

const STATUS_COLORS: Record<LeverStatus, { dot: string; text: string; bg: string }> = {
  green:   { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  amber:   { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  red:     { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' },
  neutral: { dot: 'bg-[var(--ink-4)]', text: 'text-[var(--ink-3)]', bg: 'bg-[var(--subtle)]' },
}

const STATUS_LABELS: Record<LeverStatus, string> = {
  green: 'Gezond',
  amber: 'Aandacht',
  red: 'Zorg',
  neutral: 'Geen data',
}

// ── Compact render (inline dots — for TopBar / AppHeader) ────────────────────

/**
 * Ultra-compact variant: 4 gekleurde stippen naast elkaar.
 * Bedoeld voor TopBar utility-cluster of AppHeader waar ruimte beperkt is.
 */
export function LeverCompassDots({ scores }: { scores: LeverScores }) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Financieel kompas"
      title="Financieel kompas — bezittingen, schulden, cashflow, belasting"
    >
      {LEVERS.map(({ key, label }) => {
        const { status } = scores[key]
        const colors = STATUS_COLORS[status]
        return (
          <span
            key={key}
            className={`block w-2 h-2 rounded-full ${colors.dot}`}
            title={`${label}: ${STATUS_LABELS[status]}`}
            aria-label={`${label}: ${STATUS_LABELS[status]}`}
          />
        )
      })}
    </div>
  )
}

// ── Expanded render (sidebar) ────────────────────────────────────────────────

/**
 * Sidebar-variant: 4 rijen met icon + label + status-dot.
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
        const { status } = scores[key]
        const colors = STATUS_COLORS[status]
        return (
          <div
            key={key}
            className="flex items-center gap-2 py-0.5"
            title={`${label}: ${STATUS_LABELS[status]}`}
          >
            <Icon className="w-3.5 h-3.5 text-[var(--ink-3)]" aria-hidden />
            <span className="flex-1 text-xs text-[var(--ink-2)] leading-tight">{label}</span>
            <span
              className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`}
              aria-label={STATUS_LABELS[status]}
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Collapsed sidebar variant: 4 stippen verticaal gestapeld.
 */
export function LeverCompassCollapsed({ scores }: { scores: LeverScores }) {
  return (
    <div
      className="flex flex-col items-center gap-1.5 py-2"
      role="group"
      aria-label="Financieel kompas"
    >
      {LEVERS.map(({ key, label }) => {
        const { status } = scores[key]
        const colors = STATUS_COLORS[status]
        return (
          <span
            key={key}
            className={`block w-2 h-2 rounded-full ${colors.dot}`}
            title={`${label}: ${STATUS_LABELS[status]}`}
            aria-label={`${label}: ${STATUS_LABELS[status]}`}
          />
        )
      })}
    </div>
  )
}
