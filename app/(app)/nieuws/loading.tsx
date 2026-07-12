export default function NieuwsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Krant-masthead skeleton (kicker + titel + deck) */}
      <div className="mb-6 border-b border-[var(--border-ed)] pb-4">
        <div className="h-3 w-28 animate-pulse rounded bg-[var(--subtle)] mb-3" />
        <div className="h-10 w-72 max-w-full animate-pulse rounded-md bg-[var(--subtle)] mb-2" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-[var(--subtle)]" />
      </div>

      {/* Hoofdartikel skeleton */}
      <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 sm:p-6 mb-6">
        <div className="h-4 w-20 animate-pulse rounded bg-[var(--subtle)] mb-3" />
        <div className="h-6 w-3/4 animate-pulse rounded bg-[var(--subtle)] mb-3" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-[var(--subtle)]" />
        </div>
      </div>

      {/* Artikel-lijst skeleton */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4">
            <div className="h-3 w-16 animate-pulse rounded bg-[var(--subtle)] mb-2.5" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-[var(--subtle)] mb-2" />
            <div className="h-3 w-full animate-pulse rounded bg-[var(--subtle)] mb-1.5" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--subtle)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
