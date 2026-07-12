export default function BerichtenLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Header skeleton (kicker + titel) */}
      <div className="mb-6">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--subtle)] mb-3" />
        <div className="h-9 w-56 animate-pulse rounded-md bg-[var(--subtle)] mb-2" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-[var(--subtle)]" />
      </div>

      {/* Filter-pills skeleton */}
      <div className="mb-5 flex flex-wrap gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-[var(--subtle)]" />
        ))}
      </div>

      {/* Meldingen-lijst skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4"
          >
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-[var(--subtle)]" />
            <div className="flex-1">
              <div className="h-4 w-44 max-w-full animate-pulse rounded bg-[var(--subtle)] mb-2" />
              <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)] mb-1.5" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="h-3 w-16 shrink-0 animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
