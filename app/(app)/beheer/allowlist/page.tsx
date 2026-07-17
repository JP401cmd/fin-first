'use client'

import { useState, useEffect, useCallback } from 'react'
import { MailCheck, Plus, Check, AlertCircle, Trash2, CalendarDays, Info } from 'lucide-react'

interface AllowlistEntry {
  id: string
  email_normalized: string
  label: string | null
  created_at: string
}

const dateFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 pb-3">
      <span className="font-inter text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ink-4)]">
        {children}
      </span>
      <div className="h-px flex-1 bg-[var(--border-ed)]" />
    </div>
  )
}

export default function BeheerAllowlistPage() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const clearStatus = useCallback(() => setStatus(null), [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(clearStatus, 4000)
      return () => clearTimeout(timer)
    }
  }, [status, clearStatus])

  const normalizedPreview = email.trim().toLowerCase()

  const loadEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/signup-allowlist')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Laden van de lijst mislukt')
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Laden van de lijst mislukt' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    setAdding(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/signup-allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, label: label.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Toevoegen mislukt')
      const entry = data.entry as AllowlistEntry
      setEntries((prev) =>
        [entry, ...prev].sort((a, b) => a.email_normalized.localeCompare(b.email_normalized)),
      )
      setEmail('')
      setLabel('')
      setStatus({ type: 'success', message: `${entry.email_normalized} staat nu op de lijst.` })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Toevoegen mislukt' })
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/signup-allowlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Verwijderen mislukt')
      setEntries((prev) => prev.filter((entry) => entry.id !== id))
      setConfirmDeleteId(null)
      setStatus({ type: 'success', message: 'Adres van de lijst verwijderd.' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Verwijderen mislukt' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <MailCheck className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Registratie-toegang</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Wie zich mag registreren tijdens de besloten testfase — de e-mail-uitnodigingslijst.
        </p>
      </div>

      {/* Toelichting — bewust altijd zichtbaar, niet weggeklapt */}
      <aside className="mb-8 border border-[var(--ink)] border-l-4 border-l-[var(--ink)] bg-[var(--paper)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ink-3)]" aria-hidden />
          <div className="space-y-2 font-serif text-sm leading-relaxed text-[var(--ink-2)]">
            <p>
              Zolang de testfase loopt, mag alleen wie op deze lijst staat een account aanmaken —
              via e-mailregistratie én via Google. De naam wordt genormaliseerd tot{' '}
              <span className="font-mono text-[13px] text-[var(--ink)]">lower(trim(e-mail))</span>,
              dus een exacte match op het genormaliseerde adres beslist.
            </p>
            <p>
              <strong className="font-semibold text-[var(--ink)]">
                Huishoud-uitnodigingen worden niet automatisch toegelaten.
              </strong>{' '}
              Nodig je iemand uit voor een gedeeld huishouden, dan moet dat adres hier apart op de
              lijst — anders stuit de registratie alsnog.
            </p>
            <p>
              <strong className="font-semibold text-[var(--ink)]">
                Een lege lijst sluit de deur volledig.
              </strong>{' '}
              Staat er niemand op, dan kan niemand nieuw registreren. Bestaande
              accounts loggen ongestoord in.
            </p>
          </div>
        </div>
      </aside>

      {/* Status message */}
      {status && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 flex items-center gap-2 border px-4 py-3 text-sm ${
            status.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {status.type === 'success' ? (
            <Check className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          {status.message}
        </div>
      )}

      {/* Toevoeg-formulier */}
      <section className="mb-8">
        <SectionLabel>Adres uitnodigen</SectionLabel>
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="naam@voorbeeld.nl"
                aria-label="E-mailadres om uit te nodigen"
                className="min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <div className="sm:w-56">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (optioneel)"
                aria-label="Label of notitie (optioneel)"
                className="min-h-[44px] w-full border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
              />
            </div>
            <button
              type="submit"
              disabled={adding || !email.trim()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {adding ? 'Toevoegen…' : 'Toevoegen'}
            </button>
          </div>
          {/* Live normalisatie-preview */}
          {normalizedPreview && (
            <p className="text-xs text-[var(--ink-4)]" aria-live="polite">
              Wordt opgeslagen als{' '}
              <span className="font-mono text-[var(--ink-2)]">{normalizedPreview}</span>
            </p>
          )}
        </form>
      </section>

      {/* Lijst */}
      <section>
        <SectionLabel>Op de lijst ({entries.length})</SectionLabel>
        {loading ? (
          <p className="py-4 text-sm italic text-[var(--ink-4)]">Laden…</p>
        ) : entries.length === 0 ? (
          <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--ink-3)]">Nog niemand op de lijst.</p>
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              Zolang de lijst leeg is, kan niemand nieuw registreren tijdens de testfase.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-dotted divide-[var(--border-ed)] border border-[var(--border-ed)] bg-[var(--paper)]">
            {entries.map((entry) => {
              const confirming = confirmDeleteId === entry.id
              const busy = deletingId === entry.id
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-[var(--ink)]">
                      {entry.email_normalized}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--ink-4)]">
                      {entry.label && <span className="text-[var(--ink-3)]">{entry.label}</span>}
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {fmtDate(entry.created_at)}
                      </span>
                    </div>
                  </div>

                  {confirming ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--ink-3)]">Verwijderen?</span>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={busy}
                        aria-label={`Verwijdering van ${entry.email_normalized} bevestigen`}
                        className="min-h-[36px] bg-red-600 px-3 py-1 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {busy ? 'Bezig…' : 'Ja, verwijderen'}
                      </button>
                      <button
                        autoFocus
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={busy}
                        className="min-h-[36px] border border-[var(--border-ed)] px-3 py-1 text-sm text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] disabled:opacity-40"
                      >
                        Annuleren
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(entry.id)}
                      aria-label={`${entry.email_normalized} van de lijst verwijderen`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 border border-red-300 px-3 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Verwijderen
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
