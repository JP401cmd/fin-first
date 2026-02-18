const STEPS = [
  { key: 'identity', label: 'Identiteit' },
  { key: 'budgets', label: 'Budgetten' },
  { key: 'extras', label: 'Extra' },
] as const

export type StepKey = (typeof STEPS)[number]['key']

export function StepProgress({ current }: { current: StepKey }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current)

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, i) => {
        const isDone = i < currentIdx
        const isActive = i === currentIdx
        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-0.5 w-6 rounded-full transition-colors ${
                  isDone ? 'bg-teal-500' : 'bg-zinc-200'
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isDone
                    ? 'bg-teal-500 text-white'
                    : isActive
                      ? 'border-2 border-teal-500 text-teal-600'
                      : 'border border-zinc-300 text-zinc-400'
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
              <span
                className={`text-xs font-medium ${
                  isActive ? 'text-teal-700' : isDone ? 'text-zinc-600' : 'text-zinc-400'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
