'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Newspaper, Save, RotateCcw, Check, AlertCircle, ChevronDown, ChevronUp, Globe, Plus, Trash2, Database, Search, RefreshCw, FileText, Activity } from 'lucide-react'
import {
  DEFAULT_WEB_SOURCES,
  DEFAULT_RSS_FEEDS,
  BRON_SOORTEN,
  BRON_SOORT_LABEL,
  BRON_SOORT_UITLEG,
  BRON_OORZAAK_LABEL,
  type BronOorzaak,
  type BronSoort,
  type WebSource,
  type RssFeed,
} from '@/lib/news-sources'
import { NewsFeedbackPanel } from '@/components/app/beheer/news-feedback-panel'
import { NewsDuidingDetail, DUIDING_STATUS_LABEL, statusKleur, type DuidingVelden } from '@/components/app/beheer/news-duiding-detail'
import { NewsDuidingMetingPanel } from '@/components/app/beheer/news-duiding-meting-panel'
import { KrantMetingPanel } from '@/components/app/beheer/krant-meting-panel'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { ModalFooter } from '@/components/app/modal-footer'
import { DUIDING_STATUSSEN } from '@/lib/krant/duiding-schema'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'
import { safeHttpUrl } from '@/lib/safe-url'

// ── Types for news sources ───────────────────────────────────────────

interface DbArticle extends DuidingVelden {
  id: string
  title: string
  summary: string | null
  /** null als de bron-URL geen http(s) is — dan geen klikbare link. */
  source_url: string | null
  source_name: string
  category: string | null
  published_at: string | null
  fetched_at: string
  potential_impact: string | null
  is_used: boolean
}

interface JobRun {
  status: 'success' | 'error'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  summary: {
    sourcesChecked?: number
    rssArticlesFound?: number
    webArticlesExtracted?: number
    duplicatesSkipped?: number
    /** ADR 0176: sleutel bestond al — de verwachte uitkomst bij een tweede run. */
    alBekend?: number
    /** ADR 0176: nieuw, maar buiten het tijdbudget — komt de volgende run. */
    uitgesteld?: number
    inserted?: number
    skipped?: number
    /** ADR 0171: uitkomst van de duidingsstap in deze run. */
    duiding?: { geduid?: number; afgewezen?: number; mislukt?: number; overgeslagen?: number; wacht?: number }
  } | null
  error: string | null
}

interface SourceHealthEntry {
  label: string
  url: string
  /** ADR 0176; ontbreekt op gezondheid van vóór 1F. */
  soort?: BronSoort
  type: 'rss' | 'web'
  items: number
  nieuw?: number
  /** ADR 0176; ontbreekt op gezondheid van vóór 1F. */
  oorzaak?: BronOorzaak
  httpStatus?: number
  afgekapt?: number
  geweigerd?: number
  error?: string
}

/** Eén bron in de editor: web (lijst/pagina) en RSS in één lijst, gesplitst bij opslaan. */
interface Bron {
  url: string
  label: string
  soort: BronSoort
}

function naarBronnen(web: WebSource[], rss: RssFeed[]): Bron[] {
  return [
    ...web.map((w) => ({ url: w.url, label: w.label, soort: w.soort })),
    ...rss.map((r) => ({ url: r.url, label: r.label, soort: 'rss' as const })),
  ]
}

/**
 * Splits de editorlijst in de twee opslagsleutels. `herkomst` onthoudt per
 * opgeslagen positie de rij in de editor, zodat een zod-fout als
 * "webSources.3.url: …" naar de juiste rij wijst.
 */
function splitsBronnen(bronnen: Bron[]): {
  body: { webSources: WebSource[]; rssFeeds: RssFeed[] }
  herkomst: { webSources: number[]; rssFeeds: number[] }
} {
  const webSources: WebSource[] = []
  const rssFeeds: RssFeed[] = []
  const herkomst = { webSources: [] as number[], rssFeeds: [] as number[] }
  bronnen.forEach((b, i) => {
    if (b.soort === 'rss') {
      rssFeeds.push({ url: b.url.trim(), label: b.label.trim() })
      herkomst.rssFeeds.push(i)
    } else {
      webSources.push({ url: b.url.trim(), label: b.label.trim(), soort: b.soort })
      herkomst.webSources.push(i)
    }
  })
  return { body: { webSources, rssFeeds }, herkomst }
}

/** Zet een veldpad uit de 400-melding ("webSources.3.url: alleen https") om naar de editorrij + leesbare melding. */
function foutNaarRij(
  melding: string,
  herkomst: { webSources: number[]; rssFeeds: number[] },
): { rij: number; tekst: string } | null {
  const m = /^(webSources|rssFeeds)\.(\d+)\.(url|label|soort):\s*(.*)$/.exec(melding)
  if (!m) return null
  const rij = herkomst[m[1] as 'webSources' | 'rssFeeds'][Number(m[2])]
  if (rij === undefined) return null
  const veld = m[3] === 'url' ? 'adres' : m[3] === 'label' ? 'label' : 'soort'
  return { rij, tekst: `Bron ${rij + 1}: ${veld} — ${m[4]}` }
}

const STANDAARD_BRONNEN: Bron[] = naarBronnen(DEFAULT_WEB_SOURCES, DEFAULT_RSS_FEEDS)

/** De oorzaak van een gezondheidsregel, ook voor regels van vóór ADR 0176. */
function oorzaakVan(s: SourceHealthEntry): BronOorzaak | null {
  if (s.oorzaak) return s.oorzaak
  return s.items > 0 ? 'ok' : null
}

function oorzaakTekst(s: SourceHealthEntry): string {
  const o = oorzaakVan(s)
  if (!o) return s.error ? 'fout (oorzaak onbekend, run van vóór 1F)' : 'niets geleverd (oorzaak onbekend, run van vóór 1F)'
  const basis = BRON_OORZAAK_LABEL[o]
  return o === 'http_fout' && s.httpStatus ? `${basis} ${s.httpStatus}` : basis
}

/** Stoplichtsemantiek via de gedeelde status-tokens, niet via losse Tailwind-kleuren. */
function oorzaakStip(s: SourceHealthEntry): string {
  const o = oorzaakVan(s)
  if (o === 'ok') return LEVERAGE_STATUS_DOT.good
  if (o === 'leeg' || o === 'geen_model') return LEVERAGE_STATUS_DOT.warn
  if (o === null) return LEVERAGE_STATUS_DOT.neutral
  return LEVERAGE_STATUS_DOT.bad
}

interface IngestStatus {
  runs: JobRun[]
  sourceHealth: { checkedAt: string; sources: SourceHealthEntry[] } | null
}

// ── Shared input className for consistency ───────────────────────────

const inputClassName = 'w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--ink)] placeholder-[var(--ink-4)] transition-colors focus:border-[var(--ink-3)] focus:outline-none focus:ring-1 focus:ring-[var(--ink-3)] disabled:opacity-50'

// ── Component ────────────────────────────────────────────────────────

export default function BeheerNieuwsPage() {
  // Status state
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Sources state
  const [bronnen, setBronnen] = useState<Bron[]>([])
  // null = niets opgeslagen: de ingest draait dan op de standaardlijst.
  const [savedBronnen, setSavedBronnen] = useState<Bron[] | null>(null)
  // De editorrij waar de laatste opslagfout over ging (zod-pad teruggerekend).
  const [foutRij, setFoutRij] = useState<number | null>(null)
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [sourcesSaving, setSourcesSaving] = useState(false)

  // DB articles state
  const [dbArticles, setDbArticles] = useState<DbArticle[]>([])
  const [dbTotal, setDbTotal] = useState(0)
  const [dbLoading, setDbLoading] = useState(true)
  const [dbSearch, setDbSearch] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [alleenRekenend, setAlleenRekenend] = useState(false)
  const [dbPagina, setDbPagina] = useState(0)
  const [dbHeeftMeer, setDbHeeftMeer] = useState(false)
  const [dbMeerLaden, setDbMeerLaden] = useState(false)
  // Verhoogd na een terugtrek-/herduidactie, zodat de meting opnieuw laadt.
  const [metingVervers, setMetingVervers] = useState(0)
  // Welke zoek-/filtercombinatie de lijst nu toont. "Meer laden" verschijnt
  // alleen als die gelijk is aan wat er op het scherm staat — tijdens de
  // debounce na een filterwissel zou hij anders een pagina van het oude filter
  // achter de nieuwe lijst plakken.
  const [geladenSleutel, setGeladenSleutel] = useState<string | null>(null)
  // Volgnummer per lading: een antwoord dat na een nieuwere aanvraag binnenkomt, wordt genegeerd.
  const laadSeq = useRef(0)
  const [teVerwijderen, setTeVerwijderen] = useState<{ id: string; title: string } | null>(null)
  const [verwijderen, setVerwijderen] = useState(false)

  // Active system prompt state
  const [activePrompt, setActivePrompt] = useState('')
  const [showActivePrompt, setShowActivePrompt] = useState(false)

  // Pipeline status state (cron-runs + bron-gezondheid)
  const [ingestStatus, setIngestStatus] = useState<IngestStatus | null>(null)
  const [showSourceHealth, setShowSourceHealth] = useState(false)

  // Debounce ref for search
  const searchTimeoutRef = useRef<NodeJS.Timeout>(undefined)

  const clearStatus = useCallback(() => {
    setStatus(null)
  }, [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(clearStatus, 4000)
      return () => clearTimeout(timer)
    }
  }, [status, clearStatus])

  // ── Load articles from DB ──────────────────────────────────────────

  // Pagina 0 vervangt de lijst; een volgende pagina ("Meer laden") voegt toe.
  const loadArticles = useCallback(async (
    search: string,
    filter: { status: string; rekenend: boolean },
    pagina = 0,
  ) => {
    const seq = ++laadSeq.current
    const sleutel = JSON.stringify([search, filter.status, filter.rekenend])
    if (pagina === 0) setDbLoading(true)
    else setDbMeerLaden(true)
    try {
      const params = new URLSearchParams({ pagina: String(pagina) })
      if (search) params.set('search', search)
      if (filter.status) params.set('status', filter.status)
      if (filter.rekenend) params.set('rekenend', '1')
      const res = await fetch(`/api/admin/news-articles?${params}`)
      if (!res.ok) throw new Error('Failed to load')
      const data = await res.json()
      if (seq !== laadSeq.current) return
      const nieuw: DbArticle[] = data.articles || []
      setDbArticles(prev => {
        if (pagina === 0) return nieuw
        // Schuift een ingest de sortering tussen twee pagina's door, dan komt
        // een rij twee keer: niet dubbel tonen.
        const gezien = new Set(prev.map(a => a.id))
        return [...prev, ...nieuw.filter(a => !gezien.has(a.id))]
      })
      setDbTotal(data.total || 0)
      setDbPagina(pagina)
      setDbHeeftMeer(Boolean(data.heeftMeer))
      setGeladenSleutel(sleutel)
    } catch {
      if (seq === laadSeq.current && pagina === 0) setDbArticles([])
    } finally {
      if (seq === laadSeq.current) {
        setDbLoading(false)
        setDbMeerLaden(false)
      }
    }
  }, [])

  // Debounced search/filter — reload articles when search term or filter changes
  useEffect(() => {
    clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      loadArticles(dbSearch, { status: statusFilter, rekenend: alleenRekenend })
    }, 400)
    return () => clearTimeout(searchTimeoutRef.current)
  }, [dbSearch, statusFilter, alleenRekenend, loadArticles])

  // ── Load pipeline status (cron-runs + bron-health) ────────────────

  const loadIngestStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/news-ingest')
      if (!res.ok) return
      const data = await res.json()
      setIngestStatus({ runs: data.runs || [], sourceHealth: data.sourceHealth || null })
    } catch {
      // status is informatief — stil falen
    }
  }, [])

  // Load sources and articles in parallel on mount
  useEffect(() => {
    async function loadSources() {
      try {
        const res = await fetch('/api/admin/news-sources')
        if (!res.ok) throw new Error('Failed to load sources')
        const data = await res.json()
        const hasWeb = Array.isArray(data.webSources) && data.webSources.length > 0
        const hasRss = Array.isArray(data.rssFeeds) && data.rssFeeds.length > 0

        if (hasWeb || hasRss) {
          // Saved sources exist — use them
          const opgeslagen = naarBronnen(data.webSources || [], data.rssFeeds || [])
          setBronnen(opgeslagen)
          setSavedBronnen(opgeslagen)
        } else {
          // No saved sources — show defaults for initial setup
          setBronnen(STANDAARD_BRONNEN)
          setSavedBronnen(null)
        }
      } catch {
        // On failure, show defaults
        setBronnen(STANDAARD_BRONNEN)
        setSavedBronnen(null)
      } finally {
        setSourcesLoading(false)
      }
    }

    loadSources()
    loadIngestStatus()
  }, [loadIngestStatus])

  // ── Sources handlers ─────────────────────────────────────────────

  /** Check if sources have unsaved changes compared to saved state */
  const hasSourceChanges = JSON.stringify(bronnen) !== JSON.stringify(savedBronnen ?? STANDAARD_BRONNEN)

  /** De laatste gezondheid per bron-URL, zodat elke bron in de editor zijn oorzaak toont. */
  const gezondheidPerUrl = new Map((ingestStatus?.sourceHealth?.sources ?? []).map((s) => [s.url, s]))

  async function handleResetSources() {
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-sources', { method: 'DELETE' })
      if (!res.ok) throw new Error('Reset mislukt')
      setBronnen(STANDAARD_BRONNEN)
      setSavedBronnen(null)
      setStatus({ type: 'success', message: 'Opgeslagen bronnen gewist — de ingest draait weer op de standaardlijst' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Reset mislukt' })
    }
  }

  async function handleSaveSources() {
    setSourcesSaving(true)
    setStatus(null)
    try {
      const { body, herkomst } = splitsBronnen(bronnen)
      setFoutRij(null)
      const res = await fetch('/api/admin/news-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const melding = typeof data?.error === 'string' ? data.error : 'Bronnen opslaan mislukt'
        const naarRij = foutNaarRij(melding, herkomst)
        if (naarRij) setFoutRij(naarRij.rij)
        throw new Error(naarRij ? naarRij.tekst : melding)
      }
      setSavedBronnen(bronnen.map((b) => ({ ...b })))
      setStatus({ type: 'success', message: 'Nieuwsbronnen opgeslagen — de volgende ingest gebruikt deze lijst' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Bronnen opslaan mislukt' })
    } finally {
      setSourcesSaving(false)
    }
  }

  // ── Bronnen-editor ───────────────────────────────────────────────

  function updateBron(index: number, veld: 'url' | 'label', value: string) {
    setBronnen(prev => prev.map((b, i) => (i === index ? { ...b, [veld]: value } : b)))
  }

  function updateBronSoort(index: number, soort: BronSoort) {
    setBronnen(prev => prev.map((b, i) => (i === index ? { ...b, soort } : b)))
  }

  function removeBron(index: number) {
    setBronnen(prev => prev.filter((_, i) => i !== index))
  }

  function addBron() {
    // Standaard de veilige lezing: een themapagina kiest geen links en maakt alleen bij een wijziging een artikel.
    setBronnen(prev => [...prev, { url: '', label: '', soort: 'web_pagina' }])
  }

  // ── DB article handlers ──────────────────────────────────────────

  async function handleIngest() {
    setIngesting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-ingest', { method: 'POST' })
      if (!res.ok) throw new Error('Ophalen mislukt')
      const data = await res.json()
      const s = data.summary
      setStatus({
        type: 'success',
        message: `${s.inserted} nieuw · ${s.alBekend ?? 0} al bekend · ${s.duplicatesSkipped ?? 0} dubbel${s.skipped ? ` · ${s.skipped} niet geschreven` : ''}${s.uitgesteld ? ` · ${s.uitgesteld} uitgesteld naar de volgende run` : ''} (${s.rssArticlesFound ?? 0} uit RSS, ${s.webArticlesExtracted ?? 0} uit web) uit ${s.sourcesChecked} bronnen`,
      })
      loadArticles(dbSearch, { status: statusFilter, rekenend: alleenRekenend })
      loadIngestStatus()
      setMetingVervers(v => v + 1)
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Ophalen mislukt' })
    } finally {
      setIngesting(false)
    }
  }

  async function bevestigVerwijderen() {
    if (!teVerwijderen) return
    const { id } = teVerwijderen
    setVerwijderen(true)
    try {
      const res = await fetch('/api/admin/news-articles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(typeof data?.error === 'string' ? data.error : 'Verwijderen mislukt')
      }
      setDbArticles(prev => prev.filter(a => a.id !== id))
      setDbTotal(prev => prev - 1)
      setMetingVervers(v => v + 1)
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Verwijderen mislukt' })
    } finally {
      setVerwijderen(false)
      setTeVerwijderen(null)
    }
  }

  /** Een geduid of teruggetrokken artikel verwijder je niet (ADR 0171): de route weigert het ook. */
  function isVerwijderbaar(status: string): boolean {
    return status !== 'geduid' && status !== 'teruggetrokken'
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-[var(--ink-3)]" />
          <h2 className="text-xl font-bold text-[var(--ink)]">Nieuws</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Beheer de systeemprompt en nieuwsbronnen voor nieuwssamenvattingen
        </p>
      </div>

      {/* Status message */}
      {status && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
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

      {/* ── Section: Actieve Systeemprompt (read-only) ────────────── */}
      <div className="mb-8">
        <div className="rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]">
          <button
            type="button"
            onClick={() => {
              if (!activePrompt) {
                fetch('/api/admin/news-active-prompt')
                  .then(r => r.json())
                  .then(d => setActivePrompt(d.prompt || ''))
                  .catch(() => setActivePrompt('Kon prompt niet laden.'))
              }
              setShowActivePrompt(!showActivePrompt)
            }}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Actieve systeemprompt (alleen-lezen)</span>
            </div>
            {showActivePrompt ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showActivePrompt && (
            <div className="border-t border-[var(--border-ed)] px-4 py-3">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--ink-3)]">
                {activePrompt || 'Laden...'}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Section: Pipeline-status ──────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--ink-3)]" />
          <h3 className="text-lg font-bold text-[var(--ink)]">Pipeline-status</h3>
        </div>

        {/* Laatste automatische/handmatige runs */}
        {ingestStatus === null ? (
          <p className="text-sm text-[var(--ink-4)]">Laden...</p>
        ) : ingestStatus.runs.length === 0 ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              De dagelijkse cron heeft nog nooit een run gelogd. Controleer de Vercel-cron-configuratie
              en de <code className="font-mono text-xs">CRON_SECRET</code>-omgevingsvariabele — zonder
              werkende cron worden bronnen alleen ververst als je hier handmatig op &quot;Bronnen ophalen&quot; klikt.
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {ingestStatus.runs.map((run, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border-ed)] px-4 py-2.5 text-sm"
              >
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    run.status === 'success' ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${run.status === 'success' ? LEVERAGE_STATUS_DOT.good : LEVERAGE_STATUS_DOT.bad}`} />
                  {run.status === 'success' ? 'Geslaagd' : 'Mislukt'}
                </span>
                <span className="font-mono text-xs text-[var(--ink-4)]">
                  {new Date(run.started_at).toLocaleString('nl-NL')}
                </span>
                {run.status === 'success' && run.summary ? (
                  <span className="text-[var(--ink-3)]">
                    {run.summary.inserted ?? 0} nieuw
                    {run.summary.alBekend !== undefined && <> · {run.summary.alBekend} al bekend</>}
                    {run.summary.uitgesteld ? <> · {run.summary.uitgesteld} uitgesteld</> : null}
                    {' '}· {run.summary.duplicatesSkipped ?? 0} dubbel ·{' '}
                    {run.summary.sourcesChecked ?? 0} bronnen
                    {run.summary.duiding && (
                      <>
                        {' '}· duiding: {run.summary.duiding.geduid ?? 0} geduid, {run.summary.duiding.afgewezen ?? 0}{' '}
                        afgewezen, {run.summary.duiding.mislukt ?? 0} mislukt, {run.summary.duiding.overgeslagen ?? 0}{' '}
                        overgeslagen, {run.summary.duiding.wacht ?? 0} wacht
                      </>
                    )}
                  </span>
                ) : run.error ? (
                  <span className="text-red-700">{run.error}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Per-bron gezondheid (collapsible) */}
        {ingestStatus?.sourceHealth && (
          <div className="mt-3 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)]">
            <button
              type="button"
              onClick={() => setShowSourceHealth(!showSourceHealth)}
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors"
            >
              <span>
                Bron-gezondheid — laatste controle{' '}
                {new Date(ingestStatus.sourceHealth.checkedAt).toLocaleString('nl-NL')}
                {' · '}
                {ingestStatus.sourceHealth.sources.filter((s) => s.items === 0).length} van{' '}
                {ingestStatus.sourceHealth.sources.length} bronnen leverde niets
              </span>
              {showSourceHealth ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showSourceHealth && (
              <div className="max-h-80 overflow-auto border-t border-[var(--border-ed)]">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-[var(--border-ed)]">
                    {[...ingestStatus.sourceHealth.sources]
                      .sort((a, b) => a.items - b.items || a.label.localeCompare(b.label, 'nl'))
                      .map((source, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2">
                            <span className={`mr-2 inline-block h-2 w-2 rounded-full ${oorzaakStip(source)}`} />
                            {source.label}
                            <span className="block pl-4 text-xs text-[var(--ink-4)]">
                              {oorzaakTekst(source)}
                              {source.afgekapt ? ` · ${source.afgekapt} boven de cap niet meegenomen` : ''}
                              {source.geweigerd ? ` · ${source.geweigerd} linkkeuzes geweigerd` : ''}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-[var(--ink-4)]">
                            {source.soort ? BRON_SOORT_LABEL[source.soort] : source.type.toUpperCase()}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[var(--ink-3)]">
                            {source.items} gevonden
                            {source.nieuw !== undefined && <span className="block text-xs text-[var(--ink-4)]">{source.nieuw} nieuw</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section: Nieuwsbronnen (één lijst, vaste bronsoort per bron — ADR 0176) ── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-[var(--ink-3)]" />
          <h3 className="text-lg font-bold text-[var(--ink)]">Nieuwsbronnen</h3>
          <span className="ml-auto text-xs text-[var(--ink-4)]">
            {savedBronnen === null ? 'standaardlijst (niets opgeslagen)' : 'opgeslagen lijst'}
          </span>
        </div>
        <p className="mb-2 text-sm text-[var(--ink-3)]">
          Elke bron levert artikelen voor beide edities (de AI-editie op /nieuws en de Krant). De soort bepaalt
          wat de ingest als één artikel ziet; de kop en de datum komen altijd van de bron, nooit van het model.
        </p>
        <ul className="mb-4 space-y-1 text-xs text-[var(--ink-3)]">
          {BRON_SOORTEN.map((s) => (
            <li key={s}>
              <span className="font-medium text-[var(--ink-2)]">{BRON_SOORT_LABEL[s]}</span> — {BRON_SOORT_UITLEG[s].effect}{' '}
              <span className="text-[var(--ink-4)]">{BRON_SOORT_UITLEG[s].waarom}</span>
            </li>
          ))}
        </ul>

        {sourcesLoading ? (
          <p className="text-sm text-[var(--ink-4)]">Laden...</p>
        ) : (
          <div className="space-y-3">
            {bronnen.map((bron, index) => {
              const gezondheid = gezondheidPerUrl.get(bron.url)
              return (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        value={bron.label}
                        onChange={(e) => updateBron(index, 'label', e.target.value)}
                        placeholder="Label (bijv. CBS — Prijzen)"
                        aria-label={`Label van bron ${index + 1}${bron.label ? ` (${bron.label})` : ''}`}
                        aria-invalid={foutRij === index || undefined}
                        className={`${inputClassName} sm:w-1/4`}
                      />
                      <input
                        type="url"
                        value={bron.url}
                        onChange={(e) => updateBron(index, 'url', e.target.value)}
                        placeholder="https://..."
                        aria-label={`Adres van bron ${index + 1}${bron.label ? ` (${bron.label})` : ''}`}
                        aria-invalid={foutRij === index || undefined}
                        className={`${inputClassName} flex-1`}
                      />
                      <select
                        value={bron.soort}
                        onChange={(e) => updateBronSoort(index, e.target.value as BronSoort)}
                        aria-label={`Soort van bron ${index + 1}${bron.label ? ` (${bron.label})` : ''}`}
                        className={`${inputClassName} sm:w-48`}
                      >
                        {BRON_SOORTEN.map((s) => (
                          <option key={s} value={s}>{BRON_SOORT_LABEL[s]}</option>
                        ))}
                      </select>
                    </div>
                    {foutRij === index && (
                      <p className="pl-1 text-xs text-negative" role="alert">
                        Deze bron hield het opslaan tegen — zie de melding bovenaan.
                      </p>
                    )}
                    {gezondheid && (
                      <p className="flex items-center gap-2 pl-1 text-xs text-[var(--ink-4)]">
                        <span className={`inline-block h-2 w-2 rounded-full ${oorzaakStip(gezondheid)}`} />
                        Laatste run: {oorzaakTekst(gezondheid)} · {gezondheid.items} gevonden
                        {gezondheid.nieuw !== undefined ? ` · ${gezondheid.nieuw} nieuw` : ''}
                        {gezondheid.soort && gezondheid.soort !== bron.soort ? ` · gedraaid als ${BRON_SOORT_LABEL[gezondheid.soort]}` : ''}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBron(index)}
                    className="mt-2.5 flex-shrink-0 rounded-lg p-2 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-600"
                    title="Verwijderen"
                    aria-label={`Verwijder bron ${index + 1}${bron.label ? ` (${bron.label})` : bron.url ? ` (${bron.url})` : ''}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={addBron}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <Plus className="h-4 w-4" />
              Bron toevoegen
            </button>
          </div>
        )}
      </div>

      {/* ── Sources action buttons ───────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSaveSources}
          disabled={sourcesSaving || sourcesLoading || !hasSourceChanges}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {sourcesSaving ? 'Opslaan...' : 'Bronnen opslaan'}
        </button>
        <button
          onClick={handleResetSources}
          disabled={sourcesSaving || sourcesLoading}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border-ed)] px-5 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          Reset naar standaard
        </button>
        {hasSourceChanges && (
          <span className="text-xs font-medium text-amber-600">
            Niet-opgeslagen wijzigingen
          </span>
        )}
      </div>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div className="mt-10 mb-6 h-px bg-[var(--border-ed)]" />

      {/* ── Section: Meting duiding (K1-poort, ADR 0171) ──────────── */}
      <NewsDuidingMetingPanel ververs={metingVervers} />

      {/* ── Section: Meting schaduweditie (K1-poort kaart 1B, ADR 0173) ── */}
      <KrantMetingPanel ververs={metingVervers} />

      {/* ── Section: Nieuws Database ──────────────────────────────── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-5 w-5 text-[var(--ink-3)]" />
          <h3 className="text-lg font-bold text-[var(--ink)]">Nieuws Database</h3>
          <span className="ml-auto text-xs text-[var(--ink-4)]">{dbTotal} artikelen</span>
        </div>
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          Alle opgehaalde nieuwsartikelen uit de bronnen, nieuwste eerst. Artikelen worden 120 dagen
          bewaard en daarna bij de ingest automatisch verwijderd. Klik een artikel open voor de duiding
          met per getal het citaat uit de bron.
        </p>

        {/* Search + Ingest controls */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-4)]" />
            <input
              type="text"
              value={dbSearch}
              onChange={(e) => setDbSearch(e.target.value)}
              placeholder="Zoek op titel, samenvatting of bron..."
              className={`${inputClassName} pl-10`}
            />
          </div>
          <button
            onClick={handleIngest}
            disabled={ingesting}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--ink)] px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
          >
            <RefreshCw className={`h-4 w-4 ${ingesting ? 'animate-spin' : ''}`} />
            {ingesting ? 'Ophalen...' : 'Bronnen ophalen'}
          </button>
        </div>

        {/* Duiding-filters */}
        <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-[var(--ink-3)]">
            Duiding
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[44px] border border-[var(--border-ed)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
            >
              <option value="">Alle</option>
              {DUIDING_STATUSSEN.map(s => (
                <option key={s} value={s}>{DUIDING_STATUS_LABEL[s] ?? s}</option>
              ))}
            </select>
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-[var(--ink-3)]">
            <input type="checkbox" checked={alleenRekenend} onChange={(e) => setAlleenRekenend(e.target.checked)} />
            Alleen rekenende mechanismen (nalopen voor de poort)
          </label>
        </div>

        {/* Table */}
        {dbLoading ? (
          <p className="text-sm text-[var(--ink-4)]">Laden...</p>
        ) : dbArticles.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-ed)] px-6 py-8 text-center text-sm text-[var(--ink-4)]">
            {dbSearch
              ? 'Geen artikelen gevonden voor deze zoekopdracht.'
              : 'Nog geen artikelen opgehaald. Klik op "Bronnen ophalen" om te starten.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--border-ed)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
                  <th className="px-3 py-2.5 text-left font-medium text-[var(--ink-3)]">Titel</th>
                  <th className="px-3 py-2.5 text-left font-medium text-[var(--ink-3)]">Bron</th>
                  <th className="hidden px-3 py-2.5 text-left font-medium text-[var(--ink-3)] sm:table-cell">Categorie</th>
                  <th className="px-3 py-2.5 text-left font-medium text-[var(--ink-3)]">Duiding</th>
                  <th className="hidden px-3 py-2.5 text-left font-medium text-[var(--ink-3)] lg:table-cell">Impact</th>
                  <th className="px-3 py-2.5 text-left font-medium text-[var(--ink-3)]">Datum</th>
                  <th className="w-16 px-3 py-2.5 text-center font-medium text-[var(--ink-3)]">Gebruikt</th>
                  <th className="w-10 px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-ed)]">
                {dbArticles.map(article => {
                  const isExpanded = expandedArticleId === article.id
                  return (
                    <Fragment key={article.id}>
                      <tr
                        className="cursor-pointer transition-colors hover:bg-[var(--subtle)]"
                        onClick={() => setExpandedArticleId(isExpanded ? null : article.id)}
                      >
                        <td className="px-3 py-2.5 text-[var(--ink)]">
                          <span className="line-clamp-2">{article.title}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink-3)]">{article.source_name}</td>
                        <td className="hidden px-3 py-2.5 text-[var(--ink-3)] sm:table-cell">
                          {article.category || '\u2014'}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2.5 text-xs font-medium ${statusKleur(article.duiding_status)}`}>
                          {DUIDING_STATUS_LABEL[article.duiding_status] ?? article.duiding_status}
                          {article.duiding?.ok && article.duiding.duiding.mechanisme ? (
                            <span className="block font-normal text-[var(--ink-4)]">{article.duiding.duiding.mechanisme.label}</span>
                          ) : null}
                        </td>
                        <td className="hidden px-3 py-2.5 text-xs text-[var(--ink-3)] lg:table-cell">
                          <span className="line-clamp-2">{article.potential_impact || '\u2014'}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-[var(--ink-4)]">
                          {article.published_at
                            ? new Date(article.published_at).toLocaleDateString('nl-NL')
                            : '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {article.is_used ? (
                            <span className="inline-block h-2 w-2 rounded-full bg-green-400" title="Gebruikt" />
                          ) : (
                            <span className="inline-block h-2 w-2 rounded-full bg-[var(--ink-4)]/30" title="Niet gebruikt" />
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {isVerwijderbaar(article.duiding_status) && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setTeVerwijderen({ id: article.id, title: article.title }) }}
                              className="rounded p-1 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-600"
                              title="Verwijderen"
                              aria-label={`Verwijder ${article.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="border-t border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 px-4 py-3">
                            <div className="space-y-2 text-sm">
                              {article.summary && (
                                <div>
                                  <span className="font-medium text-[var(--ink-3)]">Samenvatting</span>
                                  <p className="mt-0.5 text-[var(--ink-2)]">{article.summary}</p>
                                </div>
                              )}
                              {article.potential_impact && (
                                <div>
                                  <span className="font-medium text-[var(--ink-3)]">Impact op gebruiker</span>
                                  <p className="mt-0.5 text-[var(--ink-2)]">{article.potential_impact}</p>
                                </div>
                              )}
                              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[var(--ink-4)]">
                                <span>Bron: {article.source_name}</span>
                                {article.category && <span>Categorie: {article.category}</span>}
                                <span>Opgehaald: {new Date(article.fetched_at).toLocaleDateString('nl-NL')}</span>
                                {safeHttpUrl(article.source_url) && (
                                  <a
                                    href={safeHttpUrl(article.source_url) ?? undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline decoration-[var(--ink-4)]/30 underline-offset-2 hover:text-[var(--ink-2)]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Bekijk origineel &rarr;
                                  </a>
                                )}
                              </div>
                              <NewsDuidingDetail
                                articleId={article.id}
                                titel={article.title}
                                velden={article}
                                onGewijzigd={(melding, wijziging) => {
                                  setStatus(melding)
                                  // Rij ter plekke bijwerken: de lijst blijft op dezelfde
                                  // pagina en het artikel blijft open (naloop per artikel).
                                  if (wijziging) {
                                    setDbArticles(prev => prev.map(a => (a.id === article.id ? { ...a, ...wijziging } : a)))
                                  }
                                  setMetingVervers(v => v + 1)
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {dbHeeftMeer && !dbLoading && geladenSleutel === JSON.stringify([dbSearch, statusFilter, alleenRekenend]) && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => loadArticles(dbSearch, { status: statusFilter, rekenend: alleenRekenend }, dbPagina + 1)}
              disabled={dbMeerLaden}
              className="inline-flex min-h-[44px] items-center gap-2 border border-[var(--border-ed)] px-5 py-2.5 text-sm font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)] disabled:opacity-40"
            >
              {dbMeerLaden ? 'Laden...' : 'Meer laden'}
            </button>
            <span className="text-xs text-[var(--ink-4)]">{dbArticles.length} van {dbTotal}</span>
          </div>
        )}
      </div>

      {/* ── Divider ─────────────────────────────────────────────────── */}
      <div className="mt-10 mb-6 h-px bg-[var(--border-ed)]" />

      {/* ── Section: Feedback op nieuwsitems (alleen-lezen, ADR 0113) ─ */}
      <NewsFeedbackPanel />

      <ShellOverlay
        kind="confirm"
        destructive
        open={teVerwijderen !== null}
        onClose={() => setTeVerwijderen(null)}
        onRequestClose={() => !verwijderen}
        title="Artikel verwijderen?"
        footer={
          <ModalFooter
            layout="stacked"
            primary={{ label: 'Verwijderen', onClick: () => void bevestigVerwijderen(), loading: verwijderen }}
            secondary={{ label: 'Annuleren', onClick: () => setTeVerwijderen(null), disabled: verwijderen }}
          />
        }
      >
        <div className="space-y-2 p-6 text-sm text-[var(--ink-2)]">
          <p>
            Je verwijdert <span className="font-semibold text-[var(--ink)]">{teVerwijderen?.title}</span> uit de artikelbak.
          </p>
          <p>Staat het artikel nog in de bron, dan kan de volgende ingest het opnieuw ophalen.</p>
        </div>
      </ShellOverlay>
    </div>
  )
}
