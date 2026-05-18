export default function IdentityLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Profile strip skeleton */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-14 w-14 animate-pulse rounded-full bg-[var(--subtle)]" />
          <div>
            <div className="h-5 w-36 animate-pulse rounded bg-[var(--subtle)] mb-2" />
            <div className="h-3 w-28 animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        </div>
        {/* Level progress */}
        <div className="h-2 w-full animate-pulse rounded-full bg-[var(--subtle)] mb-2" />
        <div className="h-3 w-44 animate-pulse rounded bg-[var(--subtle)]" />
      </section>

      {/* Stats grid skeleton */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--subtle)] mb-3" />
            <div className="h-7 w-16 animate-pulse rounded-md bg-[var(--subtle)]" />
          </div>
        ))}
      </div>

      {/* Timeline skeleton */}
      <div className="mt-6 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="h-5 w-40 animate-pulse rounded bg-[var(--subtle)] mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-3 animate-pulse rounded-full bg-[var(--subtle)]" />
              <div className="h-4 w-48 animate-pulse rounded bg-[var(--subtle)]" />
              <div className="ml-auto h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
