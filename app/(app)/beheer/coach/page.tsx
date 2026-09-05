'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronRight, RotateCcw, Clock, Info } from 'lucide-react'
import {
  COACH_LAYER_META,
  DEFAULT_COACH_TIMING,
  DEFAULT_COACH_HEADER,
  type CoachLayer,
  type CoachAdminRow,
} from '@/lib/coach-suggestions'

type Timing = { delayMs: number; autoDismissMs: number }

type Overrides = Record<
  string,
  { message?: string; cta?: string; ctaHref?: string; enabled?: boolean }
>

const LAYER_ORDER: CoachLayer[] = ['deferred', 'guide', 'data_gap', 'path', 'default']

const LAYER_ACCENT: Record<CoachLayer, { dot: string; text: string }> = {
  deferred: { dot: 'bg-wil-500', text: 'text-wil-700' },
  // De gids woont bij Fin, dus binnen dezelfde module-familie als 'deferred' —
  // maar een stop donkerder, zodat de twee lagen uit elkaar te houden zijn.
  guide: { dot: 'bg-wil-700', text: 'text-wil-800' },
  data_gap: { dot: 'bg-kern-500', text: 'text-kern-700' },
  path: { dot: 'bg-horizon-500', text: 'text-horizon-700' },
  default: { dot: 'bg-[var(--ink-3)]', text: 'text-[var(--ink-2)]' },
}

export default function BeheerCoachPage() {
  const [rows, setRows] = useState<CoachAdminRow[]>([])
  const [timing, setTiming] = useState<Timing>(DEFAULT_COACH_TIMING)
  const [headerLabel, setHeaderLabel] = useState(DEFAULT_COACH_HEADER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<CoachLayer>>(new Set())

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/coach')
      if (!res.ok) {
        setMessage({ type: 'error', text: 'Kon coach-config niet laden (geen toegang?)' })
        return
      }
      const data = await res.json()
      setRows(data.rules ?? [])
      setTiming(data.timing ?? DEFAULT_COACH_TIMING)
      setHeaderLabel(data.headerLabel ?? DEFAULT_COACH_HEADER)
    } catch {
      setMessage({ type: 'error', text: 'Kon coach-config niet laden' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfig()
  }, [fetchConfig])

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [message])

  function updateRow(key: string, field: 'message' | 'cta' | 'ctaHref' | 'enabled', value: string | boolean) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value, hasOverride: true } : r)),
    )
    setDirty(true)
  }

  function resetRow(key: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              message: r.defaultMessage,
              cta: r.defaultCta,
              ctaHref: r.defaultCtaHref,
              enabled: true,
              hasOverride: false,
            }
          : r,
      ),
    )
    setDirty(true)
  }

  function updateTiming(field: keyof Timing, seconds: number) {
    const ms = Math.round(seconds * 1000)
    if (!Number.isFinite(ms)) return
    setTiming((prev) => ({ ...prev, [field]: ms }))
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const overrides: Overrides = {}
      for (const r of rows) {
        const entry: Overrides[string] = {}
        if (r.message !== r.defaultMessage) entry.message = r.message
        if (r.cta !== r.defaultCta) entry.cta = r.cta
        if (r.ctaHref !== r.defaultCtaHref) entry.ctaHref = r.ctaHref
        if (!r.enabled) entry.enabled = false
        if (Object.keys(entry).length > 0) overrides[r.key] = entry
      }

      const res = await fetch('/api/admin/coach', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: overrides, timing, headerLabel }),
      })

      if (res.ok) {
        setDirty(false)
        setMessage({ type: 'success', text: 'Coach-instellingen opgeslagen' })
        fetchConfig()
      } else {
        setMessage({ type: 'error', text: 'Opslaan mislukt' })
      }
    } finally {
      setSaving(false)
    }
  }

  function toggleCollapse(layer: CoachLayer) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-2)]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-inter)] text-lg font-bold text-[var(--ink)]">
          Coach-meldingen beheren
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer wanneer en wat de coach-bubble ("{headerLabel}") toont. Per regel zie je de
          voorwaarde (wanneer hij verschijnt) en pas je tekst, knop en zichtbaarheid aan.
        </p>
      </div>

      {/* Uitleg-blok: prioriteit + werking */}
      <div className="flex gap-3 rounded-xl border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-5 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
        <div className="space-y-1.5 text-sm text-[var(--ink-2)]">
          <p>
            De coach toont <strong>één</strong> tip: de eerste niet-weggeklikte, ingeschakelde regel
            in deze volgorde:
          </p>
          <p className="text-[var(--ink-3)]">
            1. Uitgestelde velden &rarr; 2. Data-gaten (bank &rarr; vermogen &rarr; budget &rarr;
            doelen) &rarr; 3. Pad-gebaseerd (specifiek pad wint van breed) &rarr; 4. Standaard.
          </p>
          <p className="text-[var(--ink-3)]">
            Weggeklikte tips komen niet terug (per-suggestie onthouden in de browser). Een
            uitgeschakelde regel wordt volledig overgeslagen.
          </p>
        </div>
      </div>

      {/* Globale instellingen */}
      <div className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--ink-3)]" />
          <h3 className="text-sm font-semibold text-[var(--ink)]">Globale instellingen</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-[var(--ink-2)]">Header-label</span>
            <input
              type="text"
              value={headerLabel}
              maxLength={60}
              onChange={(e) => {
                setHeaderLabel(e.target.value)
                setDirty(true)
              }}
              className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-[var(--ink-4)]">Titel boven elke tip</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--ink-2)]">Vertraging vóór tonen (sec)</span>
            <input
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={timing.delayMs / 1000}
              onChange={(e) => updateTiming('delayMs', parseFloat(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-[var(--ink-4)]">0–30s, standaard 1,5s</span>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[var(--ink-2)]">Auto-sluiten na uittypen (sec)</span>
            <input
              type="number"
              min={3}
              max={600}
              step={1}
              value={Math.round(timing.autoDismissMs / 1000)}
              onChange={(e) => updateTiming('autoDismissMs', parseFloat(e.target.value))}
              className="mt-1 w-full rounded-lg border border-[var(--border-md)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-[var(--ink-3)] focus:outline-none"
            />
            <span className="mt-1 block text-[10px] text-[var(--ink-4)]">3–600s, standaard 8s — telt pas vanaf het moment dat de tekst volledig is uitgetypt</span>
          </label>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-700'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {dirty && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">Onopgeslagen wijzigingen</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                fetchConfig()
                setDirty(false)
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)]"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--ink)] px-4 py-1.5 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-50"
            >
              {saving ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {LAYER_ORDER.map((layer) => {
        const layerRows = rows.filter((r) => r.layer === layer)
        if (layerRows.length === 0) return null
        const meta = COACH_LAYER_META[layer]
        const accent = LAYER_ACCENT[layer]
        const isCollapsed = collapsed.has(layer)
        const enabledCount = layerRows.filter((r) => r.enabled).length

        return (
          <div
            key={layer}
            className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]"
          >
            <button
              type="button"
              onClick={() => toggleCollapse(layer)}
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--subtle)]/50"
            >
              <div className="flex items-center gap-3">
                <ChevronRight
                  className={`h-4 w-4 text-[var(--ink-3)] transition-transform duration-200 ${
                    isCollapsed ? '' : 'rotate-90'
                  }`}
                />
                <span className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-2 text-sm font-semibold ${accent.text}`}>
                    <span className={`h-2 w-2 rounded-full ${accent.dot}`} />
                    {meta.order}. {meta.label}
                  </span>
                </span>
              </div>
              <span className="text-xs text-[var(--ink-4)]">
                {enabledCount}/{layerRows.length} actief
              </span>
            </button>

            {!isCollapsed && (
              <div className="border-t border-[var(--border-ed)]">
                <p className="px-5 pt-3 text-xs text-[var(--ink-3)]">{meta.description}</p>
                <div className="mt-2 divide-y divide-[var(--border-ed)] border-t border-[var(--border-ed)]">
                  {layerRows.map((row) => (
                    <div
                      key={row.key}
                      className={`px-5 py-4 ${row.hasOverride ? 'border-l-2 border-l-amber-400' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                          {/* Voorwaarde (read-only) */}
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 rounded-md bg-[var(--subtle)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-4)]">
                              {row.key}
                            </span>
                            <p className="text-xs leading-relaxed text-[var(--ink-3)]">
                              <span className="font-medium text-[var(--ink-2)]">Wanneer:</span>{' '}
                              {row.condition}
                            </p>
                          </div>

                          {/* Tekstvelden — alleen voor regels die hun tekst uit
                              DEZE catalogus halen. De gids-laag leent 'm uit de
                              gidsconfig, dus daar zou een invoerveld een waarde
                              bewerken die nooit gelezen wordt (row.textEditable). */}
                          {row.textEditable ? (
                            <>
                              {/* Bericht */}
                              <div>
                                <span className="mb-0.5 block px-2 text-[10px] font-medium text-[var(--ink-4)]">
                                  Bericht
                                </span>
                                <textarea
                                  value={row.message}
                                  rows={2}
                                  onChange={(e) => updateRow(row.key, 'message', e.target.value)}
                                  className="w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--ink)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
                                />
                              </div>

                              {/* CTA-label + link */}
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <span className="mb-0.5 block px-2 text-[10px] font-medium text-[var(--ink-4)]">
                                    Knop-tekst
                                  </span>
                                  <input
                                    type="text"
                                    value={row.cta}
                                    onChange={(e) => updateRow(row.key, 'cta', e.target.value)}
                                    className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <span className="mb-0.5 block px-2 text-[10px] font-medium text-[var(--ink-4)]">
                                    Knop-link (leeg = alleen sluiten)
                                  </span>
                                  <input
                                    type="text"
                                    value={row.ctaHref}
                                    placeholder="/core/budgets"
                                    onChange={(e) => updateRow(row.key, 'ctaHref', e.target.value)}
                                    className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-[var(--ink-2)] transition-colors hover:border-[var(--border-md)] focus:border-[var(--border-md)] focus:bg-[var(--paper)] focus:outline-none"
                                  />
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="px-2 text-xs italic leading-relaxed text-[var(--ink-4)]">
                              Tekst en bestemming komen uit de welkomstgids zelf — pas ze aan op{' '}
                              <a href="/beheer/welkom" className="underline underline-offset-2">
                                /beheer/welkom
                              </a>
                              . Hier kun je de laag alleen aan- of uitzetten.
                            </p>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <span className="rounded-md bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] text-[var(--ink-4)]">
                            #{row.order}
                          </span>
                          <div className="flex items-center gap-2">
                            {row.hasOverride && (
                              <button
                                type="button"
                                onClick={() => resetRow(row.key)}
                                className="rounded-lg p-1.5 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
                                title="Herstel naar standaard"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => updateRow(row.key, 'enabled', !row.enabled)}
                              title={row.enabled ? 'Regel actief — klik om uit te zetten' : 'Regel uit — klik om aan te zetten'}
                              className={`relative h-6 w-11 rounded-full transition-colors ${
                                row.enabled ? 'bg-kern-500' : 'bg-[var(--border-md)]'
                              }`}
                            >
                              <span
                                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                  row.enabled ? 'translate-x-5' : ''
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
