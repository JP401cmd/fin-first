'use client'

import { useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Filter, Loader2 } from 'lucide-react'

/**
 * LibraryFilter — client-toggle "Alleen tonen wat ik kan gebruiken".
 *
 * Beheert de `?filter=usable` query-param. Wijziging triggert een
 * server-rerender van de lijst (`router.replace` + `useTransition`)
 * zodat de URL bookmarkbaar blijft en de filter-logic server-side
 * draait (geen client-state-divergentie).
 *
 * Defensief: we lezen de huidige `?filter=` zelf zodat het zonder
 * `defaultEnabled`-prop ook gewoon werkt; de prop blijft beschikbaar
 * voor SSR-correctheid op de eerste render.
 */
export function LibraryFilter({
  defaultEnabled = false,
}: {
  defaultEnabled?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentEnabled = searchParams.get('filter') === 'usable' || defaultEnabled

  const toggle = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (currentEnabled) {
      params.delete('filter')
    } else {
      params.set('filter', 'usable')
    }
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    })
  }, [currentEnabled, pathname, router, searchParams])

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={currentEnabled}
      className={[
        'inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
        currentEnabled
          ? 'border-[var(--ink-3)] bg-[var(--paper)] text-[var(--ink)]'
          : 'border-[var(--border-ed)] bg-[var(--subtle)] text-[var(--ink-2)] hover:border-[var(--ink-3)]',
      ].join(' ')}
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Filter className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      <span>Alleen tonen wat ik kan gebruiken</span>
    </button>
  )
}
