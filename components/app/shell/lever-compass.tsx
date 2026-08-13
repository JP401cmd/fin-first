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
 * Bedoeld voor de Sidebar (desktop, naast branding of onder modules) en
 * de TopBar (mobile, in utility-cluster).
 */
'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Landmark,
  CreditCard,
  ArrowUpDown,
  Receipt,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'

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
  /** Optional navigation target when the lever is clicked. */
  href?: string
}

// Deeplinks naar de canonieke /overzicht/*-routes (bron: lib/nav-config.ts).
// Voedt alle vier render-varianten (Mobile/Collapsed/Dots/Expanded).
const LEVERS: LeverConfig[] = [
  { key: 'assets', label: 'Bezittingen', Icon: Landmark, href: '/overzicht/bezittingen' },
  { key: 'debts', label: 'Schulden', Icon: CreditCard, href: '/overzicht/schulden' },
  { key: 'cashflow', label: 'Cashflow', Icon: ArrowUpDown, href: '/overzicht/cashflow' },
  { key: 'tax', label: 'Belasting', Icon: Receipt, href: '/overzicht/belasting' },
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

// Ernst-volgorde voor het samenvatten van vier hefbomen tot één punt (NAV-6).
// 'neutral' (geen data) is bewust de laagste: geen data is geen probleem, maar
// het mag ook nooit een échte waarschuwing overstemmen.
const STATUS_SEVERITY: Record<LeverStatus, number> = {
  neutral: 0,
  green: 1,
  amber: 2,
  red: 3,
}

/**
 * De zwaarste status over alle vier de hefbomen — het ene punt dat in
 * Eenvoudig-weergave in de plaats komt van de vier losse stippen. Exporteerbaar
 * zodat de test hem tegen dezelfde bron kan houden.
 */
export function worstLeverStatus(scores: LeverScores): LeverStatus {
  return LEVERS.reduce<LeverStatus>((worst, { key }) => {
    const status = scores[key].status
    return STATUS_SEVERITY[status] > STATUS_SEVERITY[worst] ? status : worst
  }, 'neutral')
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
  progress,
  children,
}: {
  label: string
  status: LeverStatus
  detail: string
  /** Optional payoff progress (0–100) shown as a micro-bar in the tooltip. */
  progress?: number | null
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
          {progress != null && progress > 0 && (
            <div className="mt-1 pl-3 flex items-center gap-1.5">
              <div className="w-16 h-1 rounded-full bg-[var(--border-ed)] overflow-hidden">
                <div
                  className={`h-full rounded-full ${colors.dot}`}
                  style={{ width: `${Math.min(100, progress)}%`, transition: 'width 0.6s ease' }}
                />
              </div>
              <span className="text-[9px] text-[var(--ink-4)] tabular-nums">{Math.min(100, progress)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Mini progress ring (SVG) ────────────────────────────────────────────────

/**
 * Tiny SVG ring (14×14 px) that shows payoff progress as a circular arc.
 * Used in the expanded sidebar for the debt lever when progress data is available.
 * - Background ring: subtle grey
 * - Foreground arc: status-colored, proportional to progress (0–100)
 * - Progress ≥ 100 → fully filled ring (schuldenvrij)
 */
function MiniProgressRing({
  progress,
  status,
}: {
  progress: number
  status: LeverStatus
}) {
  const size = 14
  const strokeWidth = 2
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedProgress = Math.max(0, Math.min(100, progress))
  const dashOffset = circumference * (1 - clampedProgress / 100)

  const RING_COLORS: Record<LeverStatus, string> = {
    green: '#10b981',   // emerald-500
    amber: '#f59e0b',   // amber-500
    red: '#ef4444',     // red-500
    neutral: '#9ca3af', // gray-400
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`${clampedProgress}% afbetaald`}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border-ed)"
        strokeWidth={strokeWidth}
      />
      {/* Foreground arc */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={RING_COLORS[status]}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

// ── Compact render (inline dots — for TopBar) ────────────────────

/**
 * Ultra-compact variant: 4 gekleurde stippen naast elkaar met hover-tooltips.
 * Bedoeld voor TopBar utility-cluster waar ruimte beperkt is.
 */
export function LeverCompassDots({ scores }: { scores: LeverScores }) {
  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Financieel kompas"
    >
      {LEVERS.map(({ key, label, href }) => {
        const entry = scores[key]
        const colors = STATUS_COLORS[entry.status]
        const dot = (
          <span
            className={`block w-2 h-2 rounded-full ${colors.dot} ${href ? 'cursor-pointer' : 'cursor-default'}`}
            aria-label={`${label}: ${STATUS_LABELS[entry.status]} — ${entry.detail}`}
          />
        )
        return (
          <MiniTooltip
            key={key}
            label={label}
            status={entry.status}
            detail={entry.detail}
            progress={entry.progress}
          >
            {href ? <Link href={href}>{dot}</Link> : dot}
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
      {LEVERS.map(({ key, label, Icon, href }) => {
        const entry = scores[key]
        const colors = STATUS_COLORS[entry.status]
        const hasProgress = key === 'debts' && entry.progress != null
        const row = (
          <div
            className={`flex items-center gap-2 py-0.5 ${href ? 'cursor-pointer hover:bg-[var(--subtle)] -mx-2 px-2 rounded transition-colors' : 'cursor-default'}`}
          >
            <Icon className="w-3.5 h-3.5 text-[var(--ink-3)]" aria-hidden />
            <span className="flex-1 text-xs text-[var(--ink-2)] leading-tight">{label}</span>
            {hasProgress ? (
              <MiniProgressRing progress={entry.progress!} status={entry.status} />
            ) : (
              <span
                className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`}
                aria-label={`${STATUS_LABELS[entry.status]} — ${entry.detail}`}
              />
            )}
          </div>
        )
        return (
          <MiniTooltip
            key={key}
            label={label}
            status={entry.status}
            detail={entry.detail}
            progress={entry.progress}
          >
            {href ? <Link href={href} className="block">{row}</Link> : row}
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
      {LEVERS.map(({ key, label, href }) => {
        const entry = scores[key]
        const colors = STATUS_COLORS[entry.status]
        const dot = (
          <span
            className={`block w-2 h-2 rounded-full ${colors.dot} ${href ? 'cursor-pointer' : 'cursor-default'}`}
            aria-label={`${label}: ${STATUS_LABELS[entry.status]} — ${entry.detail}`}
          />
        )
        return (
          <MiniTooltip
            key={key}
            label={label}
            status={entry.status}
            detail={entry.detail}
            progress={entry.progress}
          >
            {href ? <Link href={href}>{dot}</Link> : dot}
          </MiniTooltip>
        )
      })}
    </div>
  )
}

// ── Mobile collapsed + expand (responsive <768px) ──────────────────────────

/**
 * Mobile-responsive kompas: toont 4 compacte gekleurde dots als een
 * tappable trigger. Bij tap opent een expanded panel met volledige lever-
 * informatie (icoon + label + status + detail + voortgang). Panel sluit
 * bij buiten-tap, Escape, of tweede tap op de trigger.
 *
 * Bedoeld voor de TopBar op mobiele schermen (<768px).
 * Op desktop (≥768px) rendert het niets — gebruik daar LeverCompassDots
 * of LeverCompassExpanded.
 */
export function LeverCompassMobile({ scores }: { scores: LeverScores }) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  // NAV-6 — in Eenvoudig één statuspunt in plaats van vier naamloze stippen.
  // Vier ongelabelde kleuren naast elkaar in een 48px-balk zijn niet te lezen
  // zonder ze aan te tikken; één punt zegt hetzelfde ("is er iets aan de hand?")
  // en de vier namen staan waar ze thuishoren: in het paneel eronder.
  const simple = useDisplayMode().mode === 'simple'
  const worst = worstLeverStatus(scores)

  // Close on outside click
  useEffect(() => {
    if (!expanded) return
    const handleOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [expanded])

  return (
    <div ref={containerRef} className="relative md:hidden">
      {/* Compact trigger: 4 dots in a tight cluster */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        className={
          simple
            ? 'flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] transition-colors hover:border-[var(--module-active-500)]'
            : 'flex items-center gap-[3px] rounded-full px-1.5 py-1 transition-colors hover:bg-[var(--subtle)]'
        }
        aria-label={
          expanded
            ? 'Kompas sluiten'
            : simple
              ? `Kompas: ${STATUS_LABELS[worst].toLowerCase()} — open het kompas`
              : 'Kompas openen'
        }
        aria-expanded={expanded}
        aria-haspopup="dialog"
      >
        {simple ? (
          <span
            className={`block h-2.5 w-2.5 rounded-full ${STATUS_COLORS[worst].dot}`}
            aria-hidden
          />
        ) : (
          LEVERS.map(({ key }) => {
            const entry = scores[key]
            const colors = STATUS_COLORS[entry.status]
            return (
              <span
                key={key}
                className={`block w-[6px] h-[6px] rounded-full ${colors.dot}`}
                aria-hidden
              />
            )
          })
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 w-64 max-w-[calc(100vw-2rem)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s2)] py-2"
          role="dialog"
          aria-label="Financieel kompas"
        >
          <div className="px-3 pb-1.5 mb-1 border-b border-[var(--border-ed)]">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ink-3)]">
              Kompas
            </span>
          </div>
          {LEVERS.map(({ key, label, Icon, href }) => {
            const entry = scores[key]
            const colors = STATUS_COLORS[entry.status]
            const hasProgress = key === 'debts' && entry.progress != null

            const content = (
              <div
                className={`flex items-start gap-2.5 px-3 py-2 ${href ? 'hover:bg-[var(--subtle)] cursor-pointer' : ''} transition-colors`}
              >
                <Icon className="w-4 h-4 text-[var(--ink-3)] mt-0.5 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-[var(--ink)]">{label}</span>
                    {hasProgress ? (
                      <MiniProgressRing progress={entry.progress!} status={entry.status} />
                    ) : (
                      <span
                        className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`}
                        aria-hidden
                      />
                    )}
                    <span className={`text-[10px] font-semibold ${colors.text} ml-auto`}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-3)] mt-0.5 leading-snug">
                    {entry.detail}
                  </div>
                  {hasProgress && entry.progress != null && entry.progress > 0 && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <div className="w-full h-1 rounded-full bg-[var(--border-ed)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${colors.dot}`}
                          style={{ width: `${Math.min(100, entry.progress)}%`, transition: 'width 0.6s ease' }}
                        />
                      </div>
                      <span className="text-[9px] text-[var(--ink-4)] tabular-nums shrink-0">
                        {Math.min(100, entry.progress)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )

            return href ? (
              <Link key={key} href={href} onClick={() => setExpanded(false)}>
                {content}
              </Link>
            ) : (
              <div key={key}>{content}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
