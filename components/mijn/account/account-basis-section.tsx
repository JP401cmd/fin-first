'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, KeyRound, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { purgeAccountScopedStorage } from '@/lib/browser-account-storage'
import { checkLeakedPassword } from '@/lib/leaked-password'
import { LEAKED_PASSWORD_MESSAGE, MIN_PASSWORD_LENGTH } from '@/lib/password-policy'

/**
 * AccountBasisSection — account-basis los van het abonnement: e-mailadres en
 * wachtwoord wijzigen, plus "overal uitloggen". Gebruikt de Supabase
 * browser-client direct (`auth.updateUser` / `auth.signOut`), net als
 * reset-password en logout elders in de app.
 */
export function AccountBasisSection({ currentEmail }: { currentEmail: string }) {
  return (
    <section aria-labelledby="account-basis-heading" className="space-y-4">
      <header>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          Account
        </div>
        <h2
          id="account-basis-heading"
          className="font-serif text-xl sm:text-2xl text-[var(--ink)] mt-1"
        >
          Inloggegevens
        </h2>
      </header>

      <EmailForm currentEmail={currentEmail} />
      <PasswordForm />
      <SignOutEverywhere />
    </section>
  )
}

function FieldShell({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Mail
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5">
      <header className="flex items-start gap-3 mb-3">
        <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 bg-[var(--subtle)] text-[var(--ink-2)]">
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-base font-semibold text-[var(--ink)]">{title}</h3>
          <p className="text-xs text-[var(--ink-3)] leading-snug mt-0.5">{description}</p>
        </div>
      </header>
      {children}
    </div>
  )
}

const INPUT_CLS =
  'mt-1 block w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] shadow-sm focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]'

const PRIMARY_BTN =
  'rounded-lg bg-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--paper)] hover:bg-[var(--ink-2)] transition-colors disabled:opacity-50'

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (email.trim() === currentEmail) {
      setError('Dit is al je huidige e-mailadres.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
    }
  }

  return (
    <FieldShell
      icon={Mail}
      title="E-mailadres"
      description="Wijzigen vereist een bevestiging via je huidige én nieuwe e-mail."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="account-email" className="block text-xs font-medium text-[var(--ink-2)]">
            E-mailadres
          </label>
          <input
            id="account-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={INPUT_CLS}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {done && (
          <p className="text-xs text-emerald-700">
            We hebben een bevestigingsmail gestuurd. Het adres verandert pas
            nadat je de link in beide mails hebt bevestigd.
          </p>
        )}
        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? 'Bezig…' : 'E-mailadres wijzigen'}
        </button>
      </form>
    </FieldShell>
  )
}

function PasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Wachtwoord moet minimaal 6 tekens bevatten.')
      return
    }
    if (password !== confirm) {
      setError('Wachtwoorden komen niet overeen.')
      return
    }
    setLoading(true)
    // Leaked-password-check (ADR 0057) vóór updateUser: HIBP k-anonimiteit, het
    // wachtwoord verlaat de browser nooit. Fail-open bij een storing.
    const { pwned } = await checkLeakedPassword(password)
    if (pwned) {
      setError(LEAKED_PASSWORD_MESSAGE)
      setLoading(false)
      return
    }
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setPassword('')
      setConfirm('')
    }
  }

  return (
    <FieldShell
      icon={KeyRound}
      title="Wachtwoord"
      description="Kies een nieuw wachtwoord van minimaal 6 tekens."
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="account-password" className="block text-xs font-medium text-[var(--ink-2)]">
            Nieuw wachtwoord
          </label>
          <input
            id="account-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Minimaal 6 tekens"
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label htmlFor="account-password-confirm" className="block text-xs font-medium text-[var(--ink-2)]">
            Bevestig wachtwoord
          </label>
          <input
            id="account-password-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="Herhaal je wachtwoord"
            className={INPUT_CLS}
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {done && <p className="text-xs text-emerald-700">Je wachtwoord is bijgewerkt.</p>}
        <button type="submit" disabled={loading} className={PRIMARY_BTN}>
          {loading ? 'Bezig met opslaan…' : 'Wachtwoord opslaan'}
        </button>
      </form>
    </FieldShell>
  )
}

function SignOutEverywhere() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleSignOut() {
    setLoading(true)
    // Ook hier opruimen: dit is de sterkste uitlogactie van de app en hij gaat
    // niet langs /logout. Zonder deze regel laat juist "log me overal uit" op dít
    // toestel alles staan.
    purgeAccountScopedStorage()
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'global' })
    router.replace('/')
  }

  return (
    <FieldShell
      icon={LogOut}
      title="Sessies"
      description="Log uit op dit én alle andere apparaten waar je bent ingelogd."
    >
      <button
        type="button"
        onClick={handleSignOut}
        disabled={loading}
        className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors disabled:opacity-50"
      >
        {loading ? 'Bezig…' : 'Uitloggen op alle apparaten'}
      </button>
    </FieldShell>
  )
}
