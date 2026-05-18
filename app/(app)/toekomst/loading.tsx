export default function HorizonLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Hero skeleton */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-gradient-to-br from-horizon-50 to-horizon-100/50 p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-5 w-5 animate-pulse rounded bg-horizon-300/40" />
          <div className="h-5 w-32 animate-pulse rounded bg-horizon-300/40" />
        </div>
        <div className="h-10 w-56 animate-pulse rounded-md bg-horizon-300/30 mb-2" />
        <div className="h-4 w-44 animate-pulse rounded bg-horizon-300/20 mb-6" />
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex flex-col gap-1">
              <div className="h-3 w-16 animate-pulse rounded bg-horizon-300/20" />
              <div className="h-6 w-24 animate-pulse rounded bg-horizon-300/20" />
            </div>
          ))}
        </div>
      </section>

      {/* Sim chart skeleton */}
      <div className="mt-6 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--subtle)] mb-4" />
        <div className="h-64 w-full animate-pulse rounded-lg bg-[var(--subtle)]" />
      </div>

      {/* Life events skeleton */}
      <div className="mt-6 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="h-5 w-36 animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--subtle)]" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 py-2">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--subtle)]" />
              <div className="flex-1">
                <div className="h-4 w-32 animate-pulse rounded bg-[var(--subtle)] mb-1" />
                <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
          ))}
        </div>
      </div>

      {/* Deep dive cards skeleton */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-5 w-5 animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-4 w-28 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
