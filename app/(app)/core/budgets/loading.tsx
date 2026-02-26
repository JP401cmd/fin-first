export default function BudgetsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Month selector skeleton */}
      <section className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <div className="mb-6 flex items-center justify-between gap-2">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
          <div className="h-6 w-36 animate-pulse rounded-md bg-[var(--subtle)]" />
          <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
          <div className="ml-auto hidden h-8 w-36 animate-pulse rounded-[var(--r)] bg-[var(--subtle)] sm:block" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex flex-col items-center gap-2">
              <div className="h-3 w-16 animate-pulse rounded bg-[var(--subtle)]" />
              <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--subtle)]" />
              <div className="h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
          ))}
        </div>
      </section>

      {/* View mode toggle skeleton */}
      <div className="mt-6 flex items-center gap-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-[var(--r)] bg-[var(--subtle)]" />
        ))}
      </div>

      {/* Budget group skeletons */}
      <div className="mt-6 space-y-4">
        {[1, 2, 3].map(group => (
          <div key={group} className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 animate-pulse rounded-lg bg-[var(--subtle)]" />
                <div>
                  <div className="h-4 w-28 animate-pulse rounded bg-[var(--subtle)]" />
                  <div className="mt-1 h-3 w-20 animate-pulse rounded bg-[var(--subtle)]" />
                </div>
              </div>
              <div className="h-5 w-16 animate-pulse rounded bg-[var(--subtle)]" />
            </div>
            <div className="mb-4 h-1.5 w-full animate-pulse rounded-full bg-[var(--subtle)]" />
            <div className="space-y-2 pl-4">
              {[1, 2, 3].map(child => (
                <div key={child} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 animate-pulse rounded-md bg-[var(--subtle)]" />
                    <div className="h-4 w-24 animate-pulse rounded bg-[var(--subtle)]" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-20 animate-pulse rounded-full bg-[var(--subtle)]" />
                    <div className="h-4 w-14 animate-pulse rounded bg-[var(--subtle)]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
