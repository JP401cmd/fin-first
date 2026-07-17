'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Check, Circle, Shield } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import {
  LEVEL_NAMES,
  NEXT_LEVEL_MOTIVATION,
  NEXT_LEVEL_CRITERIA,
  type SovereigntyCriterionInput,
} from '@/lib/sovereignty-journey'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// ── Phase definitions ─────────────────────────────────────────
const PHASES = [
  { id: 'recovery',  label: 'Herstel',      color: 'phase_recovery',  levels: [-2, -1, 0] },
  { id: 'stability', label: 'Stabiliteit',  color: 'phase_stability', levels: [1, 2] },
  { id: 'momentum',  label: 'Momentum',     color: 'phase_momentum',  levels: [3, 4] },
  { id: 'mastery',   label: 'Meesterschap', color: 'phase_mastery',   levels: [5, 6] },
] as const

type PhaseColor = (typeof PHASES)[number]['color']

// ── Phase color map ───────────────────────────────────────────
const PHASE_STYLES: Record<PhaseColor, { bar: string; text: string; badge: string }> = {
  phase_recovery:  {
    bar:   'bg-[var(--color-phase-recovery-400)]',
    text:  'text-[var(--color-phase-recovery-700)]',
    badge: 'bg-[var(--color-phase-recovery-100)] text-[var(--color-phase-recovery-700)]',
  },
  phase_stability: {
    bar:   'bg-[var(--color-phase-stability-400)]',
    text:  'text-[var(--color-phase-stability-700)]',
    badge: 'bg-[var(--color-phase-stability-100)] text-[var(--color-phase-stability-700)]',
  },
  phase_momentum:  {
    bar:   'bg-[var(--color-phase-momentum-400)]',
    text:  'text-[var(--color-phase-momentum-700)]',
    badge: 'bg-[var(--color-phase-momentum-100)] text-[var(--color-phase-momentum-700)]',
  },
  phase_mastery:   {
    bar:   'bg-[var(--color-phase-mastery-400)]',
    text:  'text-[var(--color-phase-mastery-700)]',
    badge: 'bg-[var(--color-phase-mastery-100)] text-[var(--color-phase-mastery-700)]',
  },
}

// Niveau-namen, motivatie en criteria komen uit lib/sovereignty-journey.ts
// (single source, gedeeld met de rest van de reis-metadata). Fasekleuren
// hierboven blijven lokaal — dat is pure UI-presentatie.

// ── Component ─────────────────────────────────────────────────
export function JouwPadWidgetWrapper({ size, data, href }: Props) {
  const {
    sovereigntyLevel,
    currentPhaseId,
    freedomPct,
    netWorth,
    sovereigntyMonthsCovered,
    hasConsumerDebt,
  } = data

  const levelName      = LEVEL_NAMES[sovereigntyLevel] ?? 'Onbekend'
  const nextLevelName  = LEVEL_NAMES[sovereigntyLevel + 1]
  const nextMotivation = NEXT_LEVEL_MOTIVATION[sovereigntyLevel]

  const currentPhase = PHASES.find((p) => p.id === currentPhaseId) ?? PHASES[0]
  const colors       = PHASE_STYLES[currentPhase.color]

  // Progress within the active phase (0–100)
  const phaseStartLevel = currentPhase.levels[0]
  const phaseEndLevel   = currentPhase.levels[currentPhase.levels.length - 1]
  const phaseLevelRange = phaseEndLevel - phaseStartLevel + 1
  const progressInPhase = Math.min(
    ((sovereigntyLevel - phaseStartLevel + 1) / phaseLevelRange) * 100,
    100
  )

  // Criteria toetsen op de soevereiniteits-grondslag: sovereigntyMonthsCovered
  // (liquide pot ÷ 3-maands tx-gemiddelde) is dezelfde noemer als
  // computeSovereigntyLevel gebruikte, zodat de checklist het niveau nooit
  // tegenspreekt (drift-fix; niet het effectiveMonthlyExpenses-gebaseerde
  // top-level monthsCovered gebruiken).
  const criteriaData: SovereigntyCriterionInput = {
    netWorth,
    monthsCovered: sovereigntyMonthsCovered,
    freedomPct,
    hasConsumerDebt,
  }
  const nextCriteria = NEXT_LEVEL_CRITERIA[sovereigntyLevel] ?? []

  const levelDisplay = sovereigntyLevel < 0 ? `${sovereigntyLevel}` : `+${sovereigntyLevel}`

  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })

  // ── Mini-size: sovereignty level ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Jouw Pad" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {levelDisplay} {levelName}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: compact identity snapshot ──
  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Jouw Pad" href={href}>
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${colors.badge}`}>
            <Shield className="h-3.5 w-3.5" />
          </div>
          <p className={`text-[10px] font-bold uppercase tracking-[0.12em] leading-none ${colors.text}`}>
            {currentPhase.label}
          </p>
        </div>
        <p className="mt-1.5 font-mono text-lg font-semibold tabular-nums leading-none text-[var(--ink)]">
          {levelDisplay}
        </p>
        <span className={`mt-1 inline-block rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${colors.badge}`}>
          {freedomPct.toFixed(1)}% vrij
        </span>
      </WidgetShell>
    )
  }

  // ── Half-size: compact header + phase bar for 1-row 160px height ──
  if (size === 'half') {
    return (
      <WidgetShell module="cross" size={size} kicker="Jouw Pad" href={href}>
        <div ref={inViewRef}>
          {/* Header: shield + phase + freedom badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${colors.badge}`}>
                <Shield className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className={`text-[10px] font-bold uppercase tracking-[0.12em] leading-none ${colors.text}`}>
                  {currentPhase.label}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--ink-2)]">{levelName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">{levelDisplay}</span>
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums ${colors.badge}`}>
                {freedomPct.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Phase progress bar (4 segments) */}
          <div className="mt-2">
            <div className="flex gap-1">
              {PHASES.map((phase) => {
                const pColors  = PHASE_STYLES[phase.color]
                const phaseIdx = PHASES.findIndex((p) => p.id === phase.id)
                const curIdx   = PHASES.findIndex((p) => p.id === currentPhase.id)
                const isActive = phase.id === currentPhase.id
                const isPast   = phaseIdx < curIdx
                return (
                  <div key={phase.id} className="flex-1">
                    <div className={`h-1.5 overflow-hidden rounded-full ${
                      isPast ? pColors.bar : isActive ? 'bg-[var(--subtle)] border border-[var(--border-ed)]' : 'bg-[var(--subtle)]'
                    }`}>
                      {isActive && (
                        <div
                          className={`h-full rounded-full ${pColors.bar}`}
                          style={{
                            width: hasEntered ? `${progressInPhase}%` : '0%',
                            transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1) 150ms' : 'none',
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </WidgetShell>
    )
  }

  // ── Full-size: expanded with criteria + next level (336px height) ──
  return (
    <WidgetShell module="cross" size={size} kicker="Jouw Pad" href={href}>
    <div ref={inViewRef}>

      {/* ── Header: shield + fase + vrijheidsbadge ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] ${colors.badge}`}>
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-[0.12em] leading-none ${colors.text}`}>
              {currentPhase.label}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-[var(--ink-2)]">{levelName}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${colors.badge}`}>
          {freedomPct.toFixed(1)}% vrij
        </span>
      </div>

      {/* ── Level number ── */}
      <div className="mt-2.5">
        <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]">Niveau</p>
        <p className="font-mono text-3xl font-semibold tabular-nums leading-none text-[var(--ink)]">
          {levelDisplay}
        </p>
      </div>

      {/* ── Fase-voortgangsbalk (4 segmenten) ── */}
      <div className="mt-3">
        <div className="flex gap-1">
          {PHASES.map((phase) => {
            const pColors  = PHASE_STYLES[phase.color]
            const phaseIdx = PHASES.findIndex((p) => p.id === phase.id)
            const curIdx   = PHASES.findIndex((p) => p.id === currentPhase.id)
            const isActive = phase.id === currentPhase.id
            const isPast   = phaseIdx < curIdx

            return (
              <div key={phase.id} className="flex-1">
                <div
                  className={`h-1.5 overflow-hidden rounded-full ${
                    isPast
                      ? pColors.bar
                      : isActive
                        ? 'bg-[var(--subtle)] border border-[var(--border-ed)]'
                        : 'bg-[var(--subtle)]'
                  }`}
                >
                  {isActive && (
                    <div
                      className={`h-full rounded-full ${pColors.bar}`}
                      style={{
                        width:      hasEntered ? `${progressInPhase}%` : '0%',
                        transition: hasEntered ? 'width 700ms cubic-bezier(.22,1,.36,1) 150ms' : 'none',
                      }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex justify-between">
          {PHASES.map((phase) => {
            const isActive = phase.id === currentPhase.id
            const pColors  = PHASE_STYLES[phase.color]
            return (
              <span
                key={phase.id}
                className={`text-[9px] leading-none ${
                  isActive ? `font-semibold ${pColors.text}` : 'text-[var(--ink-4)]'
                }`}
              >
                {phase.label}
              </span>
            )
          })}
        </div>
      </div>

      {/* ── Criteria checklist voor volgend niveau ── */}
      {nextCriteria.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
            Voortgang naar niveau {sovereigntyLevel + 1}
          </p>
          {nextCriteria.map((criterion, idx) => {
            const met = criterion.check(criteriaData)
            return (
              <div key={idx} className="flex items-center gap-1.5">
                {met ? (
                  <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-positive/20">
                    <Check className="h-2 w-2 text-positive" />
                  </div>
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
                )}
                <span
                  className={`text-[11px] leading-snug ${
                    met
                      ? 'text-positive line-through decoration-[var(--positive)]'
                      : 'text-[var(--ink-2)]'
                  }`}
                >
                  {criterion.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Full-size: volgend niveau — motivatie (geen feature-gate; ADR 0001) ── */}
      {nextLevelName && nextMotivation && (
        <div className="mt-4">
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Volgend niveau
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--ink-2)]">
              {sovereigntyLevel + 1 < 0 ? sovereigntyLevel + 1 : `+${sovereigntyLevel + 1}`}
              {' — '}{nextLevelName}
            </p>
            <p className="mt-1 text-[10px] text-[var(--ink-2)]">
              {nextMotivation}
            </p>
            {/* Stap daarna op de reis */}
            {LEVEL_NAMES[sovereigntyLevel + 2] && NEXT_LEVEL_MOTIVATION[sovereigntyLevel + 1] && (
              <p className="mt-1.5 text-[9px] text-[var(--ink-4)]">
                Daarna: {sovereigntyLevel + 2 < 0 ? sovereigntyLevel + 2 : `+${sovereigntyLevel + 2}`}
                {' — '}{LEVEL_NAMES[sovereigntyLevel + 2]}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
    </WidgetShell>
  )
}
