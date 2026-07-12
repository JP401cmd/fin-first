'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChevronRight, Layers, Loader2, Lock, LockOpen, Plus, X } from 'lucide-react'
import { UAT_SCENARIOS, UAT_ZONES, type UatScenario, type UatZone } from '@/lib/uat/catalog'
import { buildPlaatLayout } from '@/lib/uat/plaat-layout'
import { BEZIT_FLOW } from '@/lib/uat/flows/bezit'
import { SCHULD_FLOW } from '@/lib/uat/flows/schuld'
import { TOEK_FLOW } from '@/lib/uat/flows/toek'
import { BELAST_FLOW } from '@/lib/uat/flows/belast'
import { KRUIS_FLOW } from '@/lib/uat/flows/kruis'
import { BUDGET_FLOW } from '@/lib/uat/flows/budget'
import { START_FLOW } from '@/lib/uat/flows/start'
import { WILL_FLOW } from '@/lib/uat/flows/will'
import { CASH_FLOW } from '@/lib/uat/flows/cash'
import { OVZ_FLOW } from '@/lib/uat/flows/ovz'
import { NAV_FLOW } from '@/lib/uat/flows/nav'
import { RAPP_FLOW } from '@/lib/uat/flows/rapp'
import { REKEN_FLOW } from '@/lib/uat/flows/reken'
import { MIJN_FLOW } from '@/lib/uat/flows/mijn'
import { BEHEER_FLOW } from '@/lib/uat/flows/beheer'
import { computeFlowLayout } from '@/lib/uat/flows/flow-layout'
import { explainZoneStatus, type ZoneStatusExplanation } from '@/lib/uat/flows/zone-status'
import type { UatFlow } from '@/lib/uat/flows/types'
import {
  buildResultLookup,
  computeCoverage,
  deriveSubStatus,
  UAT_STATUS_VISUAL,
  type UatResultRow,
  type UatStatus,
} from '@/lib/uat/status'
import { mergeResult } from '@/lib/uat/merge-results'
import { computeGoNoGo } from '@/lib/uat/go-no-go'
import {
  computeVisibleScenarioIds,
  hasActiveFilter,
  UAT_FILTERS_NONE,
  type UatFilterState,
  type UatPlatformFilter,
} from '@/lib/uat/filters'
import { useIsLgUp } from '@/lib/hooks/use-media-query'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { UatPlaatSvg } from './uat-plaat-svg'
import { UatFlowSvg } from './uat-flow-svg'
import { UatDetailPanel } from './uat-detail-panel'

// Zones met een gecureerd procesmodel (laag 2) worden klikbaar (drill-in).
// Overige zone-titels zijn inert tot hun flow bestaat.
const FLOW_BY_ZONE: Partial<Record<UatZone, UatFlow>> = { BEZIT: BEZIT_FLOW, SCHULD: SCHULD_FLOW, TOEK: TOEK_FLOW, BELAST: BELAST_FLOW, BUDGET: BUDGET_FLOW, KRUIS: KRUIS_FLOW, START: START_FLOW, WILL: WILL_FLOW, CASH: CASH_FLOW, OVZ: OVZ_FLOW, NAV: NAV_FLOW, RAPP: RAPP_FLOW, REKEN: REKEN_FLOW, MIJN: MIJN_FLOW, BEHEER: BEHEER_FLOW }
const DRILLABLE_ZONES: ReadonlySet<UatZone> = new Set(Object.keys(FLOW_BY_ZONE) as UatZone[])
const ZONE_META_BY_ID = new Map(UAT_ZONES.map((z) => [z.zone, z]))

interface UatRound {
  id: string
  label: string
  started_at: string
  app_version: string
  environment: string
  closed_at: string | null
  notes?: string | null
}

type CompareKind = 'regressie' | 'hersteld' | 'niet_opnieuw' | 'ongewijzigd' | 'nieuw'

interface CompareTransition {
  scenario_id: string
  sub: string
  platform: string
  baseStatus: string | null
  targetStatus: string | null
  kind: CompareKind
}

interface CompareData {
  transitions: CompareTransition[]
  summary: { regressies: number; hersteld: number }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function roundOptionLabel(r: UatRound): string {
  return `${r.label} — ${formatDate(r.started_at)} · ${r.environment}${r.closed_at ? ' · gesloten' : ''}`
}

// ── Legenda-vormpje (HTML/SVG-mini, hergebruikt de statuscodering) ────────────

function LegendMark({ status }: { status: UatStatus }) {
  const v = UAT_STATUS_VISUAL[status]
  const r = 8
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      {v.shape === 'triangle' && (
        <polygon points="10,2.5 2.5,16 17.5,16" fill={v.fill} stroke={v.stroke} strokeWidth={1.2} strokeLinejoin="round" />
      )}
      {v.shape === 'diamond' && (
        <polygon points="10,2 18,10 10,18 2,10" fill={v.fill} stroke={v.stroke} strokeWidth={1.2} strokeLinejoin="round" />
      )}
      {v.shape === 'circle' && <circle cx={10} cy={10} r={r} fill={v.fill} stroke={v.stroke} strokeWidth={1.2} />}
      {v.shape === 'circle-open' && (
        <circle cx={10} cy={10} r={r} fill="none" stroke={v.stroke} strokeWidth={1.3} strokeDasharray="2 2.4" />
      )}
      {v.glyph && (
        <text x={10} y={10} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill={v.glyphFill}>
          {v.glyph}
        </text>
      )}
    </svg>
  )
}

const LEGEND: { status: UatStatus; label: string }[] = [
  { status: 'groen', label: 'Geslaagd' },
  { status: 'oranje', label: 'Geblokkeerd' },
  { status: 'rood', label: 'Gefaald' },
  { status: 'grijs', label: 'Niet uitgevoerd' },
]

// ── Filterchips (Deel 3 §3.3, brok 5) ──────────────────────────────────────────
//
// Vijf combineerbare chips (AND-semantiek, zie lib/uat/filters.ts). Filteren
// dimt niet-matchende knopen in de plaat — het verwijdert ze niet, en de
// kopband-cijfers (succesrate/dekking/go-no-go) blijven altijd op de hele
// ronde berekend; alleen de plaat-weergave reageert op de selectie.

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
          : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
      }`}
    >
      {label}
    </button>
  )
}

function FilterChips({ filters, onSet, onReset }: { filters: UatFilterState; onSet: (next: UatFilterState) => void; onReset: () => void }) {
  const active = hasActiveFilter(filters)
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter de plaat (chips combineren met EN)">
      <FilterChip label="Alles" active={!active} onClick={onReset} />
      <FilterChip
        label="Alleen rood + oranje"
        active={filters.statusFilter === 'rood_oranje'}
        onClick={() => onSet({ ...filters, statusFilter: filters.statusFilter === 'rood_oranje' ? null : 'rood_oranje' })}
      />
      <FilterChip
        label="Alleen rooktest"
        active={filters.rooktestOnly}
        onClick={() => onSet({ ...filters, rooktestOnly: !filters.rooktestOnly })}
      />
      <FilterChip
        label="Alleen nog niet uitgevoerd"
        active={filters.grijsOnly}
        onClick={() => onSet({ ...filters, grijsOnly: !filters.grijsOnly })}
      />
      <span className="text-[var(--ink-4)]" aria-hidden="true">
        ·
      </span>
      <FilterChip
        label="Webapp"
        active={filters.platform === 'webapp'}
        onClick={() => onSet({ ...filters, platform: filters.platform === 'webapp' ? null : ('webapp' as UatPlatformFilter) })}
      />
      <FilterChip
        label="Mobiel"
        active={filters.platform === 'mobiel'}
        onClick={() => onSet({ ...filters, platform: filters.platform === 'mobiel' ? null : ('mobiel' as UatPlatformFilter) })}
      />
    </div>
  )
}

// ── "Zo werkt deze plaat" — korte handleiding (Deel 3 §3.6 brok 5) ────────────

function HowItWorks() {
  return (
    <details className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 open:pb-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--ink-2)] [&::marker]:text-[var(--ink-3)]">
        <span className="inline-flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          Zo werkt deze plaat
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm text-[var(--ink-2)]">
        <p>
          De plaat volgt de gebruikersreis in <strong>vijf banden</strong> — Kennismaken, Fundament, Dagelijks
          gebruik, Vooruitkijken en Randvoorwaarden — met de vijftien deelgebied-zones als tegels daarbinnen.{' '}
          <strong>Elk niveau kleurt naar zijn slechtste onderliggende status</strong>: één rood subscenario maakt
          zijn scenario, zone en band rood; alleen oranje overstemt alleen groen; iets grijs naast verder groen
          toont groen met een gestippelde rand (&ldquo;onvolledig getest&rdquo;).
        </p>
        <ul className="space-y-1.5">
          {LEGEND.map((l) => (
            <li key={l.status} className="flex items-center gap-2">
              <LegendMark status={l.status} />
              <span>
                {l.label} — {UAT_STATUS_VISUAL[l.status].label}, vorm &ldquo;{UAT_STATUS_VISUAL[l.status].shape}&rdquo; (kleur
                staat nooit alleen).
              </span>
            </li>
          ))}
        </ul>
        <p>
          Een klein bliksem-teken markeert <strong>rooktest</strong>-scenario&apos;s; de grootte van een knoop volgt
          de kriticiteit (KERN groot, Belangrijk middel, Overig klein). De dunne verbindingslijnen met een knoopje op
          het kruispunt zijn de <strong>KRUIS-verbindingen</strong>: scenario&apos;s die meerdere zones tegelijk
          raken (bijvoorbeeld &ldquo;netto vermogen is overal hetzelfde getal&rdquo;). Zo&apos;n knoopje open je net
          als een gewone scenario-knoop.
        </p>
        <p>
          <strong>Een resultaat invoeren:</strong> dubbelklik een zone om in te zoomen (of gebruik scrollwiel/pinch en
          sleep), klik een knoop en kies Geslaagd / Gefaald / Geblokkeerd per subscenario in het paneel dat opent.
          Toets <span className="font-mono">0</span> of de Overzicht-knop brengt je terug naar fit-to-screen.
        </p>
        <p>
          <strong>Een ronde vergelijken:</strong> kies bij &ldquo;Vergelijk met&rdquo; een eerdere ronde — knopen die
          van geslaagd naar gefaald/geblokkeerd omsloegen krijgen een dikke rode ring (regressie), hersteld gaat
          gepaard met een klein groen vinkje.
        </p>
      </div>
    </details>
  )
}

// ── Go/no-go-blok (Deel 3 §3.5) ────────────────────────────────────────────────

function GoNoGoBlock({ result }: { result: ReturnType<typeof computeGoNoGo> }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        result.go ? 'border-[var(--positive)] bg-[var(--paper)]' : 'border-[var(--negative)] bg-[var(--paper)]'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">Go / no-go</p>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-white ${
            result.go ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'
          }`}
        >
          {result.go ? 'GO' : `NO-GO — ${result.criteria.filter((c) => !c.gehaald).length} blokkerend`}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {result.criteria.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                c.gehaald ? 'bg-[var(--positive)]' : 'bg-[var(--negative)]'
              }`}
              aria-hidden="true"
            >
              {c.gehaald ? '✓' : '✕'}
            </span>
            <span className="text-[var(--ink-2)]">
              {c.label}
              <span className="ml-1.5 text-[var(--ink-3)]">— {c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Nieuwe-testronde-dialoog ────────────────────────────────────────────────────

function NewRoundDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (round: UatRound) => void
}) {
  const [label, setLabel] = useState('')
  const [environment, setEnvironment] = useState('test')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLabel('')
      setEnvironment('test')
      setNotes('')
      setError(null)
    }
  }, [open])

  const canSave = label.trim().length > 0 && environment.trim().length > 0 && !saving

  async function submit() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/uat/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), environment: environment.trim(), notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? `Aanmaken mislukte (${res.status})`)
      }
      const j = (await res.json()) as { round: UatRound }
      onCreated(j.round)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setSaving(false)
    }
  }

  const fieldBase =
    'w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-4)] outline-none focus:border-[var(--ink-3)]'

  return (
    <BottomSheet open={open} onClose={onClose} title="Nieuwe testronde" size="sm">
      <div className="space-y-3 px-5 pb-5 pt-1">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
            Label <span className="text-[var(--negative)]">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="bv. R-2026-07-12"
            className={fieldBase}
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">
            Omgeving <span className="text-[var(--negative)]">*</span>
          </label>
          <input
            type="text"
            list="uat-environments"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            placeholder="test / preview / prod"
            className={fieldBase}
          />
          <datalist id="uat-environments">
            <option value="test" />
            <option value="preview" />
            <option value="prod" />
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-[var(--ink-2)]">Notitie (optioneel)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Context bij deze ronde"
            className={`${fieldBase} resize-y`}
          />
        </div>
        {error && <p className="text-xs text-[var(--negative)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border-ed)] px-3 py-1.5 text-xs font-medium text-[var(--ink-2)]"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSave}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Ronde starten
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// ── Zonestatus-verklaring (laag 2, de kern) ────────────────────────────────────

function ZoneStatusExplainer({
  explanation,
  causerCodes,
}: {
  explanation: ZoneStatusExplanation
  causerCodes: string[]
}) {
  const v = UAT_STATUS_VISUAL[explanation.zoneStatus]
  const isGrijs = explanation.zoneStatus === 'grijs'
  const n = explanation.causeCount
  return (
    <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">Zonestatus</span>
        {isGrijs ? (
          <span className="text-[var(--ink-2)]">
            <strong className="text-[var(--ink)]">nog niet getest</strong> — geen resultaten in deze ronde
          </span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-[var(--ink-2)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" aria-hidden="true" style={{ backgroundColor: v.fill }} />
            <strong className="text-[var(--ink)]">{v.label}</strong>
            <span className="text-[var(--ink-3)]">
              — bepaald door {n} stap{n === 1 ? '' : 'pen'}
              {explanation.incompleet ? ' · onvolledig getest' : ''}
            </span>
          </span>
        )}
      </div>
      {!isGrijs && causerCodes.length > 0 && (
        <p className="mt-1.5 text-xs text-[var(--ink-3)]">
          Bepalende stappen: <span className="font-mono text-[var(--ink-2)]">{causerCodes.join(', ')}</span>. Deze zijn in
          de flow gemarkeerd met een dikke rand en de badge &ldquo;bepaalt zonestatus&rdquo;.
        </p>
      )}
    </div>
  )
}

// ── Compacte flow-legenda (laag 2) ──────────────────────────────────────────────

function FlowLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--ink-3)]">
      <span className="inline-flex items-center gap-1.5">
        <svg width={16} height={12} aria-hidden="true">
          <rect x={1} y={1} width={14} height={10} rx={2} fill="var(--paper)" stroke="var(--ink-3)" strokeWidth={1.2} />
        </svg>
        Scherm / actie (klikbaar → detail)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width={16} height={12} aria-hidden="true">
          <polygon points="8,1 15,6 8,11 1,6" fill="var(--paper)" stroke="var(--ink-3)" strokeWidth={1.2} />
        </svg>
        Beslissing
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width={16} height={12} aria-hidden="true">
          <rect x={1} y={1} width={14} height={10} rx={2} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="3 2" />
        </svg>
        Afhankelijkheid (ander domein)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm border-2 border-[var(--ink)]" aria-hidden="true" />
        Dikke rand + badge = bepaalt de zonestatus
      </span>
    </div>
  )
}

// ── Client ────────────────────────────────────────────────────────────────────

export function UatPlaatClient() {
  const [rounds, setRounds] = useState<UatRound[] | null>(null)
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null)
  const [results, setResults] = useState<UatResultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<UatScenario | null>(null)

  // Drill-in naar laag 2 (procesmodel). null = de zone-grid (laag 1, ongewijzigd).
  const [drillZone, setDrillZone] = useState<UatZone | null>(null)

  const [compareBaseId, setCompareBaseId] = useState<string | null>(null)
  const [compareData, setCompareData] = useState<CompareData | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)

  const [newRoundOpen, setNewRoundOpen] = useState(false)
  const [roundActionLoading, setRoundActionLoading] = useState(false)

  // Overzichtsmodus: de laatst bekende status per instantie (scenario×sub×platform)
  // over ÁLLE ronden samen, i.p.v. één ronde. Alleen-lezen — er is geen enkele
  // ronde om naar te schrijven; kies een ronde om weer te registreren.
  const [latestMode, setLatestMode] = useState(false)

  // Filters (§3.3, brok 5) — dimt niet-matchende knopen; raakt de kopband-
  // cijfers (succesrate/dekking/go-no-go) bewust niet aan (§3.3: die tonen
  // altijd de hele ronde).
  const [filters, setFilters] = useState<UatFilterState>(UAT_FILTERS_NONE)
  // Aangekondigde statuswijzigingen na invoer (aria-live), voor screenreader-gebruikers.
  const [liveMessage, setLiveMessage] = useState('')

  const layout = useMemo(() => buildPlaatLayout(), [])
  const isLgUp = useIsLgUp()

  // ── Drill-in (laag 2) ───────────────────────────────────────────────────────
  const enterDrill = useCallback((zone: UatZone) => {
    setSelected(null)
    setDrillZone(zone)
  }, [])
  const exitDrill = useCallback(() => {
    setSelected(null)
    setDrillZone(null)
  }, [])

  const activeFlow = drillZone ? FLOW_BY_ZONE[drillZone] ?? null : null
  const flowLayout = useMemo(() => (activeFlow ? computeFlowLayout(activeFlow) : null), [activeFlow])
  const flowExplanation = useMemo(
    () => (activeFlow ? explainZoneStatus(activeFlow, results) : null),
    [activeFlow, results],
  )
  const drillZoneMeta = drillZone ? ZONE_META_BY_ID.get(drillZone) ?? null : null
  const causerCodes = useMemo(() => {
    if (!activeFlow || !flowExplanation) return []
    return activeFlow.nodes
      .filter((n) => flowExplanation.causeNodeIds.has(n.id))
      .map((n) => n.label.split(' · ')[0])
  }, [activeFlow, flowExplanation])

  // Esc in drill-modus: eerst het paneel sluiten, anders de drill verlaten.
  useEffect(() => {
    if (!drillZone) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null)
      else setDrillZone(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drillZone, selected])

  // Desktop-zijpaneel: focus het paneel zodra een scenario wordt geselecteerd,
  // anders vangt de (sibling) SVG-knoop de focus en vuurt de Esc-handler nooit.
  const panelRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (isLgUp && selected) panelRef.current?.focus()
  }, [selected, isLgUp])

  const loadResultsFor = useCallback(async (roundId: string): Promise<UatResultRow[]> => {
    const resRes = await fetch(`/api/admin/uat/results?round=${encodeURIComponent(roundId)}`)
    if (!resRes.ok) throw new Error(`Resultaten laden mislukte (${resRes.status})`)
    const resJson = (await resRes.json()) as { results: UatResultRow[] }
    return resJson.results ?? []
  }, [])

  // Laatst-bekend-overzicht: per instantie de meest recente registratie over alle ronden.
  const loadLatest = useCallback(async (): Promise<UatResultRow[]> => {
    const res = await fetch('/api/admin/uat/latest')
    if (!res.ok) throw new Error(`Overzicht laden mislukte (${res.status})`)
    const json = (await res.json()) as { results: UatResultRow[] }
    return json.results ?? []
  }, [])

  const enterLatest = useCallback(async () => {
    setSelected(null)
    setDrillZone(null)
    setLatestMode(true)
    setCompareBaseId(null)
    setCompareData(null)
    setCompareError(null)
    setLoading(true)
    setError(null)
    try {
      setResults(await loadLatest())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setLoading(false)
    }
  }, [loadLatest])

  // Nieuwe/gewijzigde registratie mergen: laatste registratie per (scenario,sub,platform) wint,
  // zodat de plaat + kopband + zone-kleuren direct meepropageren.
  const handleSaved = useCallback((row: UatResultRow) => {
    setResults((prev) => mergeResult(prev, row))
    const statusLabel = UAT_STATUS_VISUAL[deriveSubStatus(row.status)].label
    setLiveMessage(`${row.scenario_id}, onderdeel ${row.sub} op ${row.platform}, bijgewerkt naar status ${statusLabel}.`)
  }, [])

  const closePanel = useCallback(() => setSelected(null), [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rRes = await fetch('/api/admin/uat/rounds')
      if (!rRes.ok) throw new Error(`Rondes laden mislukte (${rRes.status})`)
      const rJson = (await rRes.json()) as { rounds: UatRound[] }
      const list = rJson.rounds ?? []
      setRounds(list)

      // Default = nieuwste OPEN ronde, anders de nieuwste (API sorteert started_at desc).
      const defaultRound = list.find((r) => !r.closed_at) ?? list[0] ?? null
      setSelectedRoundId(defaultRound?.id ?? null)
      setCompareBaseId(null)
      setCompareData(null)

      setResults(defaultRound ? await loadResultsFor(defaultRound.id) : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setLoading(false)
    }
  }, [loadResultsFor])

  useEffect(() => {
    void load()
  }, [load])

  const handleSelectRound = useCallback(
    async (id: string) => {
      const roundId = id || null
      setSelected(null)
      setLatestMode(false)
      setSelectedRoundId(roundId)
      setCompareBaseId(null)
      setCompareData(null)
      setCompareError(null)
      if (!roundId) {
        setResults([])
        return
      }
      setLoading(true)
      setError(null)
      try {
        setResults(await loadResultsFor(roundId))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Onbekende fout')
      } finally {
        setLoading(false)
      }
    },
    [loadResultsFor],
  )

  const handleRoundCreated = useCallback((round: UatRound) => {
    setRounds((prev) => (prev ? [round, ...prev] : [round]))
    setLatestMode(false)
    setSelectedRoundId(round.id)
    setCompareBaseId(null)
    setCompareData(null)
    setResults([])
    setSelected(null)
    setNewRoundOpen(false)
  }, [])

  const activeRound = useMemo(
    () => (latestMode ? null : rounds?.find((r) => r.id === selectedRoundId) ?? null),
    [latestMode, rounds, selectedRoundId],
  )
  const roundClosed = Boolean(activeRound?.closed_at)
  // Er zijn resultaten om te tonen zodra er een actieve ronde is óf de overzichtsmodus aanstaat.
  const hasResults = latestMode || Boolean(activeRound)

  // 409 vanuit het resultaat-formulier (race met sluiten in een andere tab): markeer
  // de actieve ronde direct als gesloten zodat de UI de read-only-status toont.
  const handleRoundClosedFromForm = useCallback(() => {
    setRounds((prev) =>
      prev?.map((r) => (r.id === selectedRoundId ? { ...r, closed_at: r.closed_at ?? new Date().toISOString() } : r)) ??
      prev,
    )
  }, [selectedRoundId])

  const toggleRoundClosed = useCallback(async () => {
    if (!activeRound) return
    const action = activeRound.closed_at ? 'reopen' : 'close'
    setRoundActionLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/uat/rounds/${encodeURIComponent(activeRound.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(j?.error ?? `${action === 'close' ? 'Sluiten' : 'Heropenen'} mislukte (${res.status})`)
      }
      const j = (await res.json()) as { round: UatRound }
      setRounds((prev) => prev?.map((r) => (r.id === j.round.id ? j.round : r)) ?? prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Onbekende fout')
    } finally {
      setRoundActionLoading(false)
    }
  }, [activeRound])

  // Vergelijking met een basisronde (Deel 3 §3.4): haalt op zodra base+target bekend zijn.
  useEffect(() => {
    if (!compareBaseId || !selectedRoundId) {
      setCompareData(null)
      setCompareError(null)
      return
    }
    let cancelled = false
    setCompareLoading(true)
    setCompareError(null)
    fetch(`/api/admin/uat/compare?base=${encodeURIComponent(compareBaseId)}&target=${encodeURIComponent(selectedRoundId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Vergelijken mislukte (${res.status})`)
        return (await res.json()) as CompareData
      })
      .then((data) => {
        if (!cancelled) setCompareData(data)
      })
      .catch((e) => {
        if (!cancelled) setCompareError(e instanceof Error ? e.message : 'Onbekende fout')
      })
      .finally(() => {
        if (!cancelled) setCompareLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [compareBaseId, selectedRoundId])

  const regressionScenarioIds = useMemo(() => {
    const s = new Set<string>()
    if (compareData) for (const t of compareData.transitions) if (t.kind === 'regressie') s.add(t.scenario_id)
    return s
  }, [compareData])

  const herstelScenarioIds = useMemo(() => {
    const s = new Set<string>()
    if (compareData) for (const t of compareData.transitions) if (t.kind === 'hersteld') s.add(t.scenario_id)
    return s
  }, [compareData])

  // Kopband-cijfers: ALTIJD op de hele ronde, ongeacht de filterselectie (§3.3).
  const coverage = useMemo(() => computeCoverage(UAT_SCENARIOS, results), [results])
  const goNoGo = useMemo(() => computeGoNoGo(UAT_SCENARIOS, results), [results])
  const ratePct = coverage.executed > 0 ? Math.round(coverage.successRate * 100) : 0
  const coveragePct = coverage.total > 0 ? Math.round((coverage.executed / coverage.total) * 100) : 0

  // Filterselectie → welke scenario-ID's (gewone knopen én KRUIS-verbindingen)
  // vol zichtbaar blijven in de plaat. null = geen filter actief = niets dimt.
  const resultLookup = useMemo(() => buildResultLookup(results), [results])
  const visibleScenarioIds = useMemo(
    () => computeVisibleScenarioIds(UAT_SCENARIOS, resultLookup, filters),
    [resultLookup, filters],
  )

  const compareOptions = useMemo(() => (rounds ?? []).filter((r) => r.id !== selectedRoundId), [rounds, selectedRoundId])

  const selectClass =
    'w-full rounded-md border border-[var(--border-ed)] bg-[var(--paper)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--ink-3)]'

  return (
    <div className="space-y-5">
      {/* Aria-live: kondigt statuswijzigingen na resultaatinvoer aan (§3.3, brok 5) */}
      <div aria-live="polite" role="status" className="sr-only">
        {liveMessage}
      </div>

      {/* Editorial pagina-opening */}
      <header>
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-3)]">
          Test &amp; ontwikkeling · Deel 3
        </p>
        <h2 className="mt-1 font-serif text-[26px] leading-tight text-[var(--ink)] sm:text-[30px]">
          De <em className="italic">procesplaat</em> van de UAT
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-2)]">
          De hele gebruikersreis in vijf banden en vijftien deelgebied-zones — elke zone kleurt naar zijn
          slechtste onderliggende status. Zo zie je in één oogopslag waar het klopt, waar het wringt en wat nog
          niet getest is.
        </p>
      </header>

      {!drillZone && <HowItWorks />}

      {/* Kopband — metrics: succesrate, dekking en go/no-go samen, in één oogopslag */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">Succesrate</p>
          <p className="mt-1 font-serif text-4xl text-[var(--ink)]">{hasResults ? `${ratePct}%` : '—'}</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            geslaagd van {coverage.executed} uitgevoerde subscenario&apos;s
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">Dekking</p>
          <p className="mt-1 font-serif text-4xl text-[var(--ink)]">
            {coverage.executed}
            <span className="text-lg text-[var(--ink-3)]">/{coverage.total}</span>
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--border-ed)]">
            <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${coveragePct}%` }} aria-hidden="true" />
          </div>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {coverage.grijs} nog grijs ({100 - coveragePct}% niet uitgevoerd)
          </p>
        </div>

        {/* Go/no-go — naast succesrate + dekking, altijd zichtbaar */}
        <GoNoGoBlock result={goNoGo} />
      </div>

      {/* Kopband — besturing: testronde kiezen/sturen + ronde-vergelijking */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Ronde-besturing */}
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">Testronde</p>
            {latestMode ? (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--ink-2)]">
                <Layers className="h-3 w-3" /> Laatst bekend
              </span>
            ) : (
              activeRound && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    roundClosed ? 'bg-[var(--subtle,transparent)] text-[var(--ink-2)]' : 'text-[var(--positive)]'
                  }`}
                >
                  {roundClosed ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
                  {roundClosed ? 'Gesloten' : 'Open'}
                </span>
              )
            )}
          </div>
          <select
            value={selectedRoundId ?? ''}
            onChange={(e) => void handleSelectRound(e.target.value)}
            aria-label="Kies een testronde"
            className={`${selectClass} mt-2`}
          >
            {!rounds?.length && <option value="">Nog geen ronde</option>}
            {rounds?.map((r) => (
              <option key={r.id} value={r.id}>
                {roundOptionLabel(r)}
              </option>
            ))}
          </select>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => (latestMode ? void handleSelectRound(selectedRoundId ?? '') : void enterLatest())}
              aria-pressed={latestMode}
              title="Toon per stap de laatst bekende uitslag over alle testrondes samen"
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                latestMode
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:bg-[var(--subtle)]'
              }`}
            >
              <Layers className="h-3 w-3" /> Laatst bekend (overzicht)
            </button>
            <button
              type="button"
              onClick={() => setNewRoundOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border-ed)] px-2 py-1 text-[11px] font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
            >
              <Plus className="h-3 w-3" /> Nieuwe testronde
            </button>
            {activeRound && (
              <button
                type="button"
                onClick={() => void toggleRoundClosed()}
                disabled={roundActionLoading}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-ed)] px-2 py-1 text-[11px] font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] disabled:opacity-50"
              >
                {roundActionLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : roundClosed ? (
                  <LockOpen className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                {roundClosed ? 'Heropenen' : 'Sluiten'}
              </button>
            )}
          </div>
        </div>

        {/* Vergelijk-selector + regressieteller */}
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-3)]">
            Vergelijk met (regressie)
          </p>
          <select
            value={compareBaseId ?? ''}
            onChange={(e) => setCompareBaseId(e.target.value || null)}
            aria-label="Vergelijk met een basisronde"
            disabled={!activeRound || compareOptions.length === 0}
            className={`${selectClass} mt-2 disabled:opacity-50`}
          >
            <option value="">— geen vergelijking —</option>
            {compareOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {roundOptionLabel(r)}
              </option>
            ))}
          </select>
          <div className="mt-2 min-h-[20px] text-xs">
            {compareLoading && (
              <span className="inline-flex items-center gap-1 text-[var(--ink-3)]">
                <Loader2 className="h-3 w-3 animate-spin" /> Vergelijken…
              </span>
            )}
            {compareError && <span className="text-[var(--negative)]">{compareError}</span>}
            {!compareLoading && !compareError && compareData && (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  className={`font-semibold ${
                    compareData.summary.regressies > 0 ? 'text-[var(--negative)]' : 'text-[var(--ink-3)]'
                  }`}
                >
                  {compareData.summary.regressies} regressie{compareData.summary.regressies === 1 ? '' : 's'}
                </span>
                <span className="text-[var(--ink-4)]">·</span>
                <span
                  className={compareData.summary.hersteld > 0 ? 'font-semibold text-[var(--positive)]' : 'text-[var(--ink-3)]'}
                >
                  {compareData.summary.hersteld} hersteld
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filters (§3.3, brok 5) — dimmen de plaat, herrekenen de kopband-cijfers hierboven NIET.
          Filters gelden voor laag 1 (zone-grid); in de drill-modus (laag 2) zijn ze verborgen. */}
      {!drillZone && <FilterChips filters={filters} onSet={setFilters} onReset={() => setFilters(UAT_FILTERS_NONE)} />}

      {/* Legenda — hoort bij laag 1 */}
      {!drillZone && (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--ink-2)]">
        {LEGEND.map((l) => (
          <span key={l.status} className="inline-flex items-center gap-1.5">
            <LegendMark status={l.status} />
            {l.label}
          </span>
        ))}
        <span className="text-[var(--ink-3)]">Grootte = kriticiteit (KERN groot) · bliksem = rooktest</span>
        <span className="inline-flex items-center gap-1.5">
          <svg width={20} height={10} viewBox="0 0 20 10" aria-hidden="true">
            <line x1={0} y1={5} x2={20} y2={5} stroke="var(--ink-3)" strokeWidth={2} />
          </svg>
          KRUIS-verbinding tussen zones
        </span>
        {compareData && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3.5 w-3.5 rounded-full border-[3px]"
                style={{ borderColor: 'var(--negative)' }}
                aria-hidden="true"
              />
              Regressie t.o.v. vergeleken ronde
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ backgroundColor: 'var(--positive)' }}
                aria-hidden="true"
              >
                ✓
              </span>
              Hersteld t.o.v. vergeleken ronde
            </span>
          </>
        )}
      </div>
      )}

      {/* Meldingen */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--negative)] bg-[var(--paper)] p-3 text-sm text-[var(--negative)]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => void load()} className="ml-auto underline underline-offset-2">
            Opnieuw
          </button>
        </div>
      )}
      {!error && !loading && !activeRound && !latestMode && (
        <div className="rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--paper)] p-4 text-sm text-[var(--ink-2)]">
          Nog geen testronde — alles staat op grijs. Start een nieuwe testronde om resultaten te registreren.
        </div>
      )}
      {!error && !loading && latestMode && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-sm text-[var(--ink-2)]">
          <Layers className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-3)]" />
          <span>
            <strong className="text-[var(--ink)]">Laatst bekend</strong> — per stap de meest recente uitslag over
            álle testrondes samen, ongeacht in welke ronde die is geregistreerd. Alleen-lezen; kies hierboven een
            ronde om resultaten te registreren of te vergelijken.
          </span>
        </div>
      )}

      {/* De plaat + (desktop) detailpaneel */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Plaat laden…
        </div>
      ) : (
        <div className="lg:flex lg:items-start lg:gap-4">
          <div className="min-w-0 lg:flex-1">
            {drillZone && activeFlow && flowLayout && flowExplanation ? (
              <div className="space-y-3">
                {/* Broodkruimel: terug naar laag 1 */}
                <nav aria-label="Broodkruimel" className="flex items-center gap-1.5 text-sm">
                  <button
                    type="button"
                    onClick={exitDrill}
                    className="inline-flex items-center gap-1 text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Overzicht
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-4)]" aria-hidden="true" />
                  <span className="font-medium text-[var(--ink)]">{drillZoneMeta?.naam ?? drillZone}</span>
                </nav>

                {/* Zonestatus-verklaring — de kern: welke stappen bepalen de status */}
                <ZoneStatusExplainer explanation={flowExplanation} causerCodes={causerCodes} />

                <UatFlowSvg
                  flow={activeFlow}
                  layout={flowLayout}
                  explanation={flowExplanation}
                  selectedId={selected?.id ?? null}
                  onSelectScenario={setSelected}
                />

                <FlowLegend />
              </div>
            ) : (
              <UatPlaatSvg
                layout={layout}
                results={results}
                selectedId={selected?.id ?? null}
                onSelectScenario={setSelected}
                regressionScenarioIds={regressionScenarioIds}
                herstelScenarioIds={herstelScenarioIds}
                visibleScenarioIds={visibleScenarioIds}
                drillableZones={DRILLABLE_ZONES}
                onDrillZone={enterDrill}
              />
            )}
          </div>

          {/* Desktop: zijpaneel rechts — Esc sluit, net als de mobiele BottomSheet */}
          {isLgUp && selected && (
            <aside
              ref={panelRef}
              tabIndex={-1}
              className="hidden max-h-[80vh] w-[400px] shrink-0 overflow-y-auto rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-active-500)] lg:block"
              aria-label={`Detail ${selected.id}`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closePanel()
              }}
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={closePanel}
                  aria-label="Detailpaneel sluiten"
                  className="rounded-md p-1 text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <UatDetailPanel
                scenario={selected}
                roundId={activeRound?.id ?? null}
                roundClosed={roundClosed}
                results={results}
                onSaved={handleSaved}
                onRoundClosed={handleRoundClosedFromForm}
              />
            </aside>
          )}
        </div>
      )}

      {/* Mobiel: BottomSheet (boven de zwevende nav-pill) */}
      {!isLgUp && (
        <BottomSheet open={Boolean(selected)} onClose={closePanel} title={selected ? `${selected.naam} — ${selected.id}` : undefined} size="lg">
          {selected && (
            <div className="px-5 pb-4 pt-1">
              <UatDetailPanel
                scenario={selected}
                roundId={activeRound?.id ?? null}
                roundClosed={roundClosed}
                results={results}
                onSaved={handleSaved}
                onRoundClosed={handleRoundClosedFromForm}
              />
            </div>
          )}
        </BottomSheet>
      )}

      <NewRoundDialog open={newRoundOpen} onClose={() => setNewRoundOpen(false)} onCreated={handleRoundCreated} />
    </div>
  )
}
