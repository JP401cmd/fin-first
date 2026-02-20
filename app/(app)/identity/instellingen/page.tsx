'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NOTIFICATION_TYPES } from '@/lib/identity-constants'

export default function InstellingenPage() {
  const router = useRouter()
  const supabase = createClient()

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>({
    budget: true, streak: true, sync: true,
    recommendation: true, insight: true, badge: true, levelup: true,
  })
  const [notifLoading, setNotifLoading] = useState(true)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifMessage, setNotifMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Reset state
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  useEffect(() => {
    async function loadPrefs() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: notifData } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', `notifications_preferences_${user.id}`)
        .maybeSingle()

      if (notifData?.value) {
        try {
          const parsed = JSON.parse(notifData.value)
          setNotifPrefs(prev => ({ ...prev, ...parsed }))
        } catch { /* ignore invalid JSON */ }
      }
      setNotifLoading(false)
    }
    loadPrefs()
  }, [supabase])

  const toggleNotifPref = useCallback((type: string) => {
    setNotifPrefs(prev => ({ ...prev, [type]: !prev[type] }))
  }, [])

  const saveNotifPrefs = useCallback(async () => {
    setNotifSaving(true)
    setNotifMessage(null)
    try {
      const res = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: notifPrefs }),
      })
      if (!res.ok) throw new Error('Save failed')
      setNotifMessage({ type: 'success', text: 'Opgeslagen!' })
      setTimeout(() => setNotifMessage(null), 3000)
    } catch {
      setNotifMessage({ type: 'error', text: 'Opslaan mislukt. Probeer opnieuw.' })
    }
    setNotifSaving(false)
  }, [notifPrefs])

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-5 sm:mb-8">
        <h1 className="text-3xl font-bold text-[var(--ink)]">Instellingen</h1>
        <p className="mt-2 text-[var(--ink-3)]">
          Notificatie-instellingen en gegevensbeheer.
        </p>
      </div>

      {/* ── Notificatie-instellingen ────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="label-editorial text-[var(--ink-2)]">
          Notificatie-instellingen
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Kies welke meldingen je wilt ontvangen.
        </p>

        {notifLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-zinc-900" />
          </div>
        ) : (
          <>
            <div className="divide-y divide-zinc-100 rounded-xl border border-[var(--border-ed)]">
              {NOTIFICATION_TYPES.map(({ type, label, description, icon: Icon }) => {
                const enabled = notifPrefs[type] !== false
                return (
                  <div key={type} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 shrink-0 text-[var(--ink-3)]" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--ink-2)]">{label}</p>
                        <p className="text-xs text-[var(--ink-3)]">{description}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleNotifPref(type)}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        enabled ? 'bg-zinc-900' : 'bg-zinc-300'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-[var(--paper)] transition-transform ${
                        enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 sm:mt-6 flex items-center gap-3">
              <button
                onClick={saveNotifPrefs}
                disabled={notifSaving}
                className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
              >
                {notifSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
              {notifMessage && (
                <span className={`text-sm ${notifMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {notifMessage.text}
                </span>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Gegevens Resetten ──────────────────────────────────── */}
      <section className="mb-5 sm:mb-8 rounded-2xl border border-red-200 bg-[var(--paper)] p-4 sm:p-8">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-red-400 uppercase">
          Gegevens Resetten
        </h2>
        <p className="mt-1 mb-3 sm:mb-6 text-sm text-[var(--ink-3)]">
          Wis al je financiele gegevens en doorloop de onboarding opnieuw.
          Dit verwijdert al je bankrekeningen, transacties, budgetten, doelen en overige data.
        </p>

        <button
          onClick={() => setShowResetDialog(true)}
          disabled={resetting}
          className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
        >
          {resetting ? 'Bezig met wissen...' : 'Alle gegevens wissen'}
        </button>
        {resetError && (
          <p className="mt-3 text-sm text-red-600">{resetError}</p>
        )}
      </section>

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-[var(--paper)] p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-[var(--ink)]">Weet je het zeker?</h3>
            <p className="mt-2 text-sm text-[var(--ink-2)]">
              Dit wist <span className="font-semibold text-red-600">al je financiele data</span> permanent.
              Je wordt teruggeleid naar de onboarding om opnieuw te beginnen.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowResetDialog(false)}
                className="rounded-lg border border-[var(--border-md)] px-4 py-2 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={async () => {
                  setShowResetDialog(false)
                  setResetting(true)
                  try {
                    const res = await fetch('/api/onboarding/reset', { method: 'POST' })
                    if (!res.ok) throw new Error('Reset failed')
                    router.push('/onboarding')
                  } catch {
                    setResetting(false)
                    setResetError('Reset mislukt. Probeer opnieuw.')
                  }
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Alles wissen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
