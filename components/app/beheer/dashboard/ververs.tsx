'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

/**
 * "Gemeten om" plus verversen.
 *
 * Het dashboard leest bij elke opvraag opnieuw; er is geen tussenopslag die kan
 * verouderen. Dit onderdeel vraagt het scherm opnieuw op: met de knop, en
 * vanzelf elke tien minuten zolang het tabblad zichtbaar is. Vaker heeft geen
 * zin: de traagste bronnen verversen dagelijks, en elke opvraag kost een ronde
 * leesacties.
 *
 * Keuzes op het scherm (een filter, een vastgezette dag in een grafiek) blijven
 * staan bij het verversen: alleen de cijfers worden opnieuw gelezen.
 */

const VERVERS_INTERVAL_MS = 10 * 60 * 1000

export function Ververs({ gemetenOm }: { gemetenOm: string }) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  // De aankondiging volgt alleen op een meting waarom gevraagd is, en pas als
  // die meting er staat. Een stille verversing op de achtergrond hoort een
  // schermlezer niet te onderbreken, ook niet nadat er eerder op de knop is
  // gedrukt: de tekst blijft dan staan zoals hij was.
  const [gevraagd, setGevraagd] = useState(0)
  const [aangekondigd, setAangekondigd] = useState(0)
  const [melding, setMelding] = useState('')

  // Toestand bijwerken tijdens het renderen, op een verandering van een andere
  // toestand (het patroon uit de React-documentatie voor afgeleide toestand):
  // de gevraagde meting is klaar zodra de overgang niet meer loopt. Het
  // volgnummer maakt elke aankondiging anders dan de vorige, ook binnen
  // dezelfde minuut: een gelijke tekst leest een schermlezer niet opnieuw voor.
  if (!bezig && aangekondigd < gevraagd) {
    setAangekondigd(gevraagd)
    setMelding(`Het dashboard is opnieuw gemeten om ${gemetenOm} (meting ${gevraagd}).`)
  }

  const ververs = useCallback(
    (opVerzoek: boolean) => {
      if (opVerzoek) setGevraagd((n) => n + 1)
      start(() => {
        router.refresh()
      })
    },
    [router],
  )

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') ververs(false)
    }, VERVERS_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [ververs])

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="font-mono text-[11px] tabular-nums text-[var(--ink-3)]" data-testid="gemeten-om">
        Gemeten om {gemetenOm} · ververst elke 10 minuten
      </p>
      <button
        type="button"
        // `aria-disabled` en niet `disabled`: een knop die uitgeschakeld wordt
        // terwijl hij de focus heeft, verliest die focus. Wie met het toetsenbord
        // werkt, staat dan weer bovenaan de pagina.
        aria-disabled={bezig}
        aria-busy={bezig}
        onClick={() => {
          if (!bezig) ververs(true)
        }}
        data-testid="nu-meten"
        className="inline-flex min-h-11 items-center gap-1.5 border border-[var(--border-ed)] px-3 py-1.5 text-sm text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] aria-disabled:cursor-default aria-disabled:opacity-60"
      >
        <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${bezig ? 'motion-safe:animate-spin' : ''}`} />
        {bezig ? 'Bezig met meten' : 'Nu meten'}
      </button>
      <p aria-live="polite" className="sr-only" data-testid="ververs-melding">
        {melding}
      </p>
    </div>
  )
}
