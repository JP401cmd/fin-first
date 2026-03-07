const STEPS = [
  { key: 'profiel', label: 'Profiel & Vrijheid', icon: '👤' },
  { key: 'startpunt', label: 'Startpunt', icon: '📍' },
  { key: 'budgetten', label: 'Budgetten', icon: '💰' },
  { key: 'voorkeuren', label: 'Voorkeuren', icon: '⚙️' },
  { key: 'klaar', label: 'Klaar', icon: '✓' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

export function StepProgress({ current }: { current: StepKey }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current)
  const progressPct = Math.round((currentIdx / (STEPS.length - 1)) * 100)

  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
        <div
          className="h-full rounded-full bg-[var(--ink)] transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx
          const isActive = i === currentIdx
          return (
            <div key={step.key} className="flex flex-col items-center gap-1">
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
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
