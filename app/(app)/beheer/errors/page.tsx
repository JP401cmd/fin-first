'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertOctagon, Check, RotateCcw } from 'lucide-react'
import type { ErrorGroup } from '@/lib/error-groups'

/**
 * `/beheer/errors` — de foutenstapel als WERKVOORRAAD in plaats van een muur
 * met regels (ADR 0113).
 *
 * Het scherm toont FOUTSOORTEN, niet losse logregels: honderden regels zijn
 * typisch een handvol unieke problemen. Afvinken gebeurt per soort; komt een
 * afgevinkte soort terug, dan heropent hij zichzelf — dat is een regressie en
 * hoort zichtbaar te zijn.
 *
 * Datapad: alles via `/api/admin/error-groups` (superadmin-gated, RLS eronder).
 * Geen directe supabase-lezing vanuit de browser.
 */

interface Summary {
  totalGroups: number
  openGroups: number
  totalRows: number
  reopenedGroups: number
}

interface GroupsResponse {
  groups: ErrorGroup[]
  summary: Summary
  truncated: boolean
  windowSize: number
}

const dateTimeFmt = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Amsterdam',
})
function fmt(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateTimeFmt.format(d)
}

function meervoud(n: number, enkel: string, meer: string): string {
  return `${n} ${n === 1 ? enkel : meer}`
}

export default function BeheerErrorsPage() {
  const [data, setData] = useState<GroupsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toonAfgehandeld, setToonAfgehandeld] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [melding, setMelding] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/error-groups')
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error || 'Ophalen mislukt')
        return
      }
      setError(null)
      setData(body as GroupsResponse)
    } catch {
      setError('Ophalen mislukt')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function resolve(group: ErrorGroup, notitie: string) {
    setBusy(group.signature)
    try {
      const res = await fetch('/api/admin/error-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: group.signature, note: notitie.trim() || undefined }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error || 'Afvinken mislukt')
        return
      }
      setNoteFor(null)
      setNote('')
      // Timestamp erbij: zonder verandering vuurt aria-live niet opnieuw bij een
      // tweede identieke actie.
      setMelding(`Foutsoort gemarkeerd als afgehandeld. (${new Date().toLocaleTimeString('nl-NL')})`)
      await load()
    } catch {
      // Zonder deze catch is een netwerkfout onzichtbaar EN wordt hij door de
      // globale unhandledrejection-handler als nieuwe rij in error_logs gezet —
      // de foutenpagina zou dan zelf een foutsoort produceren.
      setError('Afvinken mislukt — controleer je verbinding.')
    } finally {
      setBusy(null)
    }
  }

  async function reopen(group: ErrorGroup) {
    setBusy(group.signature)
    try {
      const res = await fetch('/api/admin/error-groups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: group.signature }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(body?.error || 'Heropenen mislukt')
        return
      }
      setMelding(
        `Vinkje weggehaald; de foutsoort staat weer open. (${new Date().toLocaleTimeString('nl-NL')})`,
      )
      await load()
    } catch {
      setError('Heropenen mislukt — controleer je verbinding.')
    } finally {
      setBusy(null)
    }
  }

  const groups = data?.groups ?? []
  const zichtbaar = toonAfgehandeld ? groups : groups.filter((g) => g.open)
  const summary = data?.summary

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Foutmeldingen</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Gegroepeerd per foutsoort — dezelfde fout met andere ids, bedragen of datums telt als
          één. Vink een soort af zodra hij is afgehandeld; komt hij terug, dan staat hij vanzelf
          weer open.
        </p>
      </div>

      <p aria-live="polite" className="sr-only">
        {melding}
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 border border-[var(--negative)] bg-[var(--negative-bg)] px-3 py-2 text-sm text-[var(--negative)]"
        >
          {error}
        </div>
      )}

      {summary && (
        <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-y border-[var(--border-ed)] py-2 font-mono text-xs tabular-nums text-[var(--ink-3)]">
          <span>
            <span className="text-[var(--ink)]">{summary.openGroups}</span> open
          </span>
          <span>
            <span className="text-[var(--ink)]">{summary.totalGroups}</span> soorten
          </span>
          <span>
            <span className="text-[var(--ink)]">{summary.totalRows}</span> regels
          </span>
          {summary.reopenedGroups > 0 && (
            <span className="text-[var(--negative)]">
              {meervoud(summary.reopenedGroups, 'teruggekomen', 'teruggekomen')}
            </span>
          )}
          {data?.truncated && (
            <span className="text-[var(--ink-meta)]">
              venster afgekapt op {data.windowSize} regels
            </span>
          )}
        </div>
      )}

      <div className="mb-4">
        <button
          type="button"
          onClick={() => setToonAfgehandeld((v) => !v)}
          aria-pressed={toonAfgehandeld}
          className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)] hover:text-[var(--ink-2)]"
        >
          {toonAfgehandeld ? 'Verberg afgehandelde soorten' : 'Toon ook afgehandelde soorten'}
        </button>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse bg-[var(--subtle)]" />
      ) : zichtbaar.length === 0 ? (
        <div className="border border-dashed border-[var(--border-ed)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--ink-3)]">
            {groups.length === 0
              ? 'Geen foutmeldingen geregistreerd.'
              : 'Alles afgehandeld — geen open foutsoorten.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zichtbaar.map((g) => {
            const teruggekomen = g.resolution !== null && g.open
            return (
              <article
                key={g.signature}
                className={`border p-3 ${
                  g.open
                    ? 'border-[var(--border-ed)] bg-[var(--paper)]'
                    : 'border-[var(--border-ed)] bg-[var(--subtle)]/40'
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium text-[var(--ink)]">{g.sampleMessage}</h3>
                  <span className="font-mono text-xs tabular-nums text-[var(--ink-meta)]">
                    {meervoud(g.count, 'keer', 'keer')} · laatst {fmt(g.lastSeenAt)}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] text-[var(--ink-meta)]">
                  {g.context && <span>{g.context}</span>}
                  {g.sampleUrl && <span>· {g.sampleUrl}</span>}
                  {g.sampleLevel !== 'error' && <span>· {g.sampleLevel}</span>}
                  <span>· sinds {fmt(g.firstSeenAt)}</span>
                </div>

                {g.resolution &&
                  (teruggekomen ? (
                    <p className="mt-2 text-xs text-[var(--negative)]">
                      Teruggekomen:{' '}
                      {meervoud(g.countSinceResolved, 'nieuw voorval', 'nieuwe voorvallen')} sinds het
                      afvinken op {fmt(g.resolution.resolvedAt)} (toen {g.resolution.resolvedCount}
                      &times;, nu {g.count}&times;).
                      {g.resolution.note ? ` Notitie toen: ${g.resolution.note}` : ''}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--ink-3)]">
                      Afgehandeld op {fmt(g.resolution.resolvedAt)}
                      {g.resolution.note ? ` — ${g.resolution.note}` : ''}
                    </p>
                  ))}

                {g.sampleStack && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)] hover:text-[var(--ink-3)]">
                      Stacktrace (nieuwste voorval)
                    </summary>
                    <pre className="mt-2 overflow-x-auto bg-[var(--subtle)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-2)]">
                      {g.sampleStack}
                    </pre>
                  </details>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-4">
                  {g.open ? (
                    noteFor === g.signature ? (
                      <form
                        className="flex w-full flex-wrap items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void resolve(g, note)
                        }}
                      >
                        <label htmlFor={`note-${g.signature}`} className="sr-only">
                          Notitie bij het afvinken
                        </label>
                        <input
                          id={`note-${g.signature}`}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          maxLength={500}
                          autoFocus
                          placeholder="Notitie (optioneel) — bv. kaartnummer of oorzaak"
                          className="min-w-0 flex-1 border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1 text-xs text-[var(--ink)] placeholder-[var(--ink-meta)] focus:border-[var(--ink-3)] focus:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={busy === g.signature}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-2)] hover:text-[var(--ink)] disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" />
                          Afvinken
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNoteFor(null)
                            setNote('')
                          }}
                          className="text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)] hover:text-[var(--ink-2)]"
                        >
                          Annuleren
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setNoteFor(g.signature)
                          setNote('')
                        }}
                        disabled={busy === g.signature}
                        className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)] hover:text-[var(--ink-2)] disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        Markeer als afgehandeld
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => void reopen(g)}
                      disabled={busy === g.signature}
                      className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.06em] text-[var(--ink-meta)] hover:text-[var(--ink-2)] disabled:opacity-50"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Vinkje weghalen
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
