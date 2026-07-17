'use client'

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, Check, PencilLine, ListTree } from 'lucide-react'
import {
  formatMaskedCurrency,
  calculateFreedomTime,
  formatFreedomTimeString,
} from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import {
  NetworthGroupsChart,
  type NetworthGroupsChartProps,
} from './networth-groups-chart'
import { EntityBackfillEditor } from './entity-backfill-editor'

/**
 * NetWorthHistorySheet — popup met het netto-vermogen-verloop.
 *
 * Opent vanuit de MiniNetWorthChart wanneer de gebruiker op het
 * verleden-segment (links van "Vandaag") klikt. Toont:
 *  1. Hoofdbedrag (huidig netto vermogen) + delta over de periode — inclusief
 *     de vrijheidstijd-equivalent van die delta wanneer een dagtarief bekend is.
 *  2. Weergave-schakelaar Totaal / Groepen: "Totaal" toont de vertrouwde
 *     verloop-lijn; "Groepen" toont de butterfly-grafiek per bezittings-/
 *     schuldgroep (NetworthGroupsChart). De totaallijn + kassabon renderen
 *     direct zonder op de (niet-blokkerende) groep-fetch te wachten.
 *  3. Kassabon-stijl maandtabel: maand · stand · maand-op-maand-delta, met
 *     herkomstlabels (geschat / handmatig).
 *
 * Historie tot 24 maanden terug: bij openen haalt het modal de
 * handmatig ingevoerde / gesnapshotte historie op via
 * GET /api/snapshots/history?months=24 en gebruikt die — wanneer er
 * echte data is — i.p.v. de (max 12-maands) `history`-prop. De prop
 * blijft de graceful fallback zolang de fetch nog loopt of faalt.
 *
 * Bewerk-modi: (a) de totaal-editor legt per maand één totaalbedrag netto
 * vermogen vast (tot 24 maanden terug); (b) de per-entiteit-editor
 * (EntityBackfillEditor) vult de historische maandstand per bezitting/schuld
 * aan. Opslaan POST't alleen de gewijzigde maanden; een ingevoerde maand wordt
 * de gezaghebbende stand (en daarmee geen schatting meer).
 *
 * Geschatte punten (back-cast op spaarritme, geen echte waardering)
 * worden gemarkeerd met het label "geschat"; handmatig vastgelegde
 * maandstanden met "handmatig", zodat de gebruiker werkelijkheid van
 * benadering kan onderscheiden.
 */

export interface HistoryPoint {
  /** ISO-maand (YYYY-MM) of ISO-datum van de waardering. */
  month: string
  value: number
  /** True wanneer dit punt een back-cast schatting is (geen snapshot). */
  estimated?: boolean
}

/** Backend-contract van GET/POST /api/snapshots/history. */
interface ServerEntry {
  month: string
  netWorth: number
}

/**
 * Backend-contract van GET /api/snapshots/group-history. Alle velden optioneel
 * getypeerd: de weergave beslist puur op `hasData` + de aanwezigheid van de
 * reeksen of de "Groepen"-modus beschikbaar is (een fetch-mock die deze route
 * niet kent levert een ander object — dat moet gracieus disabled worden i.p.v.
 * te crashen).
 */
interface GroupHistoryResponse {
  months?: string[]
  assetGroups?: NetworthGroupsChartProps['assetGroups']
  debtGroups?: NetworthGroupsChartProps['debtGroups']
  rest?: (number | null)[]
  net?: (number | null)[]
  hasData?: boolean
  provenance?: NetworthGroupsChartProps['provenance']
}

const MAX_MONTHS = 24

const MONTH_NAMES = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

function formatMonthLabel(isoMonth: string): string {
  // Accepteert zowel 'YYYY-MM' als 'YYYY-MM-DD'.
  const [year, month] = isoMonth.split('-')
  const idx = Number(month) - 1
  if (!year || idx < 0 || idx > 11 || Number.isNaN(idx)) return isoMonth
  return `${MONTH_NAMES[idx]} ${year}`
}

/** 'YYYY-MM' van `monthsBack` kalendermaanden terug (0 = huidige maand). */
function isoMonthBack(monthsBack: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - monthsBack)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Parse een nl-NL-bedrag-string naar een getal, of null bij leeg/ongeldig.
 * Accepteert duizend-punten en zowel komma als punt als decimaalteken.
 * Negatief mag (netto vermogen kan negatief zijn).
 */
function parseAmount(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  // Strip alles behalve cijfers, min, komma en punt.
  let cleaned = trimmed.replace(/[^0-9,.\-]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  // nl-NL: punt = duizendtal, komma = decimaal. Heeft de string een komma,
  // dan punten weghalen (duizendtallen) en komma → punt. Anders punt als
  // decimaal behouden (gebruikers typen vaak "1234.56").
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  }
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function NetWorthHistorySheet({
  open,
  onClose,
  history,
  currentNetWorth,
  dailyExpense,
}: {
  open: boolean
  onClose: () => void
  /** Chronologisch oplopend (oudste eerst), inclusief geschatte punten. */
  history: HistoryPoint[]
  currentNetWorth: number
  /**
   * Canoniek dagtarief (€/dag) uit de dashboard-bundel — voedt de
   * vrijheidstijd-equivalent van de periode-delta. Afwezig / 0 / niet-eindig →
   * alleen het €-bedrag (geen vrijheidstijd-regel). Nooit lokaal herrekenen.
   */
  dailyExpense?: number
}) {
  const { masked } = useMaskedAmounts()
  const router = useRouter()
  // Unieke gradient-id per instantie (SVG-defs zijn document-globaal).
  const gradientId = useId()

  // ── Server-historie (24 mnd) ───────────────────────────────────
  // Bij openen GET'ten we de echte/handmatige historie. Zolang die er niet
  // is (loopt nog / faalt), valt de weergave terug op de `history`-prop.
  const [serverEntries, setServerEntries] = useState<ServerEntry[] | null>(null)
  const [loadError, setLoadError] = useState(false)

  // ── Groep-historie (24 mnd) — niet-blokkerend ──────────────────
  // Tweede, onafhankelijke fetch voor de butterfly-grafiek per groep. De
  // totaalweergave wacht hier NOOIT op (harde NFR); "Groepen" is disabled tot
  // de fetch klaar is én `hasData` waar is.
  const [groupData, setGroupData] = useState<GroupHistoryResponse | null>(null)
  const [groupLoading, setGroupLoading] = useState(false)
  const [groupError, setGroupError] = useState(false)
  const [viewMode, setViewMode] = useState<'total' | 'groups'>('total')

  // Bewerk-modus (totaal-editor) + invoervelden (key = 'YYYY-MM').
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Bewerk-modus (per-entiteit): derde sheet-staat. De EntityBackfillEditor
  // regelt zelf zijn data/flow en levert zijn footer-knoppen via setFooter.
  const [entityEditing, setEntityEditing] = useState(false)
  const [entityFooter, setEntityFooter] = useState<ReactNode | null>(null)

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/snapshots/history?months=24')
      if (!res.ok) {
        setLoadError(true)
        return
      }
      const json = (await res.json()) as { entries?: ServerEntry[] }
      const entries = Array.isArray(json.entries) ? json.entries : []
      setServerEntries(entries)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  const fetchGroupHistory = useCallback(async () => {
    setGroupLoading(true)
    try {
      const res = await fetch('/api/snapshots/group-history?months=24')
      if (!res.ok) {
        setGroupError(true)
        setGroupData(null)
        return
      }
      const json = (await res.json()) as GroupHistoryResponse
      setGroupData(json)
      setGroupError(false)
    } catch {
      setGroupError(true)
      setGroupData(null)
    } finally {
      setGroupLoading(false)
    }
  }, [])

  // Fetch bij openen; reset alle sub-modi/state wanneer het modal sluit zodat
  // een heropening schoon begint. De twee fetches zijn onafhankelijk — de
  // totaalweergave rendert zonder op de groep-fetch te wachten.
  useEffect(() => {
    if (open) {
      void fetchHistory()
      void fetchGroupHistory()
    } else {
      setEditing(false)
      setSaveError(null)
      setSaved(false)
      setEntityEditing(false)
      setEntityFooter(null)
      setViewMode('total')
      setGroupData(null)
      setGroupError(false)
      setGroupLoading(false)
    }
  }, [open, fetchHistory, fetchGroupHistory])

  // ── Reeks voor grafiek + tabel ─────────────────────────────────
  // Voorkeur: server-historie (echte/handmatige waardes, max 24 mnd). Die
  // bevat alleen ECHTE standen — geen schattingen. Fallback: de `history`-prop
  // (max 12 mnd, kan geschatte punten bevatten). De live "Vandaag"-stand
  // (`currentNetWorth`) sluit de reeks altijd af.
  const historyForDisplay: HistoryPoint[] = useMemo(() => {
    if (serverEntries && serverEntries.length > 0) {
      return serverEntries.map((e) => ({ month: e.month, value: e.netWorth }))
    }
    return history
  }, [serverEntries, history])

  const series: HistoryPoint[] = [
    ...historyForDisplay,
    { month: 'nu', value: currentNetWorth },
  ]

  const first = series[0]
  const periodDelta = first ? currentNetWorth - first.value : 0
  const hasEstimates = historyForDisplay.some((h) => h.estimated)

  // Vrijheidstijd-equivalent van de periode-delta (geen bedrag → niet gemaskt).
  // Afwezig/0/niet-eindig dagtarief → null: exact het huidige €-alleen-gedrag.
  const freedomDelta = useMemo(() => {
    if (dailyExpense == null || !Number.isFinite(dailyExpense) || dailyExpense <= 0) {
      return null
    }
    if (periodDelta === 0) return null
    const breakdown = calculateFreedomTime(periodDelta, dailyExpense)
    if (breakdown.totalDays <= 0) return null
    return formatFreedomTimeString(breakdown, 'long')
  }, [dailyExpense, periodDelta])

  // ── Handmatige maandstanden (herkomst) ─────────────────────────
  // De net-provenance uit de group-history-respons markeert per (as-uitgelijnde)
  // maand of de stand handmatig is vastgelegd. Zolang die respons er niet is:
  // lege set → geen 'handmatig'-labels (huidig gedrag, geen regressie).
  const manualMonths = useMemo(() => {
    const s = new Set<string>()
    const months = groupData?.months
    const netProv = groupData?.provenance?.net
    if (Array.isArray(months) && Array.isArray(netProv)) {
      months.forEach((m, i) => {
        if (netProv[i] === 'manual') s.add(m)
      })
    }
    return s
  }, [groupData])

  // "Groepen"-modus alleen beschikbaar als de fetch klaar is, geslaagd is en de
  // reeksen daadwerkelijk aanwezig zijn (guard tegen een vreemd fetch-antwoord).
  const groupsAvailable =
    !groupLoading &&
    !groupError &&
    groupData?.hasData === true &&
    Array.isArray(groupData.months) &&
    groupData.months.length > 0 &&
    !!groupData.assetGroups &&
    !!groupData.debtGroups &&
    Array.isArray(groupData.rest) &&
    Array.isArray(groupData.net) &&
    !!groupData.provenance

  // Uitleg-tekst tonen wanneer de groep-modus onbeschikbaar is doordat er nog
  // géén per-groep-historie is (hasData === false). Fetch-fout/laden = stil.
  const showGroupsEmptyHint = !groupLoading && !groupError && groupData?.hasData === false

  // ── Grafiek-geometrie (Totaal-modus) ───────────────────────────
  const W = 560
  const H = 180
  const PAD_X = 8
  const PAD_Y = 16
  const chartW = W - PAD_X * 2
  const chartH = H - PAD_Y * 2

  const values = series.map((p) => p.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  // Verticale marge zodat de lijn niet tegen de randen plakt; bij een
  // vlakke reeks (alle waardes gelijk) een kunstmatige spanwijdte.
  const span = maxVal - minVal || Math.max(Math.abs(maxVal), 1) * 0.1
  const yMin = minVal - span * 0.12
  const yMax = maxVal + span * 0.12

  const toX = (i: number) =>
    PAD_X + (series.length <= 1 ? 0 : (i / (series.length - 1)) * chartW)
  const toY = (v: number) =>
    PAD_Y + chartH - ((v - yMin) / (yMax - yMin)) * chartH

  const points = series.map((p, i) => ({ x: toX(i), y: toY(p.value), estimated: p.estimated }))

  // Splits in geschat-prefix en echt-suffix. Het grenspunt hoort bij
  // beide paden zodat de lijn doorloopt zonder gat.
  const firstRealIdx = points.findIndex((p) => !p.estimated)
  const estimatedPts = firstRealIdx > 0 ? points.slice(0, firstRealIdx + 1) : []
  const realPts = firstRealIdx >= 0 ? points.slice(firstRealIdx) : []

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.length >= 2
      ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      : ''

  const estimatedPath = toPath(estimatedPts)
  const realPath = toPath(realPts)
  const lastPt = points[points.length - 1]

  // Schaduw-vlak onder de volledige verlooplijn: zachte verticale
  // gradient naar de vloer — geeft het grafiekgebied diepte.
  const floorY = (PAD_Y + chartH).toFixed(1)
  const areaPath =
    points.length >= 2
      ? `${toPath(points)} L${points[points.length - 1]!.x.toFixed(1)},${floorY} L${points[0]!.x.toFixed(1)},${floorY} Z`
      : ''

  // ── Bewerk-modus: rijen voor de laatste 24 maanden ─────────────
  // Nieuwste maand bovenaan; voor-ingevuld met bestaande server-waardes.
  const editMonths = useMemo(() => {
    const known = new Map<string, number>()
    for (const e of serverEntries ?? []) {
      known.set(e.month.slice(0, 7), e.netWorth)
    }
    const rows: { month: string; existing: number | null }[] = []
    for (let mb = 1; mb <= MAX_MONTHS; mb++) {
      const m = isoMonthBack(mb)
      rows.push({ month: m, existing: known.has(m) ? known.get(m)! : null })
    }
    return rows
  }, [serverEntries])

  const openEditor = useCallback(() => {
    const next: Record<string, string> = {}
    for (const row of editMonths) {
      next[row.month] = row.existing != null ? String(row.existing) : ''
    }
    setDraft(next)
    setSaveError(null)
    setSaved(false)
    setEditing(true)
  }, [editMonths])

  const handleDraftChange = useCallback((month: string, raw: string) => {
    // Sta cijfers, min, komma, punt en spaties toe tijdens het typen.
    if (raw !== '' && !/^[0-9.,\-\s]*$/.test(raw)) return
    setDraft((prev) => ({ ...prev, [month]: raw }))
  }, [])

  const handleSave = useCallback(async () => {
    if (saving) return
    // Verzamel alleen ingevulde maanden die afwijken van de bestaande waarde.
    const existingByMonth = new Map<string, number>()
    for (const e of serverEntries ?? []) {
      existingByMonth.set(e.month.slice(0, 7), e.netWorth)
    }
    const toPost: ServerEntry[] = []
    for (const [month, raw] of Object.entries(draft)) {
      const parsed = parseAmount(raw)
      if (parsed == null) continue // leeg = geen waarde voor die maand
      const existing = existingByMonth.get(month)
      if (existing != null && Math.abs(existing - parsed) < 0.005) continue
      toPost.push({ month, netWorth: parsed })
    }

    if (toPost.length === 0) {
      // Niets gewijzigd — sluit gewoon de bewerk-modus.
      setEditing(false)
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/snapshots/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: toPost }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null
        setSaveError(json?.error ?? 'Opslaan is niet gelukt. Probeer het opnieuw.')
        return
      }
      setSaved(true)
      setEditing(false)
      // Herlaad de getoonde historie (beide bronnen) én ververs de
      // onderliggende /overzicht-grafiek zodat de nieuwe snapshots overal
      // doorwerken.
      await Promise.all([fetchHistory(), fetchGroupHistory()])
      router.refresh()
    } catch {
      setSaveError('Opslaan is niet gelukt. Controleer je verbinding.')
    } finally {
      setSaving(false)
    }
  }, [saving, draft, serverEntries, fetchHistory, fetchGroupHistory, router])

  const filledCount = useMemo(
    () => Object.values(draft).filter((v) => parseAmount(v) != null).length,
    [draft],
  )

  // ── Per-entiteit-editor: stabiele callbacks (identiteit-stabiel) ─────
  const handleEntityClose = useCallback(() => {
    setEntityEditing(false)
    setEntityFooter(null)
  }, [])

  const handleEntitySaved = useCallback(async () => {
    setEntityEditing(false)
    setEntityFooter(null)
    // Ná een succesvolle per-entiteit-save: beide bronnen opnieuw + refresh.
    await Promise.all([fetchHistory(), fetchGroupHistory()])
    router.refresh()
  }, [fetchHistory, fetchGroupHistory, router])

  const handleEntitySetFooter = useCallback((node: ReactNode | null) => {
    setEntityFooter(node)
  }, [])

  // ── Sticky sheet-footer per modus ──────────────────────────────
  // Totaal-editor: de Opslaan/Annuleren-knoppen staan (projectconventie NFR-4)
  // in de sticky footer i.p.v. onderaan de scroll-content. Per-entiteit-editor:
  // de knoppen komen via setFooter binnen. Weergave-modus: geen footer (de
  // duo-CTA blijft bewust inline in de content).
  const footerNode: ReactNode = entityEditing
    ? entityFooter
    : editing
      ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opslaan…
                </>
              ) : (
                <>Opslaan{filledCount > 0 ? ` (${filledCount})` : ''}</>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setSaveError(null)
              }}
              disabled={saving}
              className="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-60"
            >
              Annuleren
            </button>
          </div>
        )
      : null

  return (
    <ShellOverlay
      open={open}
      onClose={onClose}
      kind="sheet"
      size="lg"
      title="Netto vermogen — verloop"
      footer={footerNode}
    >
      {entityEditing ? (
        /* ── Per-entiteit-editor (regelt eigen padding + footer) ── */
        <EntityBackfillEditor
          onClose={handleEntityClose}
          onSaved={handleEntitySaved}
          setFooter={handleEntitySetFooter}
        />
      ) : (
        /* Eén consistente horizontale padding (px-5, gelijk aan de sheet-header)
           + ruime verticale ritmiek (space-y-6) zodat de blokken niet tegen de
           randen of tegen elkaar lopen. */
        <div className="space-y-6 px-5 py-5">
          {editing ? (
            /* ── Bewerk-modus (totaal) ───────────────────────────── */
            <div className="space-y-5">
              <div>
                <h4 className="font-serif text-lg font-semibold text-[var(--ink)]">
                  Historie bijwerken
                </h4>
                <p className="mt-1 text-sm text-[var(--ink-3)]">
                  Vul per maand je totale netto vermogen in (tot 24 maanden terug).
                  Laat een maand leeg als je die niet weet — een ingevulde maand
                  wordt de vastgelegde stand, geen schatting meer.
                </p>
              </div>

              {saveError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-[var(--r)] border border-negative/30 bg-negative/10 px-3 py-2.5 text-sm text-negative"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <div className="space-y-2">
                {editMonths.map((row) => {
                  const inputId = `${gradientId}-nw-${row.month}`
                  return (
                    <div key={row.month} className="flex items-center gap-3">
                      <label
                        htmlFor={inputId}
                        className="w-24 shrink-0 text-sm font-serif text-[var(--ink-2)]"
                      >
                        {formatMonthLabel(row.month)}
                      </label>
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-3)]">
                          €
                        </span>
                        <input
                          id={inputId}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={draft[row.month] ?? ''}
                          onChange={(e) => handleDraftChange(row.month, e.target.value)}
                          placeholder={row.existing != null ? '' : 'geen waarde'}
                          aria-label={`Netto vermogen ${formatMonthLabel(row.month)}`}
                          className="min-h-11 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] pl-7 pr-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] placeholder:text-[var(--ink-4)] placeholder:font-serif placeholder:not-italic focus:border-[var(--module-active-400)] focus:outline-none focus:ring-1 focus:ring-[var(--module-active-400)]"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* ── Weergave-modus ──────────────────────────────────── */
            <>
              {/* Hoofdbedrag + periode-delta (+ vrijheidstijd-equivalent) */}
              <div>
                <div className="font-serif text-2xl font-semibold text-[var(--ink)] tabular-nums">
                  {formatMaskedCurrency(currentNetWorth, masked)}
                </div>
                {first && (
                  <p
                    className={`mt-1 text-sm font-mono tabular-nums ${
                      periodDelta >= 0 ? 'text-positive' : 'text-negative'
                    }`}
                  >
                    {periodDelta >= 0 ? '+' : ''}
                    {formatMaskedCurrency(periodDelta, masked)}
                    {freedomDelta && (
                      <span data-testid="freedom-delta" className="text-[var(--ink-2)]">
                        {' · '}
                        {periodDelta >= 0 ? '+' : '−'}
                        {freedomDelta} vrijheid
                      </span>
                    )}{' '}
                    <span className="font-serif italic text-[var(--ink-3)]">
                      sinds {formatMonthLabel(first.month)}
                    </span>
                  </p>
                )}
              </div>

              {/* Weergave-schakelaar Totaal / Groepen */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ViewModeToggle
                  value={viewMode}
                  onChange={setViewMode}
                  groupsDisabled={!groupsAvailable}
                  groupsHint={
                    showGroupsEmptyHint
                      ? "Nog geen historie per bezitting of schuld — vul die in via 'Per bezitting/schuld bijwerken'."
                      : undefined
                  }
                />
                {showGroupsEmptyHint && (
                  <p className="text-[11px] text-[var(--ink-4)] max-w-[22rem]">
                    Nog geen historie per bezitting of schuld — vul die in via
                    &lsquo;Per bezitting/schuld bijwerken&rsquo;.
                  </p>
                )}
              </div>

              {/* Verloop-grafiek — Groepen (butterfly) of Totaal (verlooplijn) */}
              {viewMode === 'groups' &&
              groupsAvailable &&
              groupData?.months &&
              groupData.assetGroups &&
              groupData.debtGroups &&
              groupData.rest &&
              groupData.net &&
              groupData.provenance ? (
                <NetworthGroupsChart
                  months={groupData.months}
                  assetGroups={groupData.assetGroups}
                  debtGroups={groupData.debtGroups}
                  rest={groupData.rest}
                  net={groupData.net}
                  provenance={groupData.provenance}
                />
              ) : (
                <>
                  <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-auto"
                    preserveAspectRatio="none"
                    aria-label="Netto vermogen verloop over de afgelopen maanden"
                    role="img"
                  >
                    <defs>
                      <linearGradient id={`${gradientId}-area`} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--module-active-700, var(--ink))"
                          stopOpacity="0.12"
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--module-active-700, var(--ink))"
                          stopOpacity="0"
                        />
                      </linearGradient>
                    </defs>
                    {/* Schaduw-vlak onder de verlooplijn */}
                    {areaPath && (
                      <path d={areaPath} fill={`url(#${gradientId}-area)`} stroke="none" />
                    )}
                    {/* Geschat segment — lichtere stippellijn */}
                    {estimatedPath && (
                      <path
                        d={estimatedPath}
                        fill="none"
                        stroke="var(--ink-4)"
                        strokeWidth="2"
                        strokeDasharray="3 4"
                        strokeLinecap="round"
                      />
                    )}
                    {/* Echt segment — doorlopende lijn in module-inkt */}
                    {realPath && (
                      <path
                        d={realPath}
                        fill="none"
                        stroke="var(--module-active-700, var(--ink))"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    )}
                    {/* Punt op vandaag */}
                    {lastPt && (
                      <circle cx={lastPt.x} cy={lastPt.y} r="4" fill="var(--module-active-700, var(--ink))" />
                    )}
                  </svg>

                  {/* Legenda — alleen wanneer er een geschat segment is */}
                  {hasEstimates && (
                    <p className="font-serif italic text-xs text-[var(--ink-3)]">
                      Het gestippelde deel is een schatting op basis van je spaarritme —
                      er zijn voor die maanden nog geen waarderingen vastgelegd.
                    </p>
                  )}
                </>
              )}

              {/* Affordance: historie bijwerken (totaal + per onderdeel) */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--ink-3)]">
                  {loadError
                    ? 'Historie kon niet worden geladen — je ziet de laatst bekende stand.'
                    : 'Vul je netto vermogen per maand aan tot 24 maanden terug.'}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={openEditor}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    Historie bijwerken
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntityEditing(true)}
                    className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-xs font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]"
                  >
                    <ListTree className="h-3.5 w-3.5" />
                    Per bezitting/schuld bijwerken
                  </button>
                </div>
              </div>

              {saved && (
                <div className="flex items-center gap-2 rounded-[var(--r)] border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
                  <Check className="h-4 w-4 shrink-0" />
                  Je historie is bijgewerkt.
                </div>
              )}

              {/* Kassabon-stijl maandtabel (herkomst: geschat / handmatig) */}
              <div>
                <div className="border-b border-[var(--border-ed)] pb-1 flex items-baseline justify-between">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                    Maand
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)]">
                    Stand · verschil
                  </span>
                </div>
                <ul>
                  {series
                    .slice()
                    .reverse()
                    .map((p, revIdx) => {
                      const idx = series.length - 1 - revIdx
                      const prev = idx > 0 ? series[idx - 1] : null
                      const delta = prev ? p.value - prev.value : null
                      const label = p.month === 'nu' ? 'Vandaag' : formatMonthLabel(p.month)
                      const isManual = !p.estimated && manualMonths.has(p.month.slice(0, 7))
                      return (
                        <li
                          key={`${p.month}-${idx}`}
                          className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--rule-soft)] py-2 hover:bg-[var(--subtle)]"
                        >
                          <span className="text-sm text-[var(--ink-2)] font-serif">
                            {label}
                            {p.estimated ? (
                              <span className="ml-1.5 font-serif italic text-[11px] text-[var(--ink-4)]">
                                geschat
                              </span>
                            ) : isManual ? (
                              <span className="ml-1.5 font-serif italic text-[11px] text-[var(--ink-4)]">
                                handmatig
                              </span>
                            ) : null}
                          </span>
                          <span className="text-right">
                            <span
                              className={`font-mono tabular-nums text-sm text-[var(--ink)] ${
                                p.estimated ? 'opacity-60' : ''
                              }`}
                            >
                              {formatMaskedCurrency(p.value, masked)}
                            </span>
                            {delta != null && (
                              <span
                                className={`ml-2 font-mono tabular-nums text-xs ${
                                  delta >= 0 ? 'text-positive' : 'text-negative'
                                }`}
                              >
                                {delta >= 0 ? '+' : ''}
                                {formatMaskedCurrency(delta, masked)}
                              </span>
                            )}
                          </span>
                        </li>
                      )
                    })}
                </ul>
              </div>

              {/* Duo-CTA: voorwaarts naar de projectie + terug naar overzicht */}
              <div className="flex items-center gap-2 border-t border-[var(--border-ed)] pt-4">
                <Link
                  href="/toekomst"
                  className="inline-flex min-h-11 flex-1 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)]"
                >
                  Bekijk je toekomstprojectie
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-11 flex-1 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--subtle)]"
                >
                  Terug naar overzicht
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </ShellOverlay>
  )
}

/**
 * ViewModeToggle — radiogroup Totaal / Groepen boven de verloop-grafiek.
 * Spiegelt het ModeToggle-patroon uit category-history-chart (aria/styling).
 * "Groepen" is disabled zolang de group-history-fetch loopt / faalt / geen
 * per-groep-historie heeft; `groupsHint` levert dan de title/aria-toelichting.
 */
function ViewModeToggle({
  value,
  onChange,
  groupsDisabled,
  groupsHint,
}: {
  value: 'total' | 'groups'
  onChange: (next: 'total' | 'groups') => void
  groupsDisabled: boolean
  groupsHint?: string
}) {
  const options: { key: 'total' | 'groups'; label: string; aria: string }[] = [
    { key: 'total', label: 'Totaal', aria: 'Totaal netto vermogen' },
    { key: 'groups', label: 'Groepen', aria: 'Per bezittings- en schuldgroep' },
  ]
  return (
    <div role="radiogroup" aria-label="Weergave" className="inline-flex items-center gap-1">
      {options.map((opt) => {
        const active = opt.key === value
        const disabled = opt.key === 'groups' && groupsDisabled
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.aria}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            title={opt.key === 'groups' ? groupsHint : undefined}
            onClick={() => {
              if (disabled) return
              onChange(opt.key)
            }}
            className={`rounded-[var(--r)] border border-[var(--border-ed)] px-2.5 py-1 text-xs transition-colors ${
              active
                ? 'bg-[var(--ink)] text-[var(--paper)]'
                : disabled
                  ? 'text-[var(--ink-4)] opacity-60 cursor-not-allowed'
                  : 'text-[var(--ink-2)] hover:bg-[var(--subtle)]'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
