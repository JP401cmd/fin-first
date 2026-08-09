'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Newspaper, Loader2, RefreshCw, AlertCircle, Cpu } from 'lucide-react'
import { AiPrivacyIndicator } from '@/components/app/ai-privacy-indicator'
import { Masthead } from './masthead'
import { SectionHeading } from './section-heading'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { NewspaperFooter } from './newspaper-footer'
import { HeroNewsArticle, NewsArticle, NewsSkeletonLoader } from './news-components'
import { ArchiveSection } from './archive-section'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import type { LocalNewsProgress } from '@/lib/ai/local/local-news-resolver'
import { LOCAL_NEWS_MAX_ITEMS } from '@/lib/ai/local/local-news-select'
import { useLocalNewsEdition } from './use-local-news-edition'
import { useDisplayMode } from '@/lib/hooks/use-display-mode'
import type { NewsItem } from '@/lib/news-item'

// ── News cache (client-side) ────────────────────────────────────────
// Duplicated from berichten-client.tsx intentionally — the two pages
// may evolve independently and share the same localStorage key so a
// user switching between them still benefits from cached data.
//
// LET OP: deze cache hoort bij het CLOUDPAD. De on-device editie wordt
// server-side bewaard (/api/local-news-edition) en raakt deze sleutel niet aan —
// anders zou een lokaal samengestelde editie in de cloud-cache belanden.

const NEWS_LOCAL_CACHE_KEY = 'trifinity_news_cache'
const NEWS_CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

interface LocalNewsCache {
  items: NewsItem[]
  fetchedAt: number
  generatedAt?: string
  sourceCount?: number
  editionNr?: number
  jaargang?: number
}

function getLocalNewsCache(): {
  items: NewsItem[]
  generatedAt?: string
  sourceCount?: number
  editionNr?: number
  jaargang?: number
} | null {
  try {
    const raw = localStorage.getItem(NEWS_LOCAL_CACHE_KEY)
    if (!raw) return null
    const cache: LocalNewsCache = JSON.parse(raw)
    if (Date.now() - cache.fetchedAt > NEWS_CACHE_TTL_MS) return null
    return {
      items: cache.items,
      generatedAt: cache.generatedAt,
      sourceCount: cache.sourceCount,
      editionNr: cache.editionNr,
      jaargang: cache.jaargang,
    }
  } catch {
    return null
  }
}

function setLocalNewsCache(
  items: NewsItem[],
  generatedAt?: string,
  sourceCount?: number,
  editionNr?: number,
  jaargang?: number,
): void {
  try {
    const cache: LocalNewsCache = { items, fetchedAt: Date.now(), generatedAt, sourceCount, editionNr, jaargang }
    localStorage.setItem(NEWS_LOCAL_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // Silent fail — localStorage might be full
  }
}

// ── Voortgang van de on-device generatie ─────────────────────────────
// Nooit een kale spinner: ~12 scoring-calls plus tot 8 schrijf-calls duren twee
// tot vier minuten, dus de gebruiker hoort per fase te zien hoe ver het is.
// Determinate voortgang → `role="progressbar"` met `aria-valuetext`; bewust GEEN
// aria-live, anders ratelt een schermlezer twintig keer dezelfde regel af.

function progressLabel(progress: LocalNewsProgress | null): string {
  if (!progress) return 'Bronnen ophalen'
  const { phase, done, total } = progress
  return phase === 'scoren'
    ? `Bronnen wegen — ${done} van ${total}`
    : `Berichten schrijven — ${done} van ${total}`
}

/**
 * Percentage over BEIDE fasen samen, altijd oplopend.
 *
 * `LocalNewsProgress.done/total` telt bewust PER FASE (zie local-news-resolver).
 * Dat percentage rechtstreeks tonen laat de balk terugspringen zodra 'scoren'
 * klaar is en 'schrijven' bij 1 van 5 begint — en een teruglopende balk leest als
 * "er ging iets mis", juist tijdens de langste wachttijd van de app.
 *
 * De weging is geen schatting maar een telling: de resolver doet één call per
 * bronartikel (scoring) plus één call per gekozen bericht (schrijven, hoogstens
 * `LOCAL_NEWS_MAX_ITEMS`). Zolang de schrijf-fase nog niet weet hoeveel berichten
 * het worden, rekenen we met dat maximum — dan kan de balk aan de fasegrens
 * hooguit vooruit springen, nooit terug.
 */
function progressPct(progress: LocalNewsProgress | null, scoringTotal?: number): number {
  if (!progress || progress.total <= 0) return 0
  const scoring =
    scoringTotal && scoringTotal > 0
      ? scoringTotal
      : progress.phase === 'scoren'
        ? progress.total
        : 0

  if (progress.phase === 'scoren') {
    const denom = scoring + LOCAL_NEWS_MAX_ITEMS
    return denom > 0 ? Math.round((Math.min(progress.done, scoring) / denom) * 100) : 0
  }
  const denom = scoring + progress.total
  return denom > 0
    ? Math.min(100, Math.round(((scoring + progress.done) / denom) * 100))
    : 0
}

function LocalGenerationProgress({
  progress,
  scoringTotal,
}: {
  progress: LocalNewsProgress | null
  /** Aantal bronartikelen = aantal scoring-calls; nodig om beide fasen te wegen. */
  scoringTotal?: number
}) {
  const label = progressLabel(progress)
  const pct = progressPct(progress, scoringTotal)
  // De eerstvolgende modelcall na een koude start is een GPU-warmup: die kan
  // tientallen seconden stil staan op "0 van 12". Zeg dat, anders lijkt het
  // vastgelopen. Bewust geen "de eerste keer" — dit geldt ook na een herstart.
  const coldStart = !progress || (progress.phase === 'scoren' && progress.done === 0)

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] tabular-nums text-[var(--ink-3)]">
          {label}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-4)]">{pct}%</span>
      </div>
      <div
        className="mt-1.5 h-[3px] w-full bg-[var(--subtle)]"
        role="progressbar"
        aria-label="Voortgang van je persoonlijke editie"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={label}
      >
        <div
          className="h-full bg-[var(--module-active-500)]"
          style={{ width: `${pct}%`, transition: 'width 700ms cubic-bezier(.22,1,.36,1)' }}
        />
      </div>
      {coldStart && (
        <p className="mt-2 font-source-serif text-[12px] italic leading-relaxed text-[var(--ink-4)]">
          Het model moet eerst opstarten — dat kan even duren.
        </p>
      )}
    </div>
  )
}

// ── Fail-closed: lokaal gewenst, maar dit toestel kan het niet ───────
// Nooit stil terugvallen op /api/news — dat zou precies de privacybelofte
// breken die deze architectuur moet waarmaken. Wel de concrete reden tonen plus
// twee uitwegen: opnieuw bepalen, of het model regelen via Mijn → Privacy.

function LocalUnavailableNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center shadow-[var(--s0)]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--subtle)]">
        <Cpu className="h-6 w-6 text-[var(--ink-3)]" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
          Je editie kan nog niet op dit toestel worden samengesteld
        </p>
        <p className="mx-auto max-w-sm font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-4)]">
          {message}
        </p>
      </div>
      <p className="mx-auto max-w-sm font-inter text-[11px] leading-relaxed text-[var(--ink-4)]">
        Er is niets naar onze servers gestuurd — je nieuws wordt alleen op je eigen toestel samengesteld.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="flex min-h-[44px] items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:bg-[var(--subtle)] hover:shadow-[var(--s1)] active:scale-[0.98] sm:min-h-0"
        >
          <RefreshCw className="h-4 w-4" />
          Opnieuw proberen
        </button>
        <Link
          href="/mijn/privacy"
          className="flex min-h-[44px] items-center rounded-[var(--r)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink-2)] underline underline-offset-4 transition-colors hover:text-[var(--ink)] sm:min-h-0"
        >
          Naar Mijn &rsaquo; Privacy
        </Link>
      </div>
    </div>
  )
}

// ── News-only client component ───────────────────────────────────────
// Stripped-down version of BerichtenClient that renders ONLY the
// TriFinity Post (news articles + archive). No briefing, no
// notifications, no section anchors.
//
// TWEE PADEN, ÉÉN PAGINA. `useExecutionMode('nieuws')` bepaalt waar de editie
// vandaan komt. De vier toestanden zijn niet uitwisselbaar:
//   'cloud'     → het bestaande pad via /api/news (ongewijzigd);
//   'lokaal'    → on-device generatie via useLocalNewsEdition;
//   'resolving' → we weten het nog niet; er vertrekt NIETS (geen /api/news,
//                 geen lokale generatie) — alleen een neutrale laadtoestand;
//   'blocked'   → lokaal gewenst maar onhaalbaar; de reden tonen, nooit
//                 terugvallen op de cloud.
// De gate loopt via `canUseCloud`/`canUseLocal`, niet via een eigen
// `status === 'lokaal'`-vergelijking — dat is de fail-closed-garantie.

export function NieuwsOnlyClient() {
  // Weergavemodus — stuurt alleen de masthead-reductie (NWS-1) aan.
  const simple = useDisplayMode().mode === 'simple'
  // ── News state ──
  const [newsItems, setNewsItems] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [newsError, setNewsError] = useState<string | null>(null)
  const [newsFetched, setNewsFetched] = useState(false)
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [newsTab, setNewsTab] = useState<'current' | 'archive'>('current')
  const [editionNr, setEditionNr] = useState<number | undefined>()
  const [jaargang, setJaargang] = useState<number | undefined>()
  const [refreshesRemaining, setRefreshesRemaining] = useState<number | undefined>()
  const [generating, setGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<string | undefined>()
  const [sourceCount, setSourceCount] = useState<number | undefined>()

  // ── Waar draait deze editie? ──
  const execution = useExecutionMode('nieuws')
  const isLocal = execution.status === 'lokaal'
  const isCloud = execution.status === 'cloud'
  const modeResolved = isCloud || isLocal
  // De hook start pas op een expliciet lokaal-groen licht; in 'resolving' en
  // 'blocked' blijft hij dus stil.
  const local = useLocalNewsEdition(execution.canUseLocal)

  // ── Read article tracking ──
  useEffect(() => {
    fetch('/api/news/read')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.readIds) setReadArticleIds(new Set(data.readIds))
      })
      .catch(() => { /* Silent fail */ })
  }, [])

  const markArticleRead = useCallback((articleId: string) => {
    setReadArticleIds((prev) => {
      if (prev.has(articleId)) return prev
      const next = new Set(prev)
      next.add(articleId)
      return next
    })
    fetch('/api/news/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId }),
    }).catch(() => { /* Silent fail */ })
  }, [])

  // ── Fetch news (initial load) ──
  const fetchNews = useCallback(async () => {
    if (newsFetched) return
    const cached = getLocalNewsCache()
    if (cached) {
      setNewsItems(cached.items)
      if (cached.generatedAt) setGeneratedAt(cached.generatedAt)
      if (cached.sourceCount !== undefined) setSourceCount(cached.sourceCount)
      if (cached.editionNr !== undefined) setEditionNr(cached.editionNr)
      if (cached.jaargang !== undefined) setJaargang(cached.jaargang)
      setNewsFetched(true)
      return
    }
    setNewsLoading(true)
    setNewsError(null)
    try {
      const res = await fetch('/api/news')
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()

      if (data.status === 'generating') {
        setGenerating(true)
        setNewsLoading(false)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        return
      }

      const items: NewsItem[] = data.items ?? data
      setNewsItems(items)
      setLocalNewsCache(items, data.generatedAt, data.sourceCount, data.editionNr, data.jaargang)
      setNewsFetched(true)
      if (data.editionNr) setEditionNr(data.editionNr)
      if (data.jaargang) setJaargang(data.jaargang)
      if (data.generatedAt) setGeneratedAt(data.generatedAt)
      if (data.sourceCount !== undefined) setSourceCount(data.sourceCount)
      if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
    } finally {
      setNewsLoading(false)
    }
  }, [newsFetched])

  // ── Refresh news (manual) ──
  const refreshNews = useCallback(async () => {
    // Fail-closed: een verversing is een cloud-generatie. Alleen bij een
    // expliciet cloud-groen licht.
    if (!execution.canUseCloud) return
    try { localStorage.removeItem(NEWS_LOCAL_CACHE_KEY) } catch { /* noop */ }
    // Keep current items visible — use overlay instead of clearing
    setRefreshing(true)
    setNewsError(null)
    try {
      const res = await fetch('/api/news?refresh=1')
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
        if (res.status === 429) {
          setRefreshesRemaining(0)
          setNewsError(data.error ?? 'Verversing limiet bereikt')
          setRefreshing(false)
          return
        }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()

      if (data.status === 'generating') {
        setGenerating(true)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        // Don't clear refreshing — polling will handle it
        return
      }

      const items: NewsItem[] = data.items ?? data
      setNewsItems(items)
      setLocalNewsCache(items, data.generatedAt, data.sourceCount, data.editionNr, data.jaargang)
      setNewsFetched(true)
      setRefreshing(false)
      if (data.editionNr) setEditionNr(data.editionNr)
      if (data.jaargang) setJaargang(data.jaargang)
      if (data.generatedAt) setGeneratedAt(data.generatedAt)
      if (data.sourceCount !== undefined) setSourceCount(data.sourceCount)
      if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
    } catch (err) {
      setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
      setRefreshing(false)
    }
  }, [execution.canUseCloud])

  // News-only users have AI enabled by definition — fetch zodra vaststaat dat
  // deze editie via de cloud hoort te komen. In 'resolving'/'blocked'/'lokaal'
  // vertrekt er niets naar /api/news.
  useEffect(() => {
    if (!execution.canUseCloud) return
    fetchNews()
  }, [fetchNews, execution.canUseCloud])

  // ── Poll for background generation — handles partial items progressively ──
  useEffect(() => {
    if (!execution.canUseCloud) return
    if (!generating) return
    const poll = async () => {
      try {
        const res = await fetch('/api/news')
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Onbekende fout' }))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }
        const data = await res.json()

        if (data.status === 'generating') {
          // Show partial items as they arrive
          if (data.items?.length) {
            setNewsItems(data.items)
            if (!newsFetched) setNewsFetched(true)
          }
          if (data.editionNr) setEditionNr(data.editionNr)
          if (data.jaargang) setJaargang(data.jaargang)
          return // Keep polling
        }

        // Generation complete — final items arrived
        const items: NewsItem[] = data.items ?? data
        setNewsItems(items)
        setLocalNewsCache(items, data.generatedAt, data.sourceCount, data.editionNr, data.jaargang)
        setNewsFetched(true)
        setGenerating(false)
        setRefreshing(false)
        if (data.editionNr) setEditionNr(data.editionNr)
        if (data.jaargang) setJaargang(data.jaargang)
        if (data.generatedAt) setGeneratedAt(data.generatedAt)
        if (data.sourceCount !== undefined) setSourceCount(data.sourceCount)
        if (data.refreshesRemaining !== undefined) setRefreshesRemaining(data.refreshesRemaining)
      } catch (err) {
        setNewsError(err instanceof Error ? err.message : 'Nieuws kon niet worden geladen')
        setGenerating(false)
        setRefreshing(false)
      }
    }
    // Visibility-guard (egress-reductie): niet doorpollen in een verborgen
    // tab — generatie loopt server-side gewoon door, bij terugkeren pakt de
    // eerstvolgende poll de tussenstand weer op.
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      poll()
    }, 4000)
    return () => clearInterval(interval)
  }, [generating, newsFetched, execution.canUseCloud])

  // ── Eén weergavemodel voor beide paden ──
  // De JSX hieronder leest uitsluitend deze afgeleiden, zodat cloud- en
  // lokaal-pad exact dezelfde krantopmaak delen.
  const viewItems = isLocal ? local.items : newsItems
  const viewLoading = isLocal ? local.status === 'laden' : newsLoading
  const viewFetched = isLocal ? local.status !== 'laden' : newsFetched
  const viewGenerating = isLocal ? local.status === 'genereren' : generating
  const viewError = isLocal ? local.error : newsError
  const viewBusy = isLocal ? local.status === 'genereren' : refreshing
  const viewEditionNr = isLocal ? local.editionNr : editionNr
  const viewJaargang = isLocal ? local.jaargang : jaargang
  const viewGeneratedAt = isLocal ? local.generatedAt : generatedAt
  const viewSourceCount = isLocal ? local.sourceCount : sourceCount

  const handleRefresh = isLocal ? local.regenerate : refreshNews
  // Cloud-retry moet de fetch ECHT hervatten. Alleen de state terugzetten werkte
  // niet: `newsFetched` is na een mislukte fetch al false, dus `setNewsFetched(false)`
  // is een no-op, de identiteit van `fetchNews` (useCallback op [newsFetched])
  // verandert niet en het effect draait niet opnieuw — "Opnieuw proberen" deed
  // dan zichtbaar niets. We roepen 'm daarom rechtstreeks aan.
  const handleRetry = isLocal
    ? local.regenerate
    : () => {
        setNewsError(null)
        setNewsFetched(false)
        void fetchNews()
      }

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <PageInfoButton
        description={PAGE_INFO['/nieuws']}
        className="absolute right-4 top-5 sm:right-6 sm:top-8"
      />
      {/* NWS-1 — in Eenvoudig draagt de masthead alleen datum + "N artikelen".
          Editienummer, jaargang en de bronartikelen-grondslag zijn transparantie
          over hóé de krant tot stand komt; die horen bij Volledig. */}
      <Masthead
        editionNr={viewEditionNr}
        jaargang={viewJaargang}
        hideEdition={simple}
        articleCount={newsTab === 'current' ? viewItems.length : undefined}
        updatedAt={newsTab === 'current' ? viewGeneratedAt : undefined}
        sourceNote={
          !simple && newsTab === 'current' && viewSourceCount !== undefined
            ? `Gebaseerd op ${viewSourceCount} ${viewSourceCount === 1 ? 'bronartikel' : 'bronartikelen'}`
            : undefined
        }
      />

      {/* ── FINANCIEEL NIEUWS ──────────────────────────── */}
      <section className="mt-4">
        <SectionHeading label="Financieel Nieuws" />

        <div className="space-y-6">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] flex items-center gap-1.5">
                Gepersonaliseerd nieuws
                {/* De groepskeuze wint van de hoofdschakelaar: staat 'nieuws' op
                    lokaal, dan is "draait op je toestel" het eerlijke label —
                    ook als privé-modus globaal uit staat (en andersom). */}
                <AiPrivacyIndicator
                  size={12}
                  localMode={modeResolved ? isLocal : undefined}
                />
                {isLocal && (
                  <span className="font-normal normal-case tracking-normal text-[var(--ink-4)]">
                    · op je eigen toestel
                  </span>
                )}
              </span>
              <div className="h-px flex-1 bg-[var(--border-ed)]" />
              {modeResolved && viewFetched && !viewLoading && !viewBusy && (
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={viewBusy || (!isLocal && refreshesRemaining === 0)}
                  className="flex min-h-[44px] items-center gap-1.5 rounded-[var(--r)] px-2 py-1 font-inter text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] disabled:opacity-50 sm:min-h-0"
                  title={
                    isLocal
                      ? 'Stel een nieuwe editie samen op dit toestel (duurt een paar minuten)'
                      : refreshesRemaining === 0
                        ? 'Verversing limiet bereikt'
                        : 'Ververs nieuws'
                  }
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    Ververs{!isLocal && refreshesRemaining !== undefined ? ` (${refreshesRemaining} over)` : ''}
                  </span>
                </button>
              )}
            </div>

            {/* ── Tab bar: Huidige editie / Archief ──
                Ook zichtbaar bij 'blocked': het archief is bewaarde leesstof en
                heeft geen generatie nodig, dus een toestel dat lokaal niet kan
                samenstellen hoort niet in een doodlopende straat te staan. */}
            {((modeResolved && viewFetched && !viewLoading) || execution.status === 'blocked') && (
              <div className="mb-4 flex gap-1 rounded-[var(--r)] bg-[var(--subtle)] p-1" role="tablist">
                <button
                  role="tab"
                  aria-selected={newsTab === 'current'}
                  onClick={() => setNewsTab('current')}
                  className={`flex-1 rounded-[var(--r-sm)] px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    newsTab === 'current'
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  Huidige editie
                </button>
                <button
                  role="tab"
                  aria-selected={newsTab === 'archive'}
                  onClick={() => setNewsTab('archive')}
                  className={`flex-1 rounded-[var(--r-sm)] px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    newsTab === 'archive'
                      ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
                      : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                  }`}
                >
                  Archief
                </button>
              </div>
            )}

            {newsTab === 'current' ? (
              <>
                <style>{`
                  @keyframes news-reveal {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  .news-reveal-item { animation: news-reveal 0.4s ease-out both; }
                  @media (prefers-reduced-motion: reduce) {
                    .news-reveal-item { animation: none; }
                  }
                `}</style>

                {execution.status === 'resolving' ? (
                  /* Neutrale laadtoestand: de voorkeur is nog niet bekend, dus er
                     vertrekt niets — geen /api/news en geen lokale generatie. */
                  <>
                    <p className="sr-only" aria-live="polite">
                      Bezig met bepalen waar je editie wordt samengesteld.
                    </p>
                    <NewsSkeletonLoader />
                  </>
                ) : execution.status === 'blocked' ? (
                  <LocalUnavailableNotice
                    message={execution.message ?? 'Lokale AI is nu niet beschikbaar op dit toestel.'}
                    onRetry={execution.refresh}
                  />
                ) : viewLoading ? (
                  <NewsSkeletonLoader />
                ) : !viewFetched && !viewError && viewGenerating ? (
                  <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-16 text-center shadow-[var(--s0)]">
                    <div className="relative">
                      <Newspaper className="h-10 w-10 text-[var(--ink-4)]" />
                      <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin text-[var(--ink-3)]" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                        Fin stelt je persoonlijke editie samen&hellip;
                      </p>
                      <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                        Elk artikel wordt afgestemd op jouw financi&euml;le situatie
                      </p>
                    </div>
                  </div>
                ) : !viewFetched && !viewError ? (
                  /* VANGNET — er is nog nooit iets opgehaald. Zonder deze tak
                     valt deze toestand door naar de lege-editie-kaart, en die
                     beweert "geen nieuws met impact op jouw situatie": een
                     feitelijke uitspraak over iemands geld terwijl er niets is
                     getoetst. Dat gebeurt op het cloudpad zowel bij binnenkomst
                     (één render vóór het fetch-effect draait) als blijvend
                     wanneer /api/news faalt. Liever een skeleton dan een
                     onwaar bericht. */
                  <NewsSkeletonLoader />
                ) : viewError && !(isLocal && viewItems.length > 0) ? (
                  /* Lokaal met al gemaakte berichten valt hier bewust NIET in:
                     een mislukte verversing mag de editie die er staat niet
                     wegnemen — die fout komt als strip ónder de artikelen. */
                  <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-12 text-center shadow-[var(--s0)]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--subtle)]">
                      <AlertCircle className="h-6 w-6 text-[var(--ink-3)]" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                        Nieuws kon niet worden geladen
                      </p>
                      <p className="font-source-serif text-[13px] italic text-[var(--ink-4)]">
                        {viewError}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="flex min-h-[44px] items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:bg-[var(--subtle)] hover:shadow-[var(--s1)] active:scale-[0.98] sm:min-h-0"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Opnieuw proberen
                    </button>
                  </div>
                ) : isLocal && viewGenerating && viewItems.length === 0 ? (
                  /* Lokaal, nog geen bericht binnen. Geen blokkerende spinner maar
                     concrete voortgang — dit duurt twee tot vier minuten. */
                  <div className="flex flex-col items-center gap-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-6 py-16 text-center shadow-[var(--s0)]">
                    <div className="relative">
                      <Newspaper className="h-10 w-10 text-[var(--ink-4)]" />
                      <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin text-[var(--ink-3)]" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                        Je editie wordt op je eigen toestel samengesteld
                      </p>
                      <p className="mx-auto max-w-sm font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-4)]">
                        Dat duurt een paar minuten. Je gegevens blijven op je toestel — er gaat niets naar een AI-leverancier. Berichten verschijnen zodra ze klaar zijn.
                      </p>
                    </div>
                    <LocalGenerationProgress progress={local.progress} scoringTotal={local.sourceCount} />
                  </div>
                ) : viewItems.length > 0 ? (
                  <div className="relative">
                    {refreshing && !isLocal && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--r-lg)] bg-[var(--paper)]/70 backdrop-blur-[2px]">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--ink-3)]" />
                        <span className="ml-2 font-source-serif text-sm italic text-[var(--ink-2)]">
                          Nieuwe editie wordt samengesteld&hellip;
                        </span>
                      </div>
                    )}
                    <div className="news-reveal-item">
                      <HeroNewsArticle item={viewItems[0]} isRead={readArticleIds.has(viewItems[0].id)} onMarkRead={markArticleRead} />
                    </div>
                    {viewItems.length > 1 && (
                      <div className="news-grid-columns grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                        {viewItems.slice(1).map((item, index) => (
                          <div
                            key={item.id}
                            className="news-reveal-item"
                            style={{ animationDelay: `${(index + 1) * 120}ms` }}
                          >
                            <NewsArticle item={item} isRead={readArticleIds.has(item.id)} onMarkRead={markArticleRead} />
                          </div>
                        ))}
                      </div>
                    )}
                    {isLocal && viewError && (
                      /* De editie die er staat blijft leesbaar; alleen het
                         samenstellen is misgegaan. */
                      <div
                        role="alert"
                        className="mt-5 flex flex-col items-center gap-3 border-t border-[var(--border-ed)] pt-4 text-center"
                      >
                        {/* Twee losse zinnen: de servertekst hoeft niet op een punt
                            te eindigen, dus nooit met een dubbele punt aanplakken. */}
                        <p className="font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-3)]">
                          Het samenstellen op je toestel is gestopt. {viewError} De berichten hierboven zijn wel bewaard.
                        </p>
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="flex min-h-[44px] items-center gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-2 font-inter text-sm font-medium text-[var(--ink)] shadow-[var(--s0)] transition-all hover:bg-[var(--subtle)] hover:shadow-[var(--s1)] active:scale-[0.98] sm:min-h-0"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Opnieuw proberen
                        </button>
                      </div>
                    )}
                    {viewGenerating && (
                      isLocal ? (
                        /* Lokaal blijft de al gemaakte editie gewoon leesbaar; de
                           voortgang staat eronder in plaats van eroverheen. */
                        <div className="mt-5 flex flex-col items-center gap-2 border-t border-[var(--border-ed)] pt-4">
                          {/* Zelfde framing als het cloudpad: een Ververs bouwt een
                              nieuwe editie, hij vult de bestaande niet aan. */}
                          <span className="font-source-serif text-[13px] italic text-[var(--ink-3)]">
                            Nieuwe editie wordt samengesteld op je eigen toestel&hellip;
                          </span>
                          <LocalGenerationProgress progress={local.progress} scoringTotal={local.sourceCount} />
                        </div>
                      ) : (
                        <div className="mt-4 flex items-center justify-center gap-2 py-3 text-[var(--ink-4)]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="font-source-serif text-[13px] italic">Meer artikelen worden samengesteld&hellip;</span>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] px-8 py-16 text-center shadow-[var(--s0)]">
                    <Newspaper className="h-8 w-8 text-[var(--ink-4)]" />
                    <p className="font-inter text-sm font-medium text-[var(--ink-2)]">
                      Geen nieuws met impact op jouw situatie
                    </p>
                    <p className="max-w-sm font-source-serif text-[13px] italic leading-relaxed text-[var(--ink-4)]">
                      {viewSourceCount
                        ? `Fin heeft ${viewSourceCount} bronartikelen getoetst aan je financiële profiel — geen ervan raakt je situatie op dit moment. Dat is goed nieuws: geen actie nodig.`
                        : 'Er zijn op dit moment geen bronartikelen om te toetsen. Zodra er nieuws is dat jouw situatie raakt, verschijnt het hier.'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <ArchiveSection />
            )}
          </div>
        </div>
      </section>

      <NewspaperFooter />
    </div>
  )
}
