'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ConnectionOutcome } from '@/lib/truelayer/connection-outcome'

/** Hoe vaak we kijken zolang de app zichtbaar is. */
const POLL_MS = 10_000
/** Na een kwartier stoppen we: dan is de gebruiker afgehaakt, niet onderweg. */
const MAX_WAIT_MS = 15 * 60_000

/** `'sessie'`: ingelogd-zijn is verlopen tijdens het wachten; verder kijken heeft geen zin. */
async function fetchOutcome(connectionId: string): Promise<ConnectionOutcome | 'sessie' | null> {
  try {
    const res = await fetch(
      `/api/bank-connect/connection-status?id=${encodeURIComponent(connectionId)}`,
      { cache: 'no-store' },
    )
    if (res.status === 401) return 'sessie'
    if (!res.ok) return null
    const data = (await res.json()) as { outcome?: ConnectionOutcome }
    return data.outcome ?? null
  } catch {
    return null
  }
}

type View = 'wachten' | 'mislukt' | 'verlopen' | 'sessie'

/**
 * Het wachtscherm van de geïnstalleerde app terwijl de bank in een apart venster
 * openstaat (B-051, zie `lib/truelayer/open-bank-auth.ts`).
 *
 * Volgt déze ene koppelpoging via `GET /api/bank-connect/connection-status` —
 * elke tien seconden zolang de app zichtbaar is en meteen zodra hij weer zichtbaar
 * wordt. Geslaagd: door naar de succespagina. Mislukt: dat zeggen, met de weg
 * terug naar de koppelwizard, in plaats van een kwartier te blijven wachten.
 */
export function BankAuthWaiting({
  connectionId,
  onCancel,
  compact = false,
  onSuccess,
  showAccountsLink = true,
}: {
  /** De `bank_connections`-rij die `auth-link` voor deze poging aanmaakte. */
  connectionId: string
  /** Terug naar waar de gebruiker was, zonder te wachten. */
  onCancel: () => void
  /** Kaartvariant (herstelactie op de rekening) in plaats van een volle stap. */
  compact?: boolean
  /**
   * Wat er gebeurt als de koppeling gelukt is. Weggelaten = door naar
   * `/core/cash/connect/success` (de wizard). De onboarding geeft hier zijn eigen
   * succesweergave mee, omdat die flow niet naar de app-succespagina hoort te springen.
   */
  onSuccess?: () => void
  /**
   * Toon de link "Naar je rekeningen" (standaard aan). De onboarding zet 'm uit:
   * tijdens de afrondingsstappen is `/core/cash` geen plek om heen te gaan.
   */
  showAccountsLink?: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<View>('wachten')
  // Ref en geen effect-dependency: een inline callback van de ouder zou anders bij
  // elke render de polling herstarten (en de kwartier-teller resetten).
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  }, [onSuccess])

  useEffect(() => {
    const startedAt = Date.now()
    let stopped = false

    async function check() {
      if (stopped) return
      if (Date.now() - startedAt > MAX_WAIT_MS) {
        stopped = true
        setView('verlopen')
        return
      }
      const outcome = await fetchOutcome(connectionId)
      if (stopped || outcome === null || outcome === 'wachten') return
      stopped = true
      if (outcome === 'gelukt') {
        if (onSuccessRef.current) onSuccessRef.current()
        else router.replace('/core/cash/connect/success')
      } else setView(outcome === 'sessie' ? 'sessie' : 'mislukt')
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void check()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [connectionId, router])

  const title =
    view === 'sessie'
      ? 'Je bent uitgelogd'
      : view === 'mislukt'
      ? 'Het koppelen is niet gelukt'
      : view === 'verlopen'
        ? 'We zien nog geen koppeling'
        : 'Rond het koppelen af bij je bank'
  const body =
    view === 'sessie'
      ? 'Log opnieuw in en kijk bij je rekeningen of de koppeling er staat.'
      : view === 'mislukt'
      ? 'Je bank gaf toestemming, maar er is geen rekening gekoppeld. Probeer het opnieuw; lukt het weer niet, kijk dan bij je rekeningen welke al gekoppeld zijn.'
      : view === 'verlopen'
        ? 'Ben je klaar bij je bank? Kijk dan bij je rekeningen of de koppeling er staat.'
        : 'Zodra je bank klaar is, gaat de app hier vanzelf verder. Kom je na afloop in je browser uit? Sluit dat tabblad en kom terug naar de app.'

  return (
    <div
      className={
        compact
          ? 'mt-3 border-t border-[var(--border-ed)] pt-3 text-left'
          : 'flex flex-col items-center py-12 text-center'
      }
      role={view === 'mislukt' ? 'alert' : undefined}
      aria-live="polite"
    >
      {!compact && view === 'wachten' && (
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-kern-500 border-t-transparent" />
      )}
      <p
        className={`${compact || view !== 'wachten' ? '' : 'mt-4 '}text-sm font-medium ${
          view === 'mislukt' ? 'text-negative' : 'text-[var(--ink-2)]'
        }`}
      >
        {title}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-2)]">{body}</p>
      <div className={`mt-4 flex flex-wrap items-center gap-3 ${compact ? '' : 'justify-center'}`}>
        {showAccountsLink && (
          <Link
            href="/core/cash"
            className="text-xs font-medium text-kern-700 underline underline-offset-2"
          >
            Naar je rekeningen
          </Link>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-[var(--ink-2)] underline underline-offset-2"
        >
          {view === 'wachten' ? 'Annuleren' : 'Opnieuw proberen'}
        </button>
      </div>
    </div>
  )
}
