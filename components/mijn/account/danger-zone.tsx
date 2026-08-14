'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle } from 'lucide-react'
import { purgeAccountScopedStorage } from '@/lib/browser-account-storage'

/**
 * DangerZone — onomkeerbare account-verwijdering. Vereist dat de gebruiker
 * zijn eigen e-mailadres exact overtypt voordat de knop actief wordt.
 * Roept `POST /api/account/delete` aan met `mode: 'delete'`; dat wist alle
 * data én verwijdert het auth-account (service-role), waarna inloggen niet
 * meer mogelijk is.
 */
export function DangerZone({ currentEmail }: { currentEmail: string }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = confirm.trim().toLowerCase() === currentEmail.toLowerCase()

  async function handleDelete() {
    if (!matches) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'delete', confirm: currentEmail }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Verwijderen mislukt')
      }
      // De server is leeg, maar de browser hield kopieën: onboarding-antwoorden
      // (inkomen/vermogen), concepten en de krantcache. Wie "verwijder alles"
      // vraagt, hoort niet met zijn gegevens op het toestel achter te blijven.
      purgeAccountScopedStorage()
      router.replace('/')
    } catch (err) {
      setDeleting(false)
      setError(err instanceof Error ? err.message : 'Verwijderen mislukt. Probeer opnieuw.')
    }
  }

  return (
    <section aria-labelledby="danger-heading" className="space-y-4">
      <header>
        <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-red-400">
          Danger zone
        </div>
        <h2 id="danger-heading" className="font-serif text-xl sm:text-2xl text-[var(--ink)] mt-1">
          Account verwijderen
        </h2>
      </header>

      <div className="rounded-2xl border border-red-200 bg-[var(--paper)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0 bg-red-50 text-red-700">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--ink-2)] leading-relaxed">
              Dit wist <span className="font-semibold text-red-700">al je data</span> uit
              TriFinity en verwijdert je account definitief. Daarna kun je niet
              meer inloggen. Dit is <span className="font-semibold">onomkeerbaar</span> —
              exporteer eerst je gegevens als je een back-up wilt.
            </p>

            <label
              htmlFor="delete-confirm"
              className="mt-4 block text-xs font-medium text-[var(--ink-2)]"
            >
              Typ ter bevestiging je e-mailadres: <span className="font-mono">{currentEmail}</span>
            </label>
            <input
              id="delete-confirm"
              type="email"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              placeholder={currentEmail}
              className="mt-1 block w-full rounded-lg border border-red-200 bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] shadow-sm focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleDelete}
              disabled={!matches || deleting}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              {deleting ? 'Bezig met verwijderen…' : 'Account permanent verwijderen'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
