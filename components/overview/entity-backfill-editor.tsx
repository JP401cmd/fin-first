'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, ArrowDownToLine, Loader2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { WEALTH_GROUP_LABELS, type WealthGroup } from '@/lib/wealth-composition'
import { DEBT_GROUP_LABELS, type DebtGroup } from '@/lib/debt-data'

/**
 * EntityBackfillEditor — per-entiteit historische maandwaardes bijvullen.
 *
 * Derde modus binnen het "Netto vermogen — verloop"-sheet (naast weergave en
 * de totaal-editor). Waar de totaal-editor één totaalbedrag netto vermogen per
 * maand vastlegt, laat deze editor de gebruiker PER bestaande bezitting/schuld
 * de historische maandstand invullen — bedoeld voor (nieuwe) gebruikers die
 * hun historie willen aanvullen.
 *
 * Flow:
 *  1. Lijst — alle actieve bezittingen (per WealthGroup) en schulden (per
 *     DebtGroup), elk met 24 maandvelden (nieuwste boven, voor-ingevuld).
 *  2. Doortrekken (LOCF) — per entiteit de laatst bekende waarde client-side
 *     doortrekken naar alle latere LEGE maanden. Gevulde maanden blijven staan.
 *  3. Dry-run-preview — "Opslaan" vraagt eerst per gewijzigde entiteit een
 *     dry-run op en toont wat er verandert; pas ná bevestiging volgen de echte
 *     POSTs (diff-only: alleen gewijzigde maanden).
 *
 * De editor rendert géén eigen overlay-chrome: de sheet mount 'm en plaatst de
 * primaire acties via `setFooter` in de sticky sheet-footer.
 */

// ── Contract ───────────────────────────────────────────────────

export interface EntityBackfillEditorProps {
  /** Terug naar weergave-modus (annuleren). */
  onClose: () => void
  /** Ná succesvolle save van ≥1 entiteit — sheet doet re-fetch + router.refresh. */
  onSaved: () => void
  /** Registreer de primaire acties in de sticky sheet-footer (null = leeg). */
  setFooter: (node: ReactNode | null) => void
}

type EntityType = 'asset' | 'debt'

/** Backend-contract van GET /api/snapshots/entity-backfill. */
interface BackfillMonth {
  month: string // 'YYYY-MM'
  balance: number | null
}
interface BackfillEntity {
  id: string
  name: string
  group: string
  subtype: string | null
  isActive: boolean
  currentValue: number
  months: BackfillMonth[] // 24, oud→nieuw
}
interface LoadedEntity extends BackfillEntity {
  entityType: EntityType
}

/** Dry-run-rij van POST …?dryRun=true. */
interface PreviewRow {
  month: string
  oldBalance: number | null
  newBalance: number
  action: 'insert' | 'update'
}
interface EntityPreview {
  entityId: string
  entityType: EntityType
  name: string
  entries: { month: string; balance: number }[]
  rows: PreviewRow[]
}

// ── Helpers ────────────────────────────────────────────────────

const MONTH_NAMES = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

function formatMonthLabel(isoMonth: string): string {
  const [year, month] = isoMonth.split('-')
  const idx = Number(month) - 1
  if (!year || idx < 0 || idx > 11 || Number.isNaN(idx)) return isoMonth
  return `${MONTH_NAMES[idx]} ${year}`
}

/**
 * Parse een nl-NL-bedrag-string naar een getal, of null bij leeg/ongeldig.
 * Spiegelt de parse van de totaal-editor (networth-history-sheet). Negatief mag.
 */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  let cleaned = trimmed.replace(/[^0-9,.\-]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const ASSET_GROUP_ORDER: WealthGroup[] = ['spaargeld', 'beleggingen', 'pensioen', 'vastgoed', 'overig']
const DEBT_GROUP_ORDER: DebtGroup[] = ['wonen', 'consumptief', 'overig']

/** Boven dit aantal entiteiten worden de groepen inklapbaar. */
const COLLAPSE_THRESHOLD = 10

type EntityDraft = Record<string, string> // month → raw invoer
type Draft = Record<string, EntityDraft>  // entityId → EntityDraft

/**
 * Diff-only: de gewijzigde maanden voor één entiteit t.o.v. de server-standen.
 * Een maand telt alleen mee als 'ie ingevuld is én afwijkt van de bestaande
 * waarde (nieuwe maand telt altijd, want origineel = null).
 */
function changedEntries(entity: LoadedEntity, entityDraft: EntityDraft): { month: string; balance: number }[] {
  const orig = new Map<string, number | null>(entity.months.map((m) => [m.month, m.balance]))
  const out: { month: string; balance: number }[] = []
  for (const [month, raw] of Object.entries(entityDraft)) {
    const parsed = parseAmount(raw)
    if (parsed == null) continue
    const o = orig.get(month)
    if (o != null && Math.abs(o - parsed) < 0.005) continue
    out.push({ month, balance: parsed })
  }
  return out
}

// ── Component ──────────────────────────────────────────────────

export function EntityBackfillEditor({ onClose, onSaved, setFooter }: EntityBackfillEditorProps) {
  const uid = useId()

  // Lees de parent-callbacks via refs zodat het footer-registratie-effect niet
  // opnieuw hoeft te draaien (en zich niet in een lus vecht) wanneer de parent
  // een nieuwe callback-identiteit doorgeeft na een setFooter-re-render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [entities, setEntities] = useState<LoadedEntity[]>([])
  const [draft, setDraft] = useState<Draft>({})

  const [phase, setPhase] = useState<'list' | 'preview'>('list')
  const [previews, setPreviews] = useState<EntityPreview[]>([])
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Laden: bezittingen + schulden ────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const results = await Promise.all(
          (['asset', 'debt'] as EntityType[]).map(async (t) => {
            const res = await fetch(`/api/snapshots/entity-backfill?entityType=${t}`)
            if (!res.ok) return { t, entities: null as BackfillEntity[] | null }
            const json = (await res.json()) as { entities?: BackfillEntity[] }
            return { t, entities: Array.isArray(json.entities) ? json.entities : [] }
          }),
        )
        if (cancelled) return
        // Alle GETs gefaald → foutstaat. Anders: neem wat er wél is.
        if (results.every((r) => r.entities === null)) {
          setLoadState('error')
          return
        }
        const loaded: LoadedEntity[] = []
        const nextDraft: Draft = {}
        for (const r of results) {
          for (const e of r.entities ?? []) {
            loaded.push({ ...e, entityType: r.t })
            const ed: EntityDraft = {}
            for (const m of e.months) {
              ed[m.month] = m.balance != null ? String(m.balance) : ''
            }
            nextDraft[e.id] = ed
          }
        }
        setEntities(loaded)
        setDraft(nextDraft)
        setLoadState('ready')
      } catch {
        if (!cancelled) setLoadState('error')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Afgeleide: secties per groep + doortrek/diff ─────────────
  const assetSections = useMemo(() => buildSections(entities, 'asset'), [entities])
  const debtSections = useMemo(() => buildSections(entities, 'debt'), [entities])
  const collapsible = entities.length > COLLAPSE_THRESHOLD

  const totalChangedCount = useMemo(() => {
    let n = 0
    for (const e of entities) n += changedEntries(e, draft[e.id] ?? {}).length
    return n
  }, [entities, draft])

  const handleFieldChange = useCallback((entityId: string, month: string, raw: string) => {
    // Sta cijfers, min, komma, punt en spaties toe tijdens het typen.
    if (raw !== '' && !/^[0-9.,\-\s]*$/.test(raw)) return
    setDraft((prev) => ({
      ...prev,
      [entityId]: { ...(prev[entityId] ?? {}), [month]: raw },
    }))
  }, [])

  /**
   * Doortrekken (LOCF) voor één entiteit: loop oud→nieuw en vul elke LEGE maand
   * met de laatst bekende (ingevulde/gemeten) waarde. Reeds gevulde maanden
   * blijven ongemoeid; maanden vóór de eerste waarde blijven leeg (geen
   * back-cast). Puur client-side kopiëren, geen interpolatie.
   */
  const handleDoortrekken = useCallback((entity: LoadedEntity) => {
    setDraft((prev) => {
      const cur = prev[entity.id] ?? {}
      const next: EntityDraft = { ...cur }
      let last: string | null = null
      for (const m of entity.months) {
        const val = next[m.month] ?? ''
        if (parseAmount(val) != null) {
          last = val
        } else if (last != null) {
          next[m.month] = last
        }
      }
      return { ...prev, [entity.id]: next }
    })
  }, [])

  // ── Opslaan: eerst dry-run, dan bevestigen ───────────────────
  const handleStartSave = useCallback(async () => {
    if (dryRunLoading) return
    const jobs = entities
      .map((e) => ({ e, entries: changedEntries(e, draft[e.id] ?? {}) }))
      .filter((j) => j.entries.length > 0)
    if (jobs.length === 0) return

    setDryRunLoading(true)
    setError(null)
    try {
      const next: EntityPreview[] = []
      for (const j of jobs) {
        const res = await fetch('/api/snapshots/entity-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: j.e.entityType,
            entityId: j.e.id,
            entries: j.entries,
            dryRun: true,
          }),
        })
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null
          setError(json?.error ?? 'Voorbeeld kon niet worden opgehaald. Probeer het opnieuw.')
          return
        }
        const json = (await res.json()) as { preview?: PreviewRow[] }
        next.push({
          entityId: j.e.id,
          entityType: j.e.entityType,
          name: j.e.name,
          entries: j.entries,
          rows: Array.isArray(json.preview) ? json.preview : [],
        })
      }
      setPreviews(next)
      setPhase('preview')
    } catch {
      setError('Voorbeeld kon niet worden opgehaald. Controleer je verbinding.')
    } finally {
      setDryRunLoading(false)
    }
  }, [dryRunLoading, entities, draft])

  const handleConfirm = useCallback(async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    const failed: { name: string; error: string }[] = []
    let successCount = 0
    for (const p of previews) {
      try {
        const res = await fetch('/api/snapshots/entity-backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: p.entityType,
            entityId: p.entityId,
            entries: p.entries,
            dryRun: false,
          }),
        })
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null
          failed.push({ name: p.name, error: json?.error ?? 'onbekende fout' })
          continue
        }
        successCount++
      } catch {
        failed.push({ name: p.name, error: 'verbindingsfout' })
      }
    }
    setSaving(false)

    if (failed.length === 0) {
      onSavedRef.current()
      return
    }
    // Deelsucces of volledige mislukking — eerlijk melden, editor blijft open
    // (draftwaardes blijven staan zodat de gebruiker de mislukte kan herkansen).
    const detail = failed.map((f) => `${f.name} (${f.error})`).join('; ')
    setError(
      successCount > 0
        ? `${successCount} bijgewerkt, maar ${failed.length} niet gelukt: ${detail}`
        : `Opslaan is niet gelukt: ${detail}`,
    )
    setPhase('list')
  }, [saving, previews])

  const handleCancelPreview = useCallback(() => {
    setPhase('list')
    setError(null)
  }, [])

  // ── Footer-registratie (sticky sheet-footer) ─────────────────
  const footerNode = useMemo<ReactNode>(() => {
    if (loadState !== 'ready' || entities.length === 0) {
      return (
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          className="inline-flex min-h-11 w-full items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
        >
          Terug
        </button>
      )
    }
    if (phase === 'preview') {
      return (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opslaan…
              </>
            ) : (
              'Bevestigen en opslaan'
            )}
          </button>
          <button
            type="button"
            onClick={handleCancelPreview}
            disabled={saving}
            className="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-60"
          >
            Terug
          </button>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleStartSave}
          disabled={dryRunLoading || totalChangedCount === 0}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-60"
        >
          {dryRunLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Voorbeeld…
            </>
          ) : (
            <>Opslaan{totalChangedCount > 0 ? ` (${totalChangedCount})` : ''}</>
          )}
        </button>
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          disabled={dryRunLoading}
          className="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-60"
        >
          Annuleren
        </button>
      </div>
    )
  }, [
    loadState, entities.length, phase, saving, dryRunLoading, totalChangedCount,
    handleConfirm, handleCancelPreview, handleStartSave,
  ])

  useEffect(() => {
    setFooter(footerNode)
    return () => setFooter(null)
  }, [footerNode, setFooter])

  // ── Render ───────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-[var(--ink-3)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Je bezittingen en schulden worden geladen…
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="space-y-4 px-5 py-6">
        <div
          role="alert"
          className="flex items-start gap-2 border border-negative/30 bg-negative/10 px-3 py-2.5 text-sm text-negative"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Je bezittingen en schulden konden niet worden geladen. Probeer het later opnieuw.</span>
        </div>
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div className="space-y-3 px-5 py-6">
        <h4 className="font-serif text-lg font-semibold text-[var(--ink)]">
          Nog niets om aan te vullen
        </h4>
        <p className="text-sm text-[var(--ink-3)]">
          Je hebt nog geen bezittingen of schulden vastgelegd. Voeg die eerst toe —
          daarna kun je hier per onderdeel je historie aanvullen tot 24 maanden terug.
        </p>
      </div>
    )
  }

  // ── Preview-modus ────────────────────────────────────────────
  if (phase === 'preview') {
    const totalMonths = previews.reduce((s, p) => s + p.rows.length, 0)
    return (
      <div className="space-y-5 px-5 py-5">
        <div>
          <h4 className="font-serif text-lg font-semibold text-[var(--ink)]">
            Controleer je wijzigingen
          </h4>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Je staat op het punt {totalMonths} maand{totalMonths === 1 ? '' : 'en'} bij te werken
            voor {previews.length} onderdeel{previews.length === 1 ? '' : 'en'}. Controleer het
            hieronder en bevestig.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border border-negative/30 bg-negative/10 px-3 py-2.5 text-sm text-negative"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {previews.map((p) => (
            <div key={p.entityId} className="border-t border-[var(--border-ed)] pt-3">
              <p className="font-serif text-sm font-semibold text-[var(--ink)]">
                {p.name}
                <span className="ml-1.5 font-serif italic font-normal text-[var(--ink-3)]">
                  — {p.rows.length} maand{p.rows.length === 1 ? '' : 'en'}
                </span>
              </p>
              <ul className="mt-1.5">
                {p.rows.map((r) => (
                  <li
                    key={r.month}
                    className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--rule-soft)] py-1.5"
                  >
                    <span className="text-sm text-[var(--ink-2)] font-serif">
                      {formatMonthLabel(r.month)}
                    </span>
                    <span className="text-right font-mono tabular-nums text-sm text-[var(--ink)]">
                      {r.action === 'insert' ? (
                        <>
                          {formatCurrency(r.newBalance)}
                          <span className="ml-2 font-serif italic text-[11px] text-[var(--ink-4)]">
                            nieuw
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[var(--ink-4)]">
                            {r.oldBalance != null ? formatCurrency(r.oldBalance) : '—'}
                          </span>
                          <span className="mx-1.5 text-[var(--ink-4)]">→</span>
                          {formatCurrency(r.newBalance)}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Lijst-modus ──────────────────────────────────────────────
  const renderEntity = (entity: LoadedEntity) => {
    const ed = draft[entity.id] ?? {}
    const orig = new Map<string, number | null>(entity.months.map((m) => [m.month, m.balance]))
    // Nieuwste maand boven.
    const monthsDesc = [...entity.months].reverse()
    return (
      <div key={entity.id} className="border-t border-[var(--rule-soft)] pt-3 first:border-t-0 first:pt-0">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-serif text-sm font-semibold text-[var(--ink)]">
              {entity.name}
            </p>
            <p className="font-mono tabular-nums text-[11px] text-[var(--ink-4)]">
              nu: {formatCurrency(entity.currentValue)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDoortrekken(entity)}
            title="Vul de laatst bekende waarde door naar alle latere lege maanden"
            aria-label={`Waarde doortrekken voor ${entity.name}`}
            className="inline-flex shrink-0 items-center gap-1.5 border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Doortrekken
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {monthsDesc.map((m) => {
            const inputId = `${uid}-${entity.id}-${m.month}`
            const raw = ed[m.month] ?? ''
            const parsed = parseAmount(raw)
            const o = orig.get(m.month)
            const isChanged = parsed != null && !(o != null && Math.abs(o - parsed) < 0.005)
            return (
              <div key={m.month} className="flex items-center gap-2">
                <label
                  htmlFor={inputId}
                  className="w-16 shrink-0 font-serif text-xs text-[var(--ink-3)]"
                >
                  {formatMonthLabel(m.month)}
                </label>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">
                    €
                  </span>
                  <input
                    id={inputId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={raw}
                    onChange={(e) => handleFieldChange(entity.id, m.month, e.target.value)}
                    placeholder="—"
                    aria-label={`${entity.name} ${formatMonthLabel(m.month)}`}
                    className={`min-h-9 w-full border bg-[var(--paper)] pl-6 pr-2 py-1.5 text-xs font-mono tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-4)] placeholder:font-serif focus:outline-none focus:ring-1 focus:ring-[var(--module-active-400)] ${
                      isChanged
                        ? 'border-[var(--module-active-400)] ring-1 ring-[var(--module-active-400)]'
                        : 'border-[var(--border-ed)] focus:border-[var(--module-active-400)]'
                    }`}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderSection = (section: Section) => {
    const body = <div className="space-y-4 pt-1">{section.entities.map(renderEntity)}</div>
    if (collapsible) {
      return (
        <details key={section.key} className="group border-b border-[var(--border-ed)] pb-3" open>
          <summary className="flex cursor-pointer list-none items-center justify-between py-2 text-xs uppercase tracking-[0.08em] text-[var(--ink-3)]">
            <span>
              {section.label}
              <span className="ml-1.5 font-mono tabular-nums text-[var(--ink-4)]">
                {section.entities.length}
              </span>
            </span>
          </summary>
          {body}
        </details>
      )
    }
    return (
      <div key={section.key}>
        <h5 className="border-b border-[var(--border-ed)] pb-1 text-xs uppercase tracking-[0.08em] text-[var(--ink-3)]">
          {section.label}
        </h5>
        <div className="pt-2">{body}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 px-5 py-5">
      <div>
        <h4 className="font-serif text-lg font-semibold text-[var(--ink)]">
          Historie per onderdeel
        </h4>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Vul per bezitting of schuld de maandstand in (tot 24 maanden terug). Laat een
          maand leeg als je die niet weet, of trek de laatst bekende waarde door. We laten
          je eerst een voorbeeld zien voordat er iets wordt vastgelegd.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 border border-negative/30 bg-negative/10 px-3 py-2.5 text-sm text-negative"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {assetSections.length > 0 && (
        <section className="space-y-4">
          <p className="font-serif text-sm font-semibold text-[var(--ink-2)]">Bezittingen</p>
          {assetSections.map(renderSection)}
        </section>
      )}

      {debtSections.length > 0 && (
        <section className="space-y-4">
          <p className="font-serif text-sm font-semibold text-[var(--ink-2)]">Schulden</p>
          {debtSections.map(renderSection)}
        </section>
      )}
    </div>
  )
}

// ── Sectie-opbouw ──────────────────────────────────────────────

interface Section {
  key: string
  label: string
  entityType: EntityType
  entities: LoadedEntity[]
}

function buildSections(entities: LoadedEntity[], type: EntityType): Section[] {
  const scoped = entities.filter((e) => e.entityType === type)
  if (scoped.length === 0) return []

  const order: string[] = type === 'asset' ? ASSET_GROUP_ORDER : DEBT_GROUP_ORDER
  const labels: Record<string, string> =
    type === 'asset' ? WEALTH_GROUP_LABELS : DEBT_GROUP_LABELS
  const known = new Set(order)
  const sections: Section[] = []

  for (const g of order) {
    const es = scoped.filter((e) => e.group === g)
    if (es.length > 0) {
      sections.push({ key: `${type}-${g}`, label: labels[g] ?? g, entityType: type, entities: es })
    }
  }
  const rest = scoped.filter((e) => !known.has(e.group))
  if (rest.length > 0) {
    sections.push({
      key: `${type}-other`,
      label: type === 'asset' ? 'Overige bezittingen' : 'Overige schulden',
      entityType: type,
      entities: rest,
    })
  }
  return sections
}
