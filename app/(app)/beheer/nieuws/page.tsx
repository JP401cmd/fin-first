'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Newspaper, Save, RotateCcw, Check, AlertCircle, ChevronDown, ChevronUp, Globe, Rss, Plus, Trash2, Database, Search, RefreshCw, FileText, Activity } from 'lucide-react'
import {
  DEFAULT_WEB_SOURCES,
  DEFAULT_RSS_FEEDS,
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
  type: 'rss' | 'web'
  items: number
  error?: string
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
  const [webSources, setWebSources] = useState<WebSource[]>([])
  const [rssFeeds, setRssFeeds] = useState<RssFeed[]>([])
  const [savedWebSources, setSavedWebSources] = useState<WebSource[] | null>(null)
  const [savedRssFeeds, setSavedRssFeeds] = useState<RssFeed[] | null>(null)
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
          setWebSources(data.webSources || [])
          setRssFeeds(data.rssFeeds || [])
          setSavedWebSources(data.webSources || [])
          setSavedRssFeeds(data.rssFeeds || [])
        } else {
          // No saved sources — show defaults for initial setup
          setWebSources(DEFAULT_WEB_SOURCES)
          setRssFeeds(DEFAULT_RSS_FEEDS)
          setSavedWebSources(null)
          setSavedRssFeeds(null)
        }
      } catch {
        // On failure, show defaults
        setWebSources(DEFAULT_WEB_SOURCES)
        setRssFeeds(DEFAULT_RSS_FEEDS)
        setSavedWebSources(null)
        setSavedRssFeeds(null)
      } finally {
        setSourcesLoading(false)
      }
    }

    loadSources()
    loadIngestStatus()
  }, [loadIngestStatus])

  // ── Sources handlers ─────────────────────────────────────────────

  /** Check if sources have unsaved changes compared to saved state */
  const hasSourceChanges = (() => {
    const currentWeb = JSON.stringify(webSources)
    const currentRss = JSON.stringify(rssFeeds)
    const savedWeb = savedWebSources !== null
      ? JSON.stringify(savedWebSources)
      : JSON.stringify(DEFAULT_WEB_SOURCES)
    const savedRss = savedRssFeeds !== null
      ? JSON.stringify(savedRssFeeds)
      : JSON.stringify(DEFAULT_RSS_FEEDS)
    return currentWeb !== savedWeb || currentRss !== savedRss
  })()

  async function handleResetSources() {
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-sources', { method: 'DELETE' })
      if (!res.ok) throw new Error('Reset mislukt')
      setWebSources(DEFAULT_WEB_SOURCES)
      setRssFeeds(DEFAULT_RSS_FEEDS)
      setSavedWebSources(null)
      setSavedRssFeeds(null)
      setStatus({ type: 'success', message: 'Standaard bronnen hersteld — klik "Bronnen opslaan" om op te slaan' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Reset mislukt' })
    }
  }

  async function handleSaveSources() {
    setSourcesSaving(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webSources, rssFeeds }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Bronnen opslaan mislukt')
      }
      setSavedWebSources([...webSources])
      setSavedRssFeeds([...rssFeeds])
      setStatus({ type: 'success', message: 'Nieuwsbronnen opgeslagen' })
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Bronnen opslaan mislukt' })
    } finally {
      setSourcesSaving(false)
    }
  }

  // ── Web source list helpers ──────────────────────────────────────

  function updateWebSource(index: number, field: 'url' | 'label', value: string) {
    setWebSources(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  function removeWebSource(index: number) {
    setWebSources(prev => prev.filter((_, i) => i !== index))
  }

  function addWebSource() {
    setWebSources(prev => [...prev, { url: '', label: '' }])
  }

  // ── RSS feed list helpers ────────────────────────────────────────

  function updateRssFeed(index: number, field: 'url' | 'label', value: string) {
    setRssFeeds(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f))
  }

  function removeRssFeed(index: number) {
    setRssFeeds(prev => prev.filter((_, i) => i !== index))
  }

  function addRssFeed() {
    setRssFeeds(prev => [...prev, { url: '', label: '' }])
  }

  // ── DB article handlers ──────────────────────────────────────────

  async function handleIngest() {
    setIngesting(true)
    setStatus(null)
    try {
      const res = await fetch('/api/admin/news-ingest', { method: 'POST' })
      if (!res.ok) throw new Error('Ophalen mislukt')
      const data = await res.json()
      setStatus({
        type: 'success',
        message: `${data.summary.inserted} nieuwe artikelen (${data.summary.rssArticlesFound ?? '?'} RSS, ${data.summary.webArticlesExtracted ?? '?'} web, ${data.summary.duplicatesSkipped ?? 0} duplicaten overgeslagen) uit ${data.summary.sourcesChecked} bronnen`,
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
                  <span className={`h-2 w-2 rounded-full ${run.status === 'success' ? 'bg-green-400' : 'bg-red-400'}`} />
                  {run.status === 'success' ? 'Geslaagd' : 'Mislukt'}
                </span>
                <span className="font-mono text-xs text-[var(--ink-4)]">
                  {new Date(run.started_at).toLocaleString('nl-NL')}
                </span>
                {run.status === 'success' && run.summary ? (
                  <span className="text-[var(--ink-3)]">
                    {run.summary.inserted ?? 0} nieuw · {run.summary.duplicatesSkipped ?? 0} duplicaten ·{' '}
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
                      .sort((a, b) => a.items - b.items)
                      .map((source, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2">
                            <span
                              className={`mr-2 inline-block h-2 w-2 rounded-full ${
                                source.error ? 'bg-red-400' : source.items === 0 ? 'bg-amber-400' : 'bg-green-400'
                              }`}
                            />
                            {source.label}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs uppercase text-[var(--ink-4)]">{source.type}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[var(--ink-3)]">
                            {source.items} items
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

      {/* ── Section: Nieuwsbronnen — Websites ─────────────────────── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-[var(--ink-3)]" />
          <h3 className="text-lg font-bold text-[var(--ink)]">Nieuwsbronnen — Websites</h3>
        </div>
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          Webpagina&apos;s waarvan context wordt opgehaald als aanvulling op de nieuwsgeneratie.
        </p>

        {sourcesLoading ? (
          <p className="text-sm text-[var(--ink-4)]">Laden...</p>
        ) : (
          <div className="space-y-3">
            {webSources.map((source, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={source.label}
                    onChange={(e) => updateWebSource(index, 'label', e.target.value)}
                    placeholder="Label (bijv. Rijksoverheid)"
                    className={`${inputClassName} sm:w-1/3`}
                  />
                  <input
                    type="url"
                    value={source.url}
                    onChange={(e) => updateWebSource(index, 'url', e.target.value)}
                    placeholder="https://..."
                    className={`${inputClassName} flex-1`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeWebSource(index)}
                  className="mt-2.5 flex-shrink-0 rounded-lg p-2 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Verwijderen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addWebSource}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <Plus className="h-4 w-4" />
              Bron toevoegen
            </button>
          </div>
        )}
      </div>

      {/* ── Section: Nieuwsbronnen — RSS Feeds ────────────────────── */}
      <div className="mb-8">
        <div className="mb-4 flex items-center gap-2">
          <Rss className="h-5 w-5 text-[var(--ink-3)]" />
          <h3 className="text-lg font-bold text-[var(--ink)]">Nieuwsbronnen — RSS Feeds</h3>
        </div>
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          RSS-feeds waarvan artikelen worden opgehaald en als basis dienen voor de nieuwsberichten.
        </p>

        {sourcesLoading ? (
          <p className="text-sm text-[var(--ink-4)]">Laden...</p>
        ) : (
          <div className="space-y-3">
            {rssFeeds.map((feed, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={feed.label}
                    onChange={(e) => updateRssFeed(index, 'label', e.target.value)}
                    placeholder="Label (bijv. NOS Economie)"
                    className={`${inputClassName} sm:w-1/3`}
                  />
                  <input
                    type="url"
                    value={feed.url}
                    onChange={(e) => updateRssFeed(index, 'url', e.target.value)}
                    placeholder="https://..."
                    className={`${inputClassName} flex-1`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRssFeed(index)}
                  className="mt-2.5 flex-shrink-0 rounded-lg p-2 text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Verwijderen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRssFeed}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-dashed border-[var(--border-ed)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] transition-colors hover:border-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)]"
            >
              <Plus className="h-4 w-4" />
              Feed toevoegen
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
                                {article.source_url && (
                                  <a
                                    href={article.source_url}
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
