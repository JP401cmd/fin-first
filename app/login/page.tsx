'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isExpired = searchParams.get('expired') === '1'
  const isBlocked = searchParams.get('blocked') === '1'
  const redirectTo = searchParams.get('redirectTo')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      // Redirect to the originally requested page or the app home
      const destination = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/overzicht'
      router.push(destination)
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
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
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
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
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
