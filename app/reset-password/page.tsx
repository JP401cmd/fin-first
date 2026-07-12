'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/auth-errors'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Veld-fout voor de bevestiging (A-08): al bij on-blur getoond, niet pas bij
  // submit, en meteen weg zodra de invoer geldig wordt.
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  // Vergelijkt de bevestiging met het wachtwoord; leeg = nog niets te valideren.
  function validateConfirm(confirmValue: string) {
    if (confirmValue.length > 0 && confirmValue !== password) {
      setConfirmError('Wachtwoorden komen niet overeen')
    } else {
      setConfirmError(null)
    }
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setHasSession(Boolean(session))
      })
      // Transiente netwerkfout: behandel als "geen sessie" (veilige fallback —
      // gebruiker kan een nieuwe reset-link aanvragen) i.p.v. unhandled reject.
      .catch(() => setHasSession(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Synchrone validatie vóór de netwerkcall — geen loading-flikkering nodig.
    if (password.length < 6) {
      setError('Wachtwoord moet minimaal 6 tekens bevatten')
      return
    }

    if (password !== confirmPassword) {
      setError('Wachtwoorden komen niet overeen')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setError(translateAuthError(error))
      } else {
        setSuccess(true)
        // Redirect to dashboard after short delay so user sees success message
        setTimeout(() => router.push('/overzicht'), 2000)
      }
    } catch (err) {
      // Netwerkfout/timeout: zonder deze catch bleef `loading` eeuwig true.
      setError(translateAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  // Sessie-check loopt nog (A-07): toon een laad-skelet i.p.v. het formulier,
  // zodat we niet kort een invulbaar formulier tonen dat daarna kan omslaan
  // naar de "link verlopen"-melding.
  if (hasSession === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg" aria-busy="true">
          <div className="mx-auto mb-6 h-8 w-2/3 animate-pulse rounded bg-zinc-100" />
          <div className="space-y-4">
            <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
            <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
            <div className="h-11 animate-pulse rounded-lg bg-zinc-200" />
          </div>
          <span className="sr-only">Bezig met laden…</span>
        </div>
      </div>
    )
  }

  if (hasSession === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg text-center">
          <h1 className="mb-4 text-2xl font-bold text-zinc-900">Link verlopen of ongeldig</h1>
          <p className="text-zinc-600">
            Deze wachtwoord-resetlink is verlopen of al gebruikt.
            Vraag een nieuwe link aan om je wachtwoord opnieuw in te stellen.
          </p>
          <Link
            href="/forgot-password"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Nieuwe resetlink aanvragen
          </Link>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg text-center">
          <div className="mb-4 text-4xl">✓</div>
          <h1 className="mb-4 text-2xl font-bold text-zinc-900">Wachtwoord gewijzigd</h1>
          <p className="text-zinc-600">
            Je wachtwoord is succesvol bijgewerkt. Je wordt doorgestuurd...
          </p>
          <Link
            href="/overzicht"
            className="mt-6 inline-block text-sm font-medium text-zinc-900 hover:underline"
          >
            Naar Overzicht
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900">
          Nieuw wachtwoord instellen
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
              Nieuw wachtwoord
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Minimaal 6 tekens"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700">
              Bevestig wachtwoord
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                const value = e.target.value
                setConfirmPassword(value)
                // Hervalideer tijdens het typen zodra er al een fout staat, zodat
                // die verdwijnt op het moment dat de invoer geldig wordt.
                if (confirmError) validateConfirm(value)
              }}
              onBlur={() => validateConfirm(confirmPassword)}
              required
              minLength={6}
              placeholder="Herhaal je wachtwoord"
              aria-invalid={confirmError ? true : undefined}
              aria-describedby={confirmError ? 'confirmPassword-err' : undefined}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
            {confirmError && (
              <p id="confirmPassword-err" className="mt-1 text-sm text-red-600" role="alert">
                {confirmError}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? 'Bezig met opslaan...' : 'Wachtwoord opslaan'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          <Link href="/login" className="font-medium text-zinc-900 hover:underline">
            Terug naar inloggen
          </Link>
        </p>
      </div>
    </div>
  )
}
