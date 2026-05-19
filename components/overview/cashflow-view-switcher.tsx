'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { type ReactNode } from 'react'

type ViewMode = 'budget' | 'transacties' | 'vaste-lasten' | 'kalender'

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'budget', label: 'Budget' },
  { id: 'transacties', label: 'Transacties' },
  { id: 'vaste-lasten', label: 'Vaste lasten' },
  { id: 'kalender', label: 'Kalender' },
]

/**
 * View-switcher voor /overzicht/cashflow. Capsule-style nav met
 * `?view=`-URL-state (bookmarkable). Rendert het ge-mounte view-kind
 * via render-props zodat data-loading in de wrapper-page leeft.
 *
 * Default view = 'budget' (huidige gedrag van /overzicht/cashflow).
 */
export function CashflowViewSwitcher({
  budgetView,
  transactiesView,
  vasteLastenView,
  kalenderView,
}: {
  budgetView: ReactNode
  transactiesView: ReactNode
  vasteLastenView: ReactNode
  /** Nieuw: Cashflow-kalender met recurring transactions over 5 weken. */
  kalenderView: ReactNode
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const activeView = (searchParams.get('view') as ViewMode | null) ?? 'budget'
  const isKnown = VIEWS.some((v) => v.id === activeView)
  const current: ViewMode = isKnown ? activeView : 'budget'

  function navigate(view: ViewMode) {
    const params = new URLSearchParams(searchParams.toString())
    if (view === 'budget') {
      params.delete('view')
    } else {
      params.set('view', view)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <nav
          aria-label="Cashflow-view"
          className="mb-4 flex flex-wrap gap-1 rounded-2xl border border-[var(--border-ed)] bg-[var(--subtle)] p-1"
        >
          {VIEWS.map(({ id, label }) => {
            const active = current === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                aria-pressed={active}
                className={[
                  'flex-1 min-w-[80px] min-h-[44px] text-center text-xs sm:text-sm font-semibold px-3 py-2.5 rounded-xl transition-colors',
                  active
                    ? 'bg-[var(--paper)] text-[var(--ink)] shadow-[var(--s1)]'
                    : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </nav>
      </div>
      {/* Alle drie views in dezelfde max-w-6xl wrapper voor consistent
          horizontale spacing (matcht bezittingen/schulden-pattern).
          BudgetsClient heeft zelf geen max-w container — die levert
          de pagina aan. */}
      {current === 'budget' && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">{budgetView}</div>
      )}
      {current === 'transacties' && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">{transactiesView}</div>
      )}
      {current === 'vaste-lasten' && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">{vasteLastenView}</div>
      )}
      {current === 'kalender' && (
        <div className="mx-auto max-w-6xl px-4 sm:px-6">{kalenderView}</div>
      )}
    </>
  )
}
