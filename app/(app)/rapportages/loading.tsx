export default function RapportagesLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Header skeleton (kicker + titel + deck) */}
      <div className="mb-6">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)] mb-3" />
        <div className="h-9 w-64 animate-pulse rounded-md bg-[var(--subtle)] mb-2" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--subtle)]" />
      </div>

      {/* Config-paneel skeleton */}
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="h-4 w-40 animate-pulse rounded bg-[var(--subtle)] mb-4" />
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-[var(--subtle)]" />
          ))}
        </div>
        <div className="mt-4 h-10 w-40 animate-pulse rounded-lg bg-[var(--subtle)]" />
      </div>

      {/* Rapporten-lijst skeleton */}
      <div className="mt-6 space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4"
          >
            <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
            <div className="flex-1">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--subtle)] mb-1.5" />
              <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="h-8 w-8 animate-pulse rounded-lg bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
