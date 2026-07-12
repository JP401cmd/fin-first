'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Kicker, EditorialHeadline } from '@/components/editorial'

/**
 * Module-bewuste terugkeer-bestemming op basis van de huidige route.
 * De foutmelding zelf blijft generiek; alleen de "terug"-link volgt de module
 * waar de gebruiker vandaan kwam, zodat de terugkeer natuurlijk aanvoelt.
 */
export function resolveReturnTarget(pathname: string | null): {
  label: string
  href: string
} {
  const path = pathname ?? ''
  if (path.startsWith('/toekomst')) {
    return { label: 'Terug naar Toekomst', href: '/toekomst' }
  }
  if (
    path.startsWith('/mijn') ||
    path.startsWith('/berichten') ||
    path.startsWith('/nieuws')
  ) {
    return { label: 'Terug naar Mijn', href: '/mijn' }
  }
  if (path.startsWith('/rapportages')) {
    return { label: 'Terug naar Rapportages', href: '/rapportages' }
  }
  return { label: 'Naar Overzicht', href: '/overzicht' }
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const pathname = usePathname()
  const back = resolveReturnTarget(pathname)

  useEffect(() => {
    // Technische details alleen in de console — nooit aan de gebruiker tonen.
    console.error('[AppError]', error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-6 py-20">
      <Kicker>Er ging iets mis</Kicker>
      <EditorialHeadline emphasis="veilig" className="mt-4 text-[var(--ink)]">
        Je gegevens zijn veilig
      </EditorialHeadline>
      <p
        className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-[var(--ink-2)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Er trad een onverwachte fout op. Er is niets kwijtgeraakt — probeer het
        opnieuw, of keer terug en pak de draad zo weer op.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
        >
          Probeer opnieuw
        </button>
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-5 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
        >
          {back.label}
        </Link>
      </div>
    </div>
  )
}
