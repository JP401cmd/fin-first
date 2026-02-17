'use client'

import Link from 'next/link'
import { ArrowRight, Shield, Check, Circle, Target, Clock, Ban, Flag } from 'lucide-react'
import type { FreedomMilestone } from '@/lib/freedom-milestones'

// Phase definitions matching identity page
const PHASES = [
  { id: 'recovery', label: 'Recovery', subtitle: 'Restoring Balance', color: 'rose', levels: [-2, -1, 0] },
  { id: 'stability', label: 'Stability', subtitle: 'Fortifying Time', color: 'blue', levels: [1, 2] },
  { id: 'momentum', label: 'Momentum', subtitle: 'Multiplying Time', color: 'teal', levels: [3, 4] },
  { id: 'mastery', label: 'Mastery', subtitle: 'Owning Time', color: 'amber', levels: [5, 6] },
] as const

const LEVEL_NAMES: Record<number, string> = {
  [-2]: 'Time Deficit',
  [-1]: 'Time Drag',
  0: 'The Reset',
  1: 'Time Buffer',
  2: 'Time Shield',
  3: 'Time Investor',
  4: 'Time Multiplier',
  5: 'Time Sovereign',
  6: 'Timeless',
}

const NEXT_LEVEL_UNLOCKS: Record<number, string> = {
  [-2]: 'Basis budgettering',
  [-1]: 'NIBUD vergelijking',
  0: 'Vermogensopbouw tracking',
  1: 'Snapshot vergelijking',
  2: 'FIRE projecties',
  3: 'Monte Carlo simulaties',
  4: 'Geavanceerde scenario analyse',
  5: 'Opnamestrategieen',
  6: 'Volledige vrijheid bereikt!',
}

const phaseColors: Record<string, { bg: string; border: string; text: string; bar: string; badge: string }> = {
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', bar: 'bg-rose-400', badge: 'bg-rose-100 text-rose-700' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', bar: 'bg-blue-400', badge: 'bg-blue-100 text-blue-700' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', bar: 'bg-teal-400', badge: 'bg-teal-100 text-teal-700' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', bar: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700' },
}

// Criteria checklist for progressing to the NEXT level
// Each entry defines the criteria for reaching that level from the one below
type CriterionItem = {
  label: string
  check: (data: { netWorth: number; monthsCovered: number; freedomPct: number; hasConsumerDebt: boolean }) => boolean
}

const NEXT_LEVEL_CRITERIA: Record<number, CriterionItem[]> = {
  // Current level -2: criteria to reach level -1
  [-2]: [
    { label: 'Consumptieve schulden afgelost', check: (d) => !d.hasConsumerDebt },
  ],
  // Current level -1: criteria to reach level 0
  [-1]: [
    { label: 'Vermogen \u2265 \u20AC0', check: (d) => d.netWorth >= 0 },
  ],
  // Current level 0: criteria to reach level 1
  [0]: [
    { label: 'Minimaal 1 maand buffer', check: (d) => d.monthsCovered >= 1 },
  ],
  // Current level 1: criteria to reach level 2
  [1]: [
    { label: 'Minimaal 3 maanden noodfonds', check: (d) => d.monthsCovered >= 3 },
  ],
  // Current level 2: criteria to reach level 3
  [2]: [
    { label: 'Minimaal 6 maanden buffer', check: (d) => d.monthsCovered >= 6 },
    { label: 'Vrijheidspercentage \u2265 10%', check: (d) => d.freedomPct >= 10 },
  ],
  // Current level 3: criteria to reach level 4
  [3]: [
    { label: 'Vrijheidspercentage \u2265 25%', check: (d) => d.freedomPct >= 25 },
  ],
  // Current level 4: criteria to reach level 5
  [4]: [
    { label: 'Vrijheidspercentage \u2265 75%', check: (d) => d.freedomPct >= 75 },
  ],
  // Current level 5: criteria to reach level 6
  [5]: [
    { label: 'Vrijheidspercentage \u2265 100%', check: (d) => d.freedomPct >= 100 },
  ],
}

interface JouwPadWidgetProps {
  level: number
  phase: string
  freedomPct: number
  netWorth?: number
  monthsCovered?: number
  hasConsumerDebt?: boolean
  milestones?: FreedomMilestone[]
  nextMilestoneMessage?: string | null
}

export function JouwPadWidget({ level, phase, freedomPct, netWorth = 0, monthsCovered = 0, hasConsumerDebt = false, milestones, nextMilestoneMessage }: JouwPadWidgetProps) {
  const currentPhase = PHASES.find(p => p.id === phase) ?? PHASES[0]
  const colors = phaseColors[currentPhase.color]
  const levelName = LEVEL_NAMES[level] ?? 'Onbekend'
  const nextLevelName = LEVEL_NAMES[level + 1]
  const nextUnlock = NEXT_LEVEL_UNLOCKS[level]

  // Calculate progress within the current phase
  const phaseStartLevel = currentPhase.levels[0]
  const phaseEndLevel = currentPhase.levels[currentPhase.levels.length - 1]
  const phaseLevelRange = phaseEndLevel - phaseStartLevel + 1
  const progressInPhase = ((level - phaseStartLevel + 1) / phaseLevelRange) * 100

  // Get next level criteria checklist
  const nextCriteria = NEXT_LEVEL_CRITERIA[level]
  const financialData = { netWorth, monthsCovered, freedomPct, hasConsumerDebt }

  return (
    <Link
      href="/identity"
      data-testid="jouw-pad-widget"
      className={`group block rounded-xl border ${colors.border} ${colors.bg} p-5 transition-all hover:shadow-md`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.badge}`}>
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Jouw Pad
            </p>
            <p className={`text-sm font-bold ${colors.text}`} data-testid="jouw-pad-phase">
              {currentPhase.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs font-medium text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
          Bekijken <ArrowRight className="h-3 w-3" />
        </div>
      </div>

      {/* Current level */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-zinc-500" data-testid="jouw-pad-level">Level {level}</p>
          <p className="text-sm font-semibold text-zinc-900" data-testid="jouw-pad-level-name">{levelName}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${colors.badge}`} data-testid="jouw-pad-freedom">
          {freedomPct.toFixed(1)}% vrij
        </span>
      </div>

      {/* Phase progress bar */}
      <div className="mt-3" data-testid="jouw-pad-progress-bar">
        <div className="flex gap-1">
          {PHASES.map((p) => {
            const pColors = phaseColors[p.color]
            const isActive = p.id === phase
            const isPast = PHASES.indexOf(p) < PHASES.indexOf(currentPhase)
            return (
              <div key={p.id} className="flex-1">
                <div className={`h-1.5 rounded-full ${isPast ? pColors.bar : isActive ? 'bg-zinc-200' : 'bg-zinc-100'} overflow-hidden`}>
                  {isActive && (
                    <div
                      className={`h-full rounded-full ${pColors.bar} transition-all duration-700`}
                      style={{ width: `${Math.min(progressInPhase, 100)}%` }}
                    />
                  )}
                  {isPast && (
                    <div className={`h-full rounded-full ${pColors.bar}`} style={{ width: '100%' }} />
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-zinc-400">
          {PHASES.map(p => (
            <span key={p.id} className={p.id === phase ? phaseColors[p.color].text + ' font-semibold' : ''}>
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {/* Criteria checklist for next level */}
      {nextCriteria && nextCriteria.length > 0 && (
        <div className="mt-3 space-y-1.5" data-testid="jouw-pad-criteria">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">
            Voortgang naar niveau {level + 1}
          </p>
          {nextCriteria.map((criterion, idx) => {
            const met = criterion.check(financialData)
            return (
              <div
                key={idx}
                className="flex items-center gap-2"
                data-testid={`jouw-pad-criterion-${idx}`}
                data-met={met ? 'true' : 'false'}
              >
                {met ? (
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-2.5 w-2.5 text-emerald-600" />
                  </div>
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-zinc-300" />
                )}
                <span className={`text-[11px] ${met ? 'text-emerald-700 line-through' : 'text-zinc-600'}`}>
                  {criterion.label}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Freedom milestone forecast */}
      {milestones && milestones.length > 0 && (
        <div className="mt-3" data-testid="jouw-pad-milestones">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            Vrijheidsmijlpalen
          </p>

          {/* Milestone timeline */}
          <div className="relative" data-testid="milestone-timeline">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-zinc-200" />

            <div className="space-y-2">
              {milestones.map((m) => {
                const MilestoneIcon = m.icon === 'check' ? Check
                  : m.icon === 'target' ? Target
                  : m.icon === 'clock' ? Clock
                  : Ban

                const iconBg = m.reached
                  ? 'bg-emerald-100'
                  : m.icon === 'target'
                    ? 'bg-purple-100'
                    : m.icon === 'clock'
                      ? 'bg-blue-100'
                      : 'bg-zinc-100'

                const iconColor = m.reached
                  ? 'text-emerald-600'
                  : m.icon === 'target'
                    ? 'text-purple-600'
                    : m.icon === 'clock'
                      ? 'text-blue-600'
                      : 'text-zinc-400'

                return (
                  <div
                    key={m.percent}
                    className="relative flex items-start gap-2.5 pl-0"
                    data-testid={`milestone-${m.percent}`}
                    data-reached={m.reached ? 'true' : 'false'}
                  >
                    {/* Milestone dot */}
                    <div className={`relative z-10 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full ${iconBg}`}>
                      <MilestoneIcon className={`h-2.5 w-2.5 ${iconColor}`} />
                    </div>

                    {/* Milestone content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[11px] font-medium ${m.reached ? 'text-emerald-700' : 'text-zinc-700'}`}>
                          {m.label}
                        </span>
                        {m.reached && (
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5">
                            ✓
                          </span>
                        )}
                        {m.projectedDate && !m.reached && (
                          <span className="text-[9px] text-zinc-400 shrink-0">
                            {m.projectedDate}
                          </span>
                        )}
                      </div>
                      {!m.reached && (
                        <p className={`text-[10px] mt-0.5 ${m.monthsAway !== null ? 'text-zinc-500' : 'text-zinc-400 italic'}`}>
                          {m.message}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Contextual next milestone message */}
          {nextMilestoneMessage && (
            <div className="mt-2.5 rounded-lg bg-gradient-to-r from-purple-50 to-blue-50 px-3 py-2 border border-purple-100" data-testid="milestone-next-message">
              <div className="flex items-center gap-1.5">
                <Flag className="h-3 w-3 text-purple-500 shrink-0" />
                <p className="text-[11px] text-purple-700 font-medium">
                  {nextMilestoneMessage}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Next level preview */}
      {nextLevelName && nextUnlock && (
        <div className="mt-3 rounded-lg bg-white/60 px-3 py-2" data-testid="jouw-pad-next-level">
          <p className="text-[11px] text-zinc-500">
            <span className="font-medium text-zinc-700">Volgend niveau</span>
            {' '}&rarr;{' '}
            Lvl {level + 1}: {nextLevelName}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-400">
            Ontgrendelt: {nextUnlock}
          </p>
        </div>
      )}
    </Link>
  )
}
