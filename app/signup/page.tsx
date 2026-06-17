'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    // Vrijheidscheck-conversie: draagt het check-token door de e-mailbevestiging
    // heen, zodat de gebruiker na inloggen op /check/activeren landt en de intake
    // wordt overgezet naar het nieuwe account.
    const checkToken = new URLSearchParams(window.location.search).get('check')
    const next = checkToken
      ? `/check/activeren?token=${encodeURIComponent(checkToken)}`
      : null
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: next
          ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          : `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
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
        <p className="mb-6 text-center text-xs text-zinc-400">
          Account aanmaken duurt een minuut, je profiel klaar in ~5 minuten.
        </p>

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
              minLength={6}
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
