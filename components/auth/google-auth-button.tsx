'use client'

import { useState } from 'react'
import { translateAuthError } from '@/lib/auth-errors'

/**
 * "Doorgaan met Google" — gedeelde OAuth-knop voor /login én /signup.
 *
 * Waarom één component: login en signup zijn voor Google exact dezelfde
 * handeling (`signInWithOAuth` maakt bij een onbekend Google-account vanzelf
 * een user aan, en logt een bestaand account in). Eén bron voorkomt dat de twee
 * paden uiteen gaan lopen — het label verschilt, de flow niet.
 *
 * De flow leunt volledig op wat er al staat: PKCE (`@supabase/ssr`) → de
 * bestaande `/auth/callback`-route (`exchangeCodeForSession`) → het profiel dat
 * de `on_auth_user_created`-trigger provider-agnostisch aanmaakt. Deze knop voegt
 * alleen het startsein toe.
 */
export function GoogleAuthButton({
  label,
  loadingLabel,
  next,
}: {
  /** Zichtbare tekst, bv. "Inloggen met Google" of "Aanmaken met Google". */
  label: string
  /**
   * Tekst tijdens de redirect naar Google. Laat 'm de context van de call-site
   * spiegelen ("Bezig met inloggen…" / "Account aanmaken…"), net als de
   * e-mail-submitknop ernaast. Zonder waarde: neutraal "Bezig…".
   */
  loadingLabel?: string
  /**
   * Veilig, relatief pad waar de gebruiker na de callback landt (bv. het
   * oorspronkelijk gevraagde `redirectTo`, of de check-activeren-route). Wordt
   * als `next` aan de callback meegegeven; de callback zelf weigert nog eens
   * open-redirects via `safeRelativePath`. Leeg = de callback-default (/overzicht).
   */
  next?: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    try {
      // Dynamische import: houdt de Supabase-browser-SDK (@supabase/ssr →
      // supabase-js) uit het first-load-chunk van /login en /signup (die deze
      // knop delen). De factory laadt pas bij de klik — zelfde gedrag.
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const callback = new URL('/auth/callback', window.location.origin)
      if (next) callback.searchParams.set('next', next)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Supabase stuurt na Google terug naar deze URL met ?code=…; de
          // bestaande callback-route ruilt die om voor een sessie en redirect
          // naar ?next. Zelfde route als de e-mailbevestiging gebruikt.
          redirectTo: callback.toString(),
        },
      })

      // Bij succes volgt een volledige paginanavigatie naar Google — `loading`
      // blijft dan bewust true tot de browser wegnavigeert. Alleen als
      // signInWithOAuth zónder redirect terugkomt is er iets misgegaan.
      if (error) {
        setError(translateAuthError(error))
        setLoading(false)
      }
    } catch (err) {
      // Netwerkfout/timeout: zonder deze catch bleef de knop eeuwig in laadstand.
      setError(translateAuthError(err))
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex min-h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {/* Officiële Google-'G', inline als SVG — geen externe request (geen
            tracking, geen afhankelijkheid van een CDN dat de auth-pagina kan
            vertragen of blokkeren). */}
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
          />
        </svg>
        {loading ? loadingLabel ?? 'Bezig…' : label}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
