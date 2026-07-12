// Rendert binnen BeheerLayout (BeheerContainer + BeheerNav) → geen eigen
// max-width/padding-wrapper; alleen het inhoud-skelet dat de grouped-cards-
// layout van beheer/page.tsx benadert.
export default function BeheerLoading() {
  return (
    <div className="space-y-10">
      {[1, 2].map(group => (
        <section key={group}>
          {/* Groep-kop skeleton */}
          <div className="border-b border-[var(--border-ed)] pb-2">
            <div className="h-3 w-40 animate-pulse rounded bg-[var(--subtle)]" />
            <div className="mt-1.5 h-3 w-64 max-w-full animate-pulse rounded bg-[var(--subtle)]" />
          </div>

          {/* Tool-kaarten skeleton */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(card => (
              <div
                key={card}
                className="border border-[var(--border-ed)] bg-[var(--paper)] p-4"
              >
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-[var(--subtle)]" />
                  <div className="h-4 w-28 animate-pulse rounded bg-[var(--subtle)]" />
                </div>
                <div className="mt-2 h-3 w-full animate-pulse rounded bg-[var(--subtle)]" />
                <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-[var(--subtle)]" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
