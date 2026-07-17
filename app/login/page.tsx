'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { safeRelativePath } from '@/lib/safe-redirect'
import { translateAuthError } from '@/lib/auth-errors'
import { GoogleAuthButton } from '@/components/auth/google-auth-button'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isExpired = searchParams.get('expired') === '1'
  const isBlocked = searchParams.get('blocked') === '1'
  // Auth-callback stuurt hierheen als de bevestigings-/resetlink verlopen of al
  // gebruikt is (A-01) — dan tonen we een banner i.p.v. een kale /login.
  const isConfirmError = searchParams.get('confirm_error') === '1'
  const redirectTo = searchParams.get('redirectTo')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(translateAuthError(error))
      } else {
        // Redirect to the originally requested page or the app home.
        // safeRelativePath weigert open-redirect-patronen (//evil.com, /\evil.com, absolute URLs).
        router.push(safeRelativePath(redirectTo))
      }
    } catch (err) {
      // Netwerkfout/timeout: zonder deze catch bleef `loading` eeuwig true.
      setError(translateAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm">
      <Link href="/" className="mb-6 flex items-center justify-center">
        <span className="font-display text-[26px] font-bold leading-none text-zinc-900">t</span>
        <span className="font-display text-[26px] font-bold leading-none text-amber-600">f.</span>
        <span className="ml-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">TriFinity</span>
      </Link>
      <div className="w-full rounded-xl bg-white p-8 shadow-lg">
      <h1 className="mb-2 text-center text-2xl font-bold text-zinc-900">
        Inloggen bij TriFinity
      </h1>

      {/* Philosofie-haak: houdt de "geld is opgeslagen tijd"-stem ook bij
          terugkeer vast. Sobere één-regel, geen tijd-cue (inloggen is geen
          getting-started-moment). */}
      <p className="mb-6 text-center text-sm italic text-zinc-600">
        Welkom terug bij je vrijheid in tijd.
      </p>

      {isConfirmError && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3" data-testid="confirm-error-banner">
          <p className="text-sm font-medium text-amber-800">
            Bevestigingslink werkte niet
          </p>
          <p className="mt-1 text-xs text-amber-600">
            Deze link is verlopen of al gebruikt. Vraag een nieuwe aan of log in.
          </p>
        </div>
      )}

      {isExpired && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3" data-testid="session-expired-banner">
          <p className="text-sm font-medium text-amber-800">
            Je sessie is verlopen
          </p>
          <p className="mt-1 text-xs text-amber-600">
            Log opnieuw in om verder te gaan{redirectTo ? ' waar je gebleven was' : ''}.
          </p>
        </div>
      )}

      {isBlocked && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3" data-testid="account-blocked-banner">
          <p className="text-sm font-medium text-red-800">
            Je account is geblokkeerd
          </p>
          <p className="mt-1 text-xs text-red-600">
            Neem contact op met de beheerder als je denkt dat dit niet klopt.
          </p>
        </div>
      )}

      {/* Google-login boven het e-mailformulier — zelfde flow (PKCE →
          /auth/callback), alleen een ander startpunt. redirectTo wordt rauw
          doorgegeven; de callback saneert 'm nog eens via safeRelativePath. */}
      <GoogleAuthButton
        label="Inloggen met Google"
        loadingLabel="Bezig met inloggen…"
        next={redirectTo}
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
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="min-h-11 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? 'Bezig met inloggen...' : 'Inloggen'}
        </button>
      </form>

      <div className="mt-6 space-y-2 text-center text-sm text-zinc-600">
        <p>
          Nog geen account?{' '}
          <Link href="/signup" className="font-medium text-zinc-900 hover:underline">
            Registreren
          </Link>
        </p>
        <p>
          <Link href="/forgot-password" className="font-medium text-zinc-900 hover:underline">
            Wachtwoord vergeten?
          </Link>
        </p>
      </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <Suspense fallback={
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-6 flex items-center justify-center">
            <span className="font-display text-[26px] font-bold leading-none text-zinc-900">t</span>
            <span className="font-display text-[26px] font-bold leading-none text-amber-600">f.</span>
            <span className="ml-2.5 font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">TriFinity</span>
          </Link>
          <div className="w-full rounded-xl bg-white p-8 shadow-lg">
            <h1 className="mb-6 text-center text-2xl font-bold text-zinc-900">
              Inloggen bij TriFinity
            </h1>
            <div className="space-y-4">
              <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
              <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
              <div className="h-10 animate-pulse rounded-lg bg-zinc-200" />
            </div>
          </div>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  )
}
