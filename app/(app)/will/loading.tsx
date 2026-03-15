export default function WillLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Hero skeleton */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-gradient-to-br from-wil-50 to-wil-100/50 p-5 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-5 w-5 animate-pulse rounded bg-wil-300/40" />
          <div className="h-5 w-32 animate-pulse rounded bg-wil-300/40" />
        </div>
        <div className="h-10 w-44 animate-pulse rounded-md bg-wil-300/30 mb-2" />
        <div className="h-4 w-48 animate-pulse rounded bg-wil-300/20" />
      </section>

      {/* Action cards skeleton */}
      <div className="mt-6 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 animate-pulse rounded-lg bg-[var(--subtle)]" />
              <div className="flex-1">
                <div className="h-4 w-48 animate-pulse rounded bg-[var(--subtle)] mb-2" />
                <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)] mb-1" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
              <div className="h-6 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
