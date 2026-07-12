'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Search, Check, AlertCircle, Clock, CalendarDays, Ban, RotateCcw } from 'lucide-react'
import { ADDON_PLANS, formatPlanPrice, type AddonPlan } from '@/lib/subscription-catalog'

interface AdminUser {
  id: string
  email: string | null
  name: string | null
  role: string
  blockedAt: string | null
  createdAt: string | null
  lastSignInAt: string | null
  subscriptions: string[]
  currentTier: string | null
}

interface Diagnose {
  assetCount: number
  assetTotal: number
  debtCount: number
  debtTotal: number
  netWorth: number
  cashAccounts: { name: string; value: number }[]
  txCount: number
  lastTxDate: string | null
}

interface LogEntry {
  id: string
  target_user: string
  assigned_by: string
  old_tier: string
  new_tier: string
  created_at: string
  targetName: string
}

const dateFmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
function eur(n: number): string {
  return eurFmt.format(n)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
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

export default function BeheerGebruikersPage() {
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [user, setUser] = useState<AdminUser | null>(null)
  const [busyTier, setBusyTier] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'role' | 'block' | null>(null)
  const [diagnose, setDiagnose] = useState<Diagnose | null>(null)
  const [busyDiagnose, setBusyDiagnose] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const clearStatus = useCallback(() => setStatus(null), [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(clearStatus, 4000)
      return () => clearTimeout(timer)
    }
  }, [status, clearStatus])

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/tier-assign')
      if (!res.ok) return
      const data = await res.json()
      setLog(Array.isArray(data.log) ? data.log : [])
    } catch {
      // Stil — log is secundair
    }
  }, [])

  useEffect(() => {
    loadLog()
  }, [loadLog])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = email.trim()
    if (!q) return
    setSearching(true)
    setStatus(null)
    setSearched(false)
    try {
      const res = await fetch(`/api/admin/tier-assign?email=${encodeURIComponent(q)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Zoeken mislukt')
      }
      const data = await res.json()
      setUser(data.user ?? null)
      setDiagnose(null)
      setShowDelete(false)
      setDeleteConfirm('')
      setSearched(true)
    } catch (err) {
      // Bij een echte fout tonen we alléén de rode statusbanner — niet óók de
      // "geen gebruiker gevonden"-lege staat (searched blijft false).
      setUser(null)
      setSearched(false)
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Zoeken mislukt' })
    } finally {
      setSearching(false)
    }
  }

  async function handleToggle(plan: AddonPlan) {
    if (!user) return
    const active = user.subscriptions.includes(plan.tier)
    const next = active
      ? user.subscriptions.filter((s) => s !== plan.tier)
      : [...user.subscriptions, plan.tier]

    setBusyTier(plan.tier)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/tier-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, subscriptions: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Bijwerken mislukt')
      setUser({ ...user, subscriptions: data.newSubscriptions ?? next })
      setStatus({
        type: 'success',
        message: active
          ? `${plan.name}-abonnement ingetrokken voor ${user.name || user.email}`
          : `${plan.name}-abonnement toegekend aan ${user.name || user.email}`,
      })
      loadLog()
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Bijwerken mislukt' })
    } finally {
      setBusyTier(null)
    }
  }

  async function handleRoleChange(role: string) {
    if (!user || role === user.role) return
    setBusyAction('role')
    setStatus(null)
    try {
      const res = await fetch('/api/admin/users/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Rol wijzigen mislukt')
      setUser({ ...user, role: data.role ?? role })
      setStatus({
        type: 'success',
        message: `Rol van ${user.name || user.email} gewijzigd naar ${role}`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Rol wijzigen mislukt' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleBlockToggle() {
    if (!user) return
    const willBlock = !user.blockedAt
    if (
      willBlock &&
      !window.confirm(
        `${user.name || user.email} blokkeren? Het account wordt direct uitgelogd en kan niet meer inloggen.`,
      )
    ) {
      return
    }
    setBusyAction('block')
    setStatus(null)
    try {
      const res = await fetch('/api/admin/users/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, blocked: willBlock }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Blokkeren mislukt')
      setUser({ ...user, blockedAt: data.blockedAt ?? (willBlock ? new Date().toISOString() : null) })
      setStatus({
        type: 'success',
        message: willBlock
          ? `${user.name || user.email} geblokkeerd`
          : `${user.name || user.email} gedeblokkeerd`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Blokkeren mislukt' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDiagnose() {
    if (!user) return
    setBusyDiagnose(true)
    setStatus(null)
    try {
      const res = await fetch(
        `/api/admin/user-diagnose?userId=${encodeURIComponent(user.id)}&label=${encodeURIComponent(user.email ?? user.id)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Diagnose mislukt')
      setDiagnose(data as Diagnose)
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Diagnose mislukt' })
    } finally {
      setBusyDiagnose(false)
    }
  }

  async function handleDelete() {
    if (!user) return
    setDeleting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/user-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, confirm: deleteConfirm }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Verwijderen mislukt')
      setStatus({ type: 'success', message: `${user.email} en alle bijbehorende data zijn verwijderd.` })
      setUser(null)
      setDiagnose(null)
      setShowDelete(false)
      setDeleteConfirm('')
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Verwijderen mislukt' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Gebruikers</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Zoek een gebruiker op e-mailadres en beheer hun abonnementen.
        </p>
      </div>

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

      {/* Search */}
      <form onSubmit={handleSearch} className="mb-8 flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="naam@voorbeeld.nl"
          aria-label="E-mailadres van de gebruiker"
          className="min-h-[44px] flex-1 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2.5 text-sm text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)]"
        />
        <button
          type="submit"
          disabled={searching || !email.trim()}
          className="inline-flex min-h-[44px] items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Search className="h-4 w-4" />
          {searching ? 'Zoeken…' : 'Zoeken'}
        </button>
      </form>

      {/* Empty / not-found state */}
      {searched && !user && (
        <div className="mb-8 border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            Geen gebruiker gevonden met dit e-mailadres.
          </p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">
            Controleer de spelling, of de gebruiker heeft (nog) geen account.
          </p>
        </div>
      )}

      {/* User card */}
      {user && (
        <section className="mb-8 border border-[var(--border-ed)] bg-[var(--paper)] p-5">
          <header className="border-b border-[var(--border-ed)] pb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-medium text-[var(--ink)]">
                {user.name || 'Naamloos'}
              </h3>
              {user.blockedAt && (
                <span className="inline-flex items-center gap-1 bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-800">
                  <Ban className="h-3 w-3" />
                  Geblokkeerd
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-sm text-[var(--ink-3)]">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--ink-4)]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Lid sinds {fmtDate(user.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Laatst actief {fmtDateTime(user.lastSignInAt)}
              </span>
            </div>

            {/* Rol & toegang */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-2)]">
                <span className="text-[var(--ink-3)]">Rol</span>
                <select
                  value={user.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  disabled={busyAction !== null}
                  aria-label="Rol van de gebruiker"
                  className="min-h-[36px] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-sm text-[var(--ink)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-50"
                >
                  <option value="user">Gebruiker</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </label>

              <button
                onClick={handleBlockToggle}
                disabled={busyAction !== null}
                className={`inline-flex min-h-[36px] items-center gap-1.5 px-3 py-1 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40 ${
                  user.blockedAt
                    ? 'border border-[var(--ink)] text-[var(--ink)]'
                    : 'border border-red-300 text-red-700'
                }`}
              >
                {busyAction === 'block' ? (
                  'Bezig…'
                ) : user.blockedAt ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Deblokkeren
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5" />
                    Blokkeren
                  </>
                )}
              </button>
            </div>
          </header>

          <div className="mt-5">
            <SectionLabel>Abonnementen</SectionLabel>
            <div className="space-y-3">
              {ADDON_PLANS.map((plan) => {
                const active = user.subscriptions.includes(plan.tier)
                const busy = busyTier === plan.tier
                return (
                  <div
                    key={plan.tier}
                    className="flex items-center justify-between gap-4 border border-[var(--border-ed)] p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--ink)]">{plan.name}</span>
                        {active && (
                          <span className="inline-flex items-center gap-1 bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-green-800">
                            <Check className="h-3 w-3" />
                            Actief
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">
                        {plan.tagline}
                      </p>
                      <p className="mt-1 font-mono text-xs tabular-nums text-[var(--ink-4)]">
                        {formatPlanPrice(plan.priceEur)}/maand
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggle(plan)}
                      disabled={busy}
                      className={`min-h-[44px] shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-40 ${
                        active
                          ? 'border border-[var(--ink)] text-[var(--ink)]'
                          : 'bg-[var(--ink)] text-white'
                      }`}
                    >
                      {busy ? 'Bezig…' : active ? 'Intrekken' : 'Toekennen'}
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-[var(--ink-4)]">
              Toekennen is een handmatige comp — los van de Polar-checkout. Wijzigingen worden
              gelogd in de toewijzingsgeschiedenis hieronder.
            </p>
          </div>

          {/* Supportview — financiële diagnose (audit-gelogd) */}
          <div className="mt-5">
            <SectionLabel>Supportview</SectionLabel>
            {!diagnose ? (
              <button
                onClick={handleDiagnose}
                disabled={busyDiagnose}
                className="min-h-[40px] border border-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busyDiagnose ? 'Laden…' : 'Financiële diagnose tonen'}
              </button>
            ) : (
              <div className="border border-[var(--border-ed)] p-4">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[var(--ink-3)]">Netto vermogen</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">{eur(diagnose.netWorth)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[var(--ink-3)]">Transacties</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">{diagnose.txCount}</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[var(--ink-3)]">Bezittingen</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {diagnose.assetCount} · {eur(diagnose.assetTotal)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[var(--ink-3)]">Schulden</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {diagnose.debtCount} · {eur(diagnose.debtTotal)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[var(--ink-3)]">Laatste transactie</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink-2)]">{fmtDate(diagnose.lastTxDate)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <dt className="text-[var(--ink-3)]">Rekeningen</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">{diagnose.cashAccounts.length}</dd>
                  </div>
                </dl>
                {diagnose.cashAccounts.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-dotted border-[var(--border-ed)] pt-3 text-xs">
                    {diagnose.cashAccounts.map((a, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span className="text-[var(--ink-2)]">{a.name}</span>
                        <span className="font-mono tabular-nums text-[var(--ink-3)]">{eur(a.value)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-3">
              <a
                href={`/api/admin/user-export?userId=${encodeURIComponent(user.id)}&label=${encodeURIComponent(user.email ?? user.id)}`}
                className="inline-flex min-h-[40px] items-center gap-1.5 border border-[var(--border-ed)] px-4 py-2 text-sm text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)]"
              >
                Exporteer data (AVG)
              </a>
            </div>
            <p className="mt-2 text-xs text-[var(--ink-4)]">
              Elke inzage en export van financiële data wordt gelogd in de audit-trail.
            </p>
          </div>

          {/* Gevarenzone — AVG-verwijdering (onomkeerbaar, audit-gelogd) */}
          <div className="mt-5 border-t border-[var(--border-ed)] pt-4">
            <SectionLabel>Gevarenzone</SectionLabel>
            {!showDelete ? (
              <button
                onClick={() => setShowDelete(true)}
                className="min-h-[40px] border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                Verwijder alle data (AVG)
              </button>
            ) : (
              <div className="border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">
                  Dit verwijdert <strong>{user.email}</strong> en álle bijbehorende data{' '}
                  <strong>onomkeerbaar</strong>. Typ het e-mailadres ter bevestiging.
                </p>
                <input
                  type="email"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={user.email ?? ''}
                  aria-label="Bevestig met het e-mailadres"
                  className="mt-2 w-full border border-red-300 bg-white px-3 py-2 text-sm text-[var(--ink)] focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleDelete}
                    disabled={deleting || deleteConfirm.trim().toLowerCase() !== (user.email ?? '').toLowerCase()}
                    className="min-h-[40px] bg-red-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {deleting ? 'Verwijderen…' : 'Definitief verwijderen'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDelete(false)
                      setDeleteConfirm('')
                    }}
                    className="min-h-[40px] border border-[var(--border-ed)] px-4 py-2 text-sm text-[var(--ink-2)] hover:border-[var(--border-md)]"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Audit log */}
      <section>
        <SectionLabel>Recente toewijzingen</SectionLabel>
        {log.length === 0 ? (
          <p className="py-4 text-sm italic text-[var(--ink-4)]">
            Nog geen abonnementswijzigingen.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left">
                <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Datum
                </th>
                <th className="py-2 pr-4 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Gebruiker
                </th>
                <th className="py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-4)]">
                  Wijziging
                </th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-dotted border-[var(--border-ed)] hover:bg-[var(--subtle)]"
                >
                  <td className="py-2 pr-4 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {fmtDateTime(entry.created_at)}
                  </td>
                  <td className="py-2 pr-4 text-[var(--ink-2)]">{entry.targetName}</td>
                  <td className="py-2 font-mono text-xs tabular-nums text-[var(--ink-3)]">
                    {entry.old_tier} → <span className="text-[var(--ink)]">{entry.new_tier}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
