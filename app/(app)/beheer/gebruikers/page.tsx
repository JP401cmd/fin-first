'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Search, Check, AlertCircle, Clock, CalendarDays, Ban, RotateCcw } from 'lucide-react'
import { ADDON_PLANS, formatPlanPrice, type AddonPlan } from '@/lib/subscription-catalog'
import type { GebruikersActiviteit } from '@/lib/beheer/gebruik'

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

const monthFmt = new Intl.DateTimeFormat('nl-NL', { month: 'short', year: '2-digit' })
function fmtMonth(yyyyMm: string): string {
  const d = new Date(`${yyyyMm}-01T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? yyyyMm : monthFmt.format(d)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

/** Kalenderdag (YYYY-MM-DD) zonder tijdzoneverschuiving: parse als middag UTC. */
function fmtDay(dag: string | null): string {
  if (!dag) return '—'
  const d = new Date(`${dag.slice(0, 10)}T12:00:00Z`)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

/** Telling of "?" als die niet op te halen was. */
function tel(n: number | null): string {
  return n === null ? '?' : String(n)
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
  const [activiteit, setActiviteit] = useState<GebruikersActiviteit | null>(null)
  const [busyActiviteit, setBusyActiviteit] = useState(false)
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
      setActiviteit(null)
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
    const finBlock = !user.blockedAt
    if (
      finBlock &&
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
        body: JSON.stringify({ userId: user.id, blocked: finBlock }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Blokkeren mislukt')
      setUser({ ...user, blockedAt: data.blockedAt ?? (finBlock ? new Date().toISOString() : null) })
      setStatus({
        type: 'success',
        message: finBlock
          ? `${user.name || user.email} geblokkeerd`
          : `${user.name || user.email} gedeblokkeerd`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Blokkeren mislukt' })
    } finally {
      setBusyAction(null)
    }
  }

  async function handleActiviteit() {
    if (!user) return
    setBusyActiviteit(true)
    setStatus(null)
    try {
      const res = await fetch(
        `/api/admin/users/activity?userId=${encodeURIComponent(user.id)}`,
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Gebruik laden mislukt')
      setActiviteit(data as GebruikersActiviteit)
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Gebruik laden mislukt' })
    } finally {
      setBusyActiviteit(false)
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
      setActiviteit(null)
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
          Zoek een gebruiker op e-mailadres, beheer abonnementen en zie hoe de app gebruikt wordt.
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

          {/* Gebruik — activiteit zonder inhoud (ADR 0146) */}
          <div className="mt-5">
            <SectionLabel>Gebruik</SectionLabel>
            {!activiteit ? (
              <button
                onClick={handleActiviteit}
                disabled={busyActiviteit}
                className="min-h-[40px] border border-[var(--ink)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busyActiviteit ? 'Laden…' : 'Gebruik tonen'}
              </button>
            ) : (
              <div className="border border-[var(--border-ed)] p-4">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Actieve dagen (30 d)</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {activiteit.actieveDagen30 ?? 'nog niet gemeten'}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Laatst actief</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink-2)]">{fmtDay(activiteit.laatsteActieveDag)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">AI-aanroepen (30 d)</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">{tel(activiteit.aiAanroepen30)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Meldingen gestuurd</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">{tel(activiteit.meldingen)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Bezittingen · schulden</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {tel(activiteit.aantallen.bezittingen)} · {tel(activiteit.aantallen.schulden)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Transacties</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">{tel(activiteit.aantallen.transacties)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Laatste transactie toegevoegd</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink-2)]">
                      {fmtDateTime(activiteit.aantallen.laatsteTransactieToegevoegd)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--ink-3)]">Bankkoppelingen</dt>
                    <dd className="font-mono tabular-nums text-[var(--ink)]">
                      {tel(activiteit.bank.koppelingen)}
                      {activiteit.bank.laatsteSync &&
                        ` · ${fmtDateTime(activiteit.bank.laatsteSync)} (${activiteit.bank.laatsteSyncStatus ?? '—'})`}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 space-y-1.5 border-t border-dotted border-[var(--border-ed)] pt-3 text-xs text-[var(--ink-3)]">
                  <p>
                    <span className="text-[var(--ink-4)]">AI per functie: </span>
                    {activiteit.aiPerFunctie.length === 0
                      ? '—'
                      : activiteit.aiPerFunctie.map((f) => `${f.feature} (${f.aanroepen})`).join(', ')}
                    {activiteit.aiPerFunctieSteekproef && (
                      <span className="text-[var(--ink-4)]"> — over de nieuwste 1000 aanroepen</span>
                    )}
                  </p>
                  <p>
                    <span className="text-[var(--ink-4)]">Apps ingericht: </span>
                    {activiteit.appsIngericht.length === 0 ? '—' : activiteit.appsIngericht.join(', ')}
                    <span className="text-[var(--ink-4)]"> · gidsstappen bekeken: </span>
                    {activiteit.gidsStappenBekeken}
                  </p>
                  <p>
                    <span className="text-[var(--ink-4)]">Check-ins: </span>
                    {activiteit.checkinMaanden.length === 0
                      ? '—'
                      : activiteit.checkinMaanden.slice(0, 12).map(fmtMonth).join(', ')}
                  </p>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-[var(--ink-4)]">
              Alleen gebruik, nooit inhoud: geen bedragen, rekeningen of omschrijvingen. Een
              inzage- of exportverzoek doet de gebruiker zelf via <span className="font-mono">/mijn/geavanceerd</span>.
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
