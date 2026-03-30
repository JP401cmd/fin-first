// ── Phase-based onboarding progress indicator ────────────────────────────
// 4 fixed phases: Gegevens → Modules → Instellen → Klaar
// Phase 3 (Instellen) shows a sub-step counter for dynamic content steps.

const PHASES = [
  { key: 'gegevens', label: 'Gegevens' },
  { key: 'modules', label: 'Modules' },
  { key: 'instellen', label: 'Instellen' },
  { key: 'klaar', label: 'Klaar' },
] as const

export type PhaseKey = (typeof PHASES)[number]['key']

export interface StepProgressProps {
  currentPhase: PhaseKey
  subStep?: { current: number; total: number }
}

export function StepProgress({ currentPhase, subStep }: StepProgressProps) {
  const currentIdx = PHASES.findIndex((p) => p.key === currentPhase)
  const progressPct = Math.round((currentIdx / (PHASES.length - 1)) * 100)

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full bg-[var(--ink)] transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Phase indicators */}
      <div className="flex items-center justify-between">
        {PHASES.map((phase, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          return (
            <div key={phase.key} className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isDone
                    ? 'bg-[var(--ink)] text-white'
                    : isActive
                      ? 'border-2 border-[var(--ink)] text-[var(--ink)]'
                      : 'border border-[var(--border-ed)] text-[var(--ink-4)]'
                }`}
              >
                {isDone ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {/* Desktop: full label, Mobile: hidden */}
              <span
                className={`hidden text-[10px] font-medium sm:block ${
                  isActive ? 'text-[var(--ink)]' : isDone ? 'text-[var(--ink-2)]' : 'text-[var(--ink-4)]'
                }`}
              >
                {phase.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Sub-step indicator for 'instellen' phase */}
      {currentPhase === 'instellen' && subStep && (
        <p className="mt-2 text-center text-[10px] font-medium text-[var(--ink-4)]">
          Stap {subStep.current} van {subStep.total}
        </p>
      )}
    </div>
  )
}
