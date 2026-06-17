'use client'

/**
 * /check/activeren — landingspagina ná signup vanuit de Vrijheidscheck.
 *
 * De gebruiker komt hier (authenticated) binnen via de auth-callback met
 * `?token=<check-token>`. We roepen /api/check/activate aan om de intake-cijfers
 * over te zetten naar het verse account en sturen daarna door naar /overzicht.
 *
 * Bewust een eigen, kleine pagina (geen wijziging aan bestaande auth/onboarding-
 * flows). Vereist een sessie; zonder sessie geeft de route 401 en tonen we een
 * nette fallback.
 */

import { useEffect, useState } from 'react'

type Status = 'busy' | 'error'

export default function CheckActiverenPage() {
  const [status, setStatus] = useState<Status>('busy')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setStatus('error')
      setMessage('We konden je check niet vinden. Je kunt direct verder in de app.')
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/check/activate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        if (cancelled) return
        if (res.ok) {
          window.location.href = '/overzicht'
          return
        }
        setStatus('error')
        setMessage('Het overzetten lukte niet helemaal. Je kunt gewoon verder in de app.')
      } catch {
        if (cancelled) return
        setStatus('error')
        setMessage('Het overzetten lukte niet. Je kunt gewoon verder in de app.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center">
          <span className="font-display text-[26px] font-bold leading-none text-zinc-900">t</span>
          <span className="font-display text-[26px] font-bold leading-none text-amber-600">f.</span>
          <span className="ml-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            TriFinity
          </span>
        </div>

        {status === 'busy' ? (
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <div
              className="mx-auto mb-5 h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-amber-600"
              aria-hidden
            />
            <h1 className="mb-2 text-xl font-bold text-zinc-900">Je gegevens gaan mee</h1>
            <p className="text-sm text-zinc-600">
              We zetten je Vrijheidscheck om in een gevuld account &mdash; één moment.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-white p-8 shadow-lg">
            <h1 className="mb-2 text-xl font-bold text-zinc-900">Bijna klaar</h1>
            <p className="mb-6 text-sm text-zinc-600">{message}</p>
            <a
              href="/overzicht"
              className="inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Naar mijn overzicht
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
