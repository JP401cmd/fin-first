'use client'

export function BriefingSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 animate-pulse">
      {/* Greeting insight — span 2 */}
      <div className="col-span-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="h-[2px] w-full bg-wil-500/30" />
        <div className="p-4 space-y-2">
          <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
          <div className="h-4 w-3/4 rounded bg-[var(--subtle)]" />
        </div>
      </div>

      {/* Metric — span 1 */}
      <div className="col-span-1 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="h-[2px] w-full bg-kern-500/30" />
        <div className="p-4 space-y-2">
          <div className="h-3 w-20 rounded bg-[var(--subtle)]" />
          <div className="h-5 w-24 rounded bg-[var(--subtle)]" />
          <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
        </div>
      </div>

      {/* Progress ring — span 1 */}
      <div className="col-span-1 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="h-[2px] w-full bg-kern-500/30" />
        <div className="p-4 flex items-center gap-3">
          <div className="h-16 w-16 rounded-full border-4 border-[var(--subtle)] shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-3 w-20 rounded bg-[var(--subtle)]" />
            <div className="h-5 w-16 rounded bg-[var(--subtle)]" />
          </div>
        </div>
      </div>

      {/* Action — span 2 */}
      <div className="col-span-2 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="h-[2px] w-full bg-wil-500/30" />
        <div className="p-4 flex items-start gap-3">
          <div className="h-9 w-9 rounded-[var(--r)] bg-[var(--subtle)] shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-3 w-16 rounded bg-[var(--subtle)]" />
            <div className="h-4 w-48 rounded bg-[var(--subtle)]" />
            <div className="h-3 w-full rounded bg-[var(--subtle)]" />
          </div>
        </div>
      </div>

      {/* Sparkline — span 1 */}
      <div className="col-span-1 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="h-[2px] w-full bg-kern-500/30" />
        <div className="p-4 space-y-2">
          <div className="h-3 w-24 rounded bg-[var(--subtle)]" />
          <div className="h-5 w-20 rounded bg-[var(--subtle)]" />
          <div className="h-10 w-full rounded bg-[var(--subtle)]" />
        </div>
      </div>

      {/* Metric — span 1 */}
      <div className="col-span-1 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] overflow-hidden">
        <div className="h-[2px] w-full bg-kern-500/30" />
        <div className="p-4 space-y-2">
          <div className="h-3 w-20 rounded bg-[var(--subtle)]" />
          <div className="h-5 w-16 rounded bg-[var(--subtle)]" />
        </div>
      </div>
    </div>
  )
}
