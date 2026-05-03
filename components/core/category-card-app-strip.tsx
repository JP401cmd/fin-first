'use client'

import { useRouter } from 'next/navigation'

interface CategoryCardAppStripProps {
  /** App-label, sentence case (bv. "Budgetteren", "Holdings"). */
  appLabel: string
  /** Of de bijbehorende module actief is. */
  moduleActive: boolean
  /** Aantal items in deze categorie dat de app gebruikt. */
  trackedCount: number
  /** Totaal aantal items in deze categorie. */
  totalCount: number
  /** Deeplink naar de app-tab. */
  tabHref: string
}

/**
 * Compacte app-status-strip onderaan een `<CategoryCard>` op de Kern-landing.
 *
 * Drie statussen — uniforme tekst, onderscheid via `<StatusDot>` + tekstkleur:
 * - **Aan, gekoppeld**: gevulde stip kern-700 + `{App} · {n}/{m}` (kern-700).
 * - **Aan, leeg**: open stip ink-3 + `{App} · 0/{m}` (ink-3).
 * - **Uit**: streep ink-4 + `{App} uit` (ink-4).
 *
 * Door ook bij 0 het breukje te tonen blijft de tekst op één regel en
 * voorspelbaar; de stip-variant communiceert de "leeg"-staat visueel.
 *
 * Klik op de strip stopt propagation (zodat de outer card-link niet ook
 * fired) en navigeert direct naar `tabHref`. Dat geeft de gebruiker een
 * snelweg vanuit de Kern-landing naar de app-tab op de categoriepagina.
 *
 * Opmerking: deze component wordt buiten de outer `<Link>` van de card
 * gerenderd om HTML-validatie te respecteren (`<button>` in `<a>` is invalid).
 */
export function CategoryCardAppStrip({
  appLabel,
  moduleActive,
  trackedCount,
  totalCount,
  tabHref,
}: CategoryCardAppStripProps) {
  const router = useRouter()

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    event.preventDefault()
    router.push(tabHref)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-1.5 border-t border-[var(--border-ed)] px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-[var(--subtle)]/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      aria-label={`Open ${appLabel}`}
    >
      <StatusDot
        moduleActive={moduleActive}
        trackedCount={trackedCount}
      />
      <span
        className={
          moduleActive && trackedCount > 0
            ? 'text-kern-700'
            : moduleActive
              ? 'text-[var(--ink-3)]'
              : 'text-[var(--ink-4)]'
        }
      >
        {moduleActive ? (
          <>
            {appLabel}
            <span className="mx-1 text-[var(--ink-4)]">·</span>
            <span className="font-mono tabular-nums">
              {trackedCount}/{totalCount}
            </span>
          </>
        ) : (
          <>{appLabel} uit</>
        )}
      </span>
    </button>
  )
}

function StatusDot({
  moduleActive,
  trackedCount,
}: {
  moduleActive: boolean
  trackedCount: number
}) {
  if (!moduleActive) {
    return (
      <span
        className="block h-px w-2 bg-[var(--ink-4)]"
        aria-hidden="true"
      />
    )
  }
  if (trackedCount > 0) {
    return (
      <span
        className="block h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--module-active-700)' }}
        aria-hidden="true"
      />
    )
  }
  return (
    <span
      className="block h-1.5 w-1.5 rounded-full border border-[var(--ink-3)]"
      aria-hidden="true"
    />
  )
}
