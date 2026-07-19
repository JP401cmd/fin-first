'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { translateAuthError, isUserAlreadyRegisteredError } from '@/lib/auth-errors'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  // Vrijheidscheck-conversie: draagt het check-token door de aanmaakflow heen
  // (e-mailbevestiging óf Google-OAuth), zodat de gebruiker na inloggen op
  // /check/activeren landt en de intake wordt overgezet naar het nieuwe account.
  // In een effect gelezen (niet tijdens render) om hydration-mismatch te
  // vermijden; OAuth/submit gebeuren pas ná mount, dus de waarde staat er dan.
  const [checkNext, setCheckNext] = useState<string | null>(null)
  useEffect(() => {
    const checkToken = new URLSearchParams(window.location.search).get('check')
    if (checkToken) {
      setCheckNext(`/check/activeren?token=${encodeURIComponent(checkToken)}`)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Dynamische import: houdt de Supabase-browser-SDK (@supabase/ssr →
      // supabase-js) uit het first-load-chunk van /signup. De factory laadt pas
      // bij de eerste submit — zelfde createClient(), zelfde gedrag.
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const next = checkNext
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: next
            ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
            : `${window.location.origin}/auth/callback`,
        },
      })

      // ANTI-ENUMERATIE: een al-geregistreerd e-mailadres behandelen we
      // IDENTIEK aan een geslaagde registratie — hetzelfde "Controleer je
      // e-mail"-scherm, nooit de onthullende "dit adres is al geregistreerd"-
      // melding. Anders verklapt de UI of een adres al een account heeft
      // (account-enumeratie). Met e-mailbevestiging aan doet Supabase dit deels
      // zelf: voor een bestaand bevestigd adres komt er GEEN error terug maar
      // een obfuscated user (lege identities) → dat valt vanzelf in de else.
      // Mocht Supabase tóch een expliciete "user already registered"-fout geven
      // (bv. bevestiging uit, of een SDK-/versiewissel), dan vangen we die hier
      // af zodat de neutrale respons niet van de dashboard-config afhangt.
      // Zie lib/auth-errors.ts#isUserAlreadyRegisteredError.
      if (error && !isUserAlreadyRegisteredError(error)) {
        setError(translateAuthError(error))
      } else {
        setSuccess(true)
      }
    } catch (err) {
      // Netwerkfout/timeout: zonder deze catch bleef `loading` eeuwig true.
      // translateAuthError herkent de fetch-fout en geeft de offline-copy.
      setError(translateAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex items-center justify-center">
          <span className="font-display text-[26px] font-bold leading-none text-zinc-900">t</span>
          <span className="font-display text-[26px] font-bold leading-none text-amber-600">f.</span>
          <span className="ml-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">TriFinity</span>
        </Link>
        <div className="w-full rounded-xl bg-white p-8 shadow-lg text-center">
          <h1 className="mb-4 text-2xl font-bold text-zinc-900">Controleer je e-mail</h1>
          <p className="text-zinc-600">
            We hebben je een bevestigingslink gestuurd. Controleer je e-mail om je account te activeren.
          </p>
          {/* Neutrale voetnoot (anti-enumeratie): dit scherm verschijnt óók als
              het adres al een account had. De zin klopt dan nog steeds en
              verwijst naar inloggen — zonder te verklappen of er een account
              bestaat. Sober gehouden, in lijn met de coach-stem. */}
          <p className="mt-3 text-xs text-zinc-500">
            Heb je al een account? Dan kun je hieronder gewoon inloggen.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-zinc-900 hover:underline"
          >
            Terug naar inloggen
          </Link>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
      <Link href="/" className="mb-6 flex items-center justify-center">
        <span className="font-display text-[26px] font-bold leading-none text-zinc-900">t</span>
        <span className="font-display text-[26px] font-bold leading-none text-amber-600">f.</span>
        <span className="ml-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">TriFinity</span>
      </Link>
      <div className="w-full rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900">
          Account aanmaken
        </h1>

        {/* Philosofie-haak + tijd-tot-waarde: zet de toon ("geld is opgeslagen
            tijd") en geeft een eerlijke verwachting voordat de gebruiker begint.
            Sobere copy, geen uitroeptekens — in lijn met de coach-stem. */}
        <p className="mb-1 text-center text-sm italic text-zinc-600">
          Geld is opgeslagen tijd &mdash; we vertalen je geld naar jaren vrijheid.
        </p>
        <p className="mb-4 text-center text-xs text-zinc-400">
          Account aanmaken duurt een minuut, je profiel klaar in ~5 minuten.
        </p>

        {/* Consent-zin (besluit 17) — dekt bewust BEIDE aanmaakpaden (e-mail én
            Google). BOVEN beide knoppen geplaatst: de Google-knop is het eerste
            interactieve element, dus in de leesvolgorde moet consent vóór élke
            aanmaak-actie staan, niet erna. De links maken voorwaarden en
            privacyverklaring expliciet vindbaar. */}
        <p className="mb-5 text-center text-xs text-zinc-500">
          Door een account aan te maken &mdash; met e-mail of via Google &mdash; ga
          je akkoord met de{' '}
          <Link href="/voorwaarden" className="underline hover:text-zinc-700">
            voorwaarden
          </Link>{' '}
          en de{' '}
          <Link href="/privacy" className="underline hover:text-zinc-700">
            privacyverklaring
          </Link>
          .
        </p>

        {/* Aanmaken met Google boven het formulier — signInWithOAuth maakt bij
            een onbekend account vanzelf een user aan (en logt een bestaand in).
            checkNext draagt een lopende vrijheidscheck door de OAuth-flow heen. */}
        <GoogleAuthButton
          label="Aanmaken met Google"
          loadingLabel="Account aanmaken…"
          next={checkNext}
        />

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs uppercase tracking-[0.08em] text-zinc-400">of</span>
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
              E-mailadres
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              Wachtwoord
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              aria-describedby="password-hint"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
            {/* Wachtwoordeisen vooraf tonen (A-05): permanente hint, geen
                placeholder — blijft leesbaar terwijl de gebruiker typt. */}
            <p id="password-hint" className="mt-1 text-xs text-zinc-400">
              Minimaal 6 tekens
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Account aanmaken...' : 'Registreren'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Al een account?{' '}
          <Link href="/login" className="font-medium text-zinc-900 hover:underline">
            Inloggen
          </Link>
        </p>
      </div>
      </div>
    </div>
  )
}
