'use client'

import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Check, Circle, Shield } from 'lucide-react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'

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

// ── Level names ───────────────────────────────────────────────
const LEVEL_NAMES: Record<number, string> = {
  [-2]: 'Tijdtekort',
  [-1]: 'Tijdverlies',
  0:    'Het Reset-punt',
  1:    'Tijdbuffer',
  2:    'Tijdschild',
  3:    'Tijdinvesteerder',
  4:    'Tijdvermenigvuldiger',
  5:    'Tijdssoeverein',
  6:    'Tijdloos',
}

// ── What the next level unlocks ───────────────────────────────
const NEXT_LEVEL_UNLOCKS: Record<number, string> = {
  [-2]: 'Basis budgettering',
  [-1]: 'NIBUD vergelijking',
  0:    'Vermogensopbouw tracking',
  1:    'Snapshot vergelijking',
  2:    'FIRE projecties',
  3:    'Monte Carlo simulaties',
  4:    'Geavanceerde scenario analyse',
  5:    'Opnamestrategieën',
  6:    'Volledige vrijheid bereikt!',
}

// ── Criteria to reach the NEXT level ─────────────────────────
type CriterionData = {
  netWorth: number
  monthsCovered: number
  freedomPct: number
  hasConsumerDebt: boolean
}

type Criterion = { label: string; check: (d: CriterionData) => boolean }

const NEXT_LEVEL_CRITERIA: Record<number, Criterion[]> = {
  [-2]: [{ label: 'Consumptieve schulden afgelost', check: (d) => !d.hasConsumerDebt }],
  [-1]: [{ label: 'Vermogen \u2265 \u20AC0',         check: (d) => d.netWorth >= 0 }],
  [0]:  [{ label: 'Minimaal 1 maand buffer',          check: (d) => d.monthsCovered >= 1 }],
  [1]:  [{ label: 'Minimaal 3 maanden noodfonds',     check: (d) => d.monthsCovered >= 3 }],
  [2]:  [
    { label: 'Minimaal 6 maanden buffer',             check: (d) => d.monthsCovered >= 6 },
    { label: 'Vrijheidspercentage \u2265 10%',         check: (d) => d.freedomPct >= 10 },
  ],
  [3]: [{ label: 'Vrijheidspercentage \u2265 25%',    check: (d) => d.freedomPct >= 25 }],
  [4]: [{ label: 'Vrijheidspercentage \u2265 75%',    check: (d) => d.freedomPct >= 75 }],
  [5]: [{ label: 'Vrijheidspercentage \u2265 100%',   check: (d) => d.freedomPct >= 100 }],
}

// ── Component ─────────────────────────────────────────────────
export function JouwPadWidgetWrapper({ size, data, href }: Props) {
  const {
    sovereigntyLevel,
    currentPhaseId,
    freedomPct,
    netWorth,
    monthsCovered,
    hasConsumerDebt,
  } = data

  const levelName     = LEVEL_NAMES[sovereigntyLevel] ?? 'Onbekend'
  const nextLevelName = LEVEL_NAMES[sovereigntyLevel + 1]
  const nextUnlock    = NEXT_LEVEL_UNLOCKS[sovereigntyLevel]

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

  const criteriaData: CriterionData = { netWorth, monthsCovered, freedomPct, hasConsumerDebt }
  const nextCriteria = NEXT_LEVEL_CRITERIA[sovereigntyLevel] ?? []

  const levelDisplay = sovereigntyLevel < 0 ? `${sovereigntyLevel}` : `+${sovereigntyLevel}`

  const { ref: inViewRef, hasEntered } = useInViewAnimation({ duration: 700 })

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
                  <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-2 w-2 text-emerald-600" />
                  </div>
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]" />
                )}
                <span
                  className={`text-[11px] leading-snug ${
                    met
                      ? 'text-emerald-700 line-through decoration-emerald-400'
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

      {/* ── Full-size: volgend niveau preview ── */}
      {size === 'full' && nextLevelName && nextUnlock && (
        <div className="mt-auto pt-4">
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/60 px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
              Volgend niveau
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-[var(--ink-2)]">
              {sovereigntyLevel + 1 < 0 ? sovereigntyLevel + 1 : `+${sovereigntyLevel + 1}`}
              {' — '}{nextLevelName}
            </p>
            <p className="mt-1 text-[10px] text-[var(--ink-3)]">
              Ontgrendelt:{' '}
              <span className="font-medium text-[var(--ink-2)]">{nextUnlock}</span>
            </p>
          </div>
        </div>
      )}
    </div>
    </WidgetShell>
  )
}
