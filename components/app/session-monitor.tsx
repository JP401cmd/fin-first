'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LogIn, AlertTriangle, Eye, EyeOff } from 'lucide-react'

/**
 * SessionMonitor — client-side session expiry detection & re-login prompt.
 *
 * Behaviours:
 *  1. Listens to Supabase onAuthStateChange for SIGNED_OUT events
 *  2. Checks de sessie op een expiry-timer (één timeout op `expires_at − 30s`)
 *     i.p.v. een eeuwigdraaiende 60s-poll; her-evaluatie bij TOKEN_REFRESHED
 *     en bij zichtbaar worden van de tab (slaapstand-wake)
 *  3. Intercepts 401 responses from API routes via a global fetch wrapper
 *  4. When expiry detected: shows a friendly modal with inline re-login
 *  5. After successful re-login: closes modal, user continues on current page
 *  6. No data loss — the page is NOT navigated away
 */
export function SessionMonitor() {
  const [sessionExpired, setSessionExpired] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)
  const supabaseRef = useRef(createClient())
  const checkIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track intentional sign-outs to avoid showing the modal
  const intentionalSignOutRef = useRef(false)

  // Expose a way for other code to signal intentional sign-out
  useEffect(() => {
    const handler = () => {
      intentionalSignOutRef.current = true
    }
    window.addEventListener('trifinity:signout', handler)
    return () => window.removeEventListener('trifinity:signout', handler)
  }, [])

  const handleSessionExpired = useCallback(() => {
    // Don't show modal if user intentionally signed out
    if (intentionalSignOutRef.current) return
    setSessionExpired(true)
  }, [])

  // ── 1. Listen to Supabase auth state changes ─────────────────────
  useEffect(() => {
    const supabase = supabaseRef.current

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          handleSessionExpired()
        }
        if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
          // Session recovered — hide modal if showing
          setSessionExpired(false)
          setError(null)
          setPassword('')
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [handleSessionExpired])

  // ── 2. Expiry-timer i.p.v. periodieke poll ────────────────────────
  // Eén timeout op `expires_at − 30s` (her-gezet na elke token-refresh) in
  // plaats van een 60s-interval dat eeuwig doorloopt. De supabase-js client
  // refresht zelf al automatisch; deze check is het vangnet wanneer dat
  // misgaat. Bij zichtbaar worden van de tab (slaapstand/wake) evalueren we
  // de expiry opnieuw — een verlopen timer vuurt tijdens slaap niet af.
  useEffect(() => {
    let cancelled = false

    const checkSession = async () => {
      try {
        const supabase = supabaseRef.current
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return

        if (!session) {
          handleSessionExpired()
          return
        }

        const expiresAt = session.expires_at
        if (!expiresAt) return

        const now = Math.floor(Date.now() / 1000)
        if (expiresAt < now + 30) {
          // Binnen de marge (of al verlopen) — probeer te verversen.
          const { error } = await supabase.auth.refreshSession()
          if (!cancelled && error) {
            handleSessionExpired()
          } else if (!cancelled) {
            // Geslaagd — de volgende run leest de nieuwe expires_at en zet
            // de timer weer vlak vóór het volgende expiry-moment.
            scheduleCheck(60_000)
          }
        } else {
          // Plan de volgende check vlak vóór expiry. TOKEN_REFRESHED (zie
          // effect 1) komt vóór dit moment en triggert via getSession() dan
          // automatisch een nieuwe, latere timer bij de volgende check.
          scheduleCheck((expiresAt - now - 30) * 1000)
        }
      } catch {
        // Network error — don't trigger expiry modal for network issues
      }
    }

    const scheduleCheck = (delayMs: number) => {
      if (checkIntervalRef.current) clearTimeout(checkIntervalRef.current)
      checkIntervalRef.current = setTimeout(checkSession, Math.max(delayMs, 5_000))
    }

    // Slaapstand-wake: de timer heeft stilgestaan — direct her-evalueren.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkSession()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Initial check (after a small delay to let initial auth settle)
    scheduleCheck(5_000)

    return () => {
      cancelled = true
      if (checkIntervalRef.current) clearTimeout(checkIntervalRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [handleSessionExpired])

  // ── 3. Intercept 401 responses from API calls ────────────────────
  useEffect(() => {
    // Bewaar het originele fetch met expliciete `this`-binding op `window`.
    // Zonder bind faalt `originalFetch(...args)` in Chromium met
    // `TypeError: Failed to fetch` (de native fetch eist een Window-receiver).
    // Dat liet ALLE network-errors uit de app op session-monitor:116 landen,
    // ook als de echte fout elders ontstond.
    const originalFetch = window.fetch.bind(window)

    // Voorkom dubbele wrapping (Strict Mode of HMR) — als `window.fetch` al
    // een ander wrapper-merk draagt, plakken we daar niet nog eens overheen.
    const FETCH_WRAPPED = Symbol.for('trifinity.fetchWrapped')
    if ((window.fetch as unknown as { [k: symbol]: unknown })[FETCH_WRAPPED]) {
      return
    }

    const wrapped: typeof window.fetch = async (...args) => {
      const url =
        typeof args[0] === 'string'
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : args[0] instanceof URL
              ? args[0].toString()
              : ''

      let response: Response
      try {
        response = await originalFetch(...args)
      } catch (err) {
        // De native fetch wordt fysiek híer aangeroepen, dus de stacktrace van
        // elke netwerkfout in de app wijst onvermijdelijk naar deze regel — de
        // echte call-site is daaruit niet te herleiden. Plak daarom de URL aan
        // de melding (zelfde error-object: instanceof en startsWith/includes-
        // matchers op 'Failed to fetch' blijven werken).
        if (err instanceof Error && url && !err.message.includes(url)) {
          err.message = `${err.message} — request: ${url}`
        }
        throw err
      }

      const isOurApi = url.startsWith('/api/') || url.includes('/api/')
      const isAuthApi = url.includes('/auth/') || url.includes('supabase.co/auth')

      if (response.status === 401 && isOurApi && !isAuthApi) {
        handleSessionExpired()
      }

      return response
    }
    ;(wrapped as unknown as { [k: symbol]: unknown })[FETCH_WRAPPED] = true

    window.fetch = wrapped

    return () => {
      // Alleen onze eigen wrapper terugdraaien — als iets anders al weer
      // overschreven heeft, laten we dat staan.
      if (window.fetch === wrapped) {
        window.fetch = originalFetch
      }
    }
  }, [handleSessionExpired])

  // ── Re-login handler ─────────────────────────────────────────────
  const handleReLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = supabaseRef.current
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message === 'Invalid login credentials'
          ? 'Ongeldige inloggegevens. Controleer je e-mail en wachtwoord.'
          : authError.message
        )
        setLoading(false)
        return
      }

      // Success! Show brief success state then close
      setLoginSuccess(true)
      setTimeout(() => {
        setSessionExpired(false)
        setLoginSuccess(false)
        setEmail('')
        setPassword('')
        setError(null)
        // Reload to refresh server components with new session
        window.location.reload()
      }, 800)
    } catch {
      setError('Er is een fout opgetreden. Probeer het opnieuw.')
    } finally {
      setLoading(false)
    }
  }

  // ── Go to login page (fallback) ──────────────────────────────────
  const handleGoToLogin = () => {
    const currentPath = window.location.pathname
    window.location.href = `/login?redirectTo=${encodeURIComponent(currentPath)}`
  }

  // ── Render nothing when session is valid ─────────────────────────
  if (!sessionExpired) return null

  // ── Render re-login modal ────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-[right] duration-300"
      style={{ right: 'var(--chat-sidebar-width, 0px)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Sessie verlopen"
      data-testid="session-expired-modal"
    >
      <div className="w-full max-w-md rounded-[var(--r-lg)] bg-[var(--paper)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">
                Sessie verlopen
              </h2>
              <p className="text-sm text-[var(--ink-2)]">
                Je sessie is verlopen. Log opnieuw in om verder te gaan.
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {loginSuccess ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-sm font-medium text-emerald-700">
                Succesvol ingelogd! Even geduld...
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-[var(--ink-3)]">
                Je gegevens zijn veilig. Na het opnieuw inloggen ga je verder waar je gebleven was.
              </p>

              <form onSubmit={handleReLogin} className="space-y-3">
                <div>
                  <label htmlFor="session-email" className="block text-sm font-medium text-[var(--ink-2)]">
                    E-mailadres
                  </label>
                  <input
                    id="session-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    className="mt-1 block w-full rounded-lg border border-[var(--border-md)] px-3 py-2 text-[var(--ink)] shadow-[var(--s0)] focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    placeholder="naam@voorbeeld.nl"
                  />
                </div>

                <div>
                  <label htmlFor="session-password" className="block text-sm font-medium text-[var(--ink-2)]">
                    Wachtwoord
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="session-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="block w-full rounded-lg border border-[var(--border-md)] px-3 py-2 pr-10 text-[var(--ink)] shadow-[var(--s0)] focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--ink-3)] hover:text-[var(--ink-2)]"
                      aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  {loading ? 'Bezig met inloggen...' : 'Opnieuw inloggen'}
                </button>
              </form>

              <div className="mt-4 flex items-center justify-between text-xs text-[var(--ink-3)]">
                <span>Of ga naar de inlogpagina:</span>
                <button
                  onClick={handleGoToLogin}
                  className="font-medium text-[var(--ink-2)] hover:text-[var(--ink)] underline transition-colors"
                >
                  Naar inlogpagina
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
