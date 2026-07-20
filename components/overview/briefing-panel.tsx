'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp,
  Lightbulb,
  Calendar,
  AlertTriangle,
  Sparkles,
  LineChart,
  RefreshCw,
  ArrowUpRight,
  Share2,
  Lock,
  type LucideIcon,
} from 'lucide-react'
import { HEFBOOM_CONFIG, type Hefboom } from '@/lib/hefboom-config'
import { formatTimestamp } from '@/lib/format'
import { ShareDialog, type ShareContent } from '@/components/app/share-dialog'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { AiSubscriptionUpsell } from '@/components/app/ai-subscription-upsell'
import { VrijheidsbriefingHero } from './vrijheidsbriefing-hero'
import type { FreedomHeroProps } from '@/lib/briefing/overview-briefing'
import type { FreedomCardData } from '@/components/app/freedom-card'

/**
 * BriefingPanel — de "wekelijkse briefing" op /overzicht. Toont een 3-koloms
 * grid (max 6) met door de briefing-engine gegenereerde kaartjes. Elke kaart
 * heeft een categorie-kicker, kleur-accent (linkerrail) en optioneel een href
 * voor doorklikken.
 *
 * Wekelijks karakter (mei 2026):
 *   De briefing wordt server-side per ISO-week (Amsterdam) vastgezet en krijgt
 *   een "Bijgewerkt …"-stempel. De gebruiker mag de briefing daarnaast 1× per
 *   dag handmatig verversen via de Ververs-knop; daarna staat die tot de
 *   volgende dag uit. Het oude "Fin — jouw briefing" samenvattende blok is
 *   verwijderd ten gunste van beter vormgegeven losse kaartjes.
 *
 * Categorieën (6 stuks):
 *   - observation  WAT VALT OP    emerald  TrendingUp
 *   - tip          EEN TIP        violet   Lightbulb
 *   - upcoming     KOMENDE MAAND  sky      Calendar
 *   - heads_up     HEADS-UP       amber    AlertTriangle
 *   - milestone    MIJLPAAL       fuchsia  Sparkles
 *   - market       MARKT          slate    LineChart
 *
 * Span (visueel onderscheid voor verschillende prioriteit):
 *   - 'narrow'  → 1 kolom (default)
 *   - 'wide'    → 2 kolommen (breekt visueel uit, voor headline-items)
 */

export type BriefingCategory =
  | 'observation'
  | 'tip'
  | 'upcoming'
  | 'heads_up'
  | 'milestone'
  | 'market'

export type BriefingSpan = 'narrow' | 'wide'

/** Backwards-compatible alias — gedeelde definitie staat in
 *  `lib/hefboom-config.ts`. */
export type HefboomTag = Hefboom

export interface BriefingEntry {
  /** Unieke key voor React-list-key. */
  id: string
  category: BriefingCategory
  /** Eén-zin body — primaire boodschap. */
  text: string
  /** Optionele href voor doorklikken naar context. */
  href?: string
  /** Visuele span — 'wide' = 2-kolom-card, 'narrow' = 1-kolom (default). */
  span?: BriefingSpan
  /** Optionele hefboom-tag. Wanneer aanwezig: mini-icoon naast kicker. */
  hefboom?: HefboomTag
  /** Optionele impact-metadata (freedom-days + EUR-effect uit recommendation). */
  impact?: {
    freedomDaysPerYear?: number | null
    euroPerYear?: number | null
  }
}

/** Eén afgesloten week uit de briefing-historie (bewaard in de snapshot,
 *  gecapt — zie lib/briefing/snapshot.ts). */
export interface BriefingWeekHistoryItem {
  /** ISO-week-sleutel 'YYYY-Www'. */
  week: string
  headline?: string
  entries: BriefingEntry[]
  /** Vrijheidsdagen-stand van die week (voor de mini-samenvatting). */
  freedomDays?: number
}

const CATEGORY_CONFIG: Record<
  BriefingCategory,
  { label: string; dotColor: string; bar: string; Icon: LucideIcon }
> = {
  observation: { label: 'Wat valt op', dotColor: 'bg-emerald-500', bar: 'bg-emerald-400', Icon: TrendingUp },
  tip:         { label: 'Een tip',      dotColor: 'bg-violet-500',  bar: 'bg-violet-400',  Icon: Lightbulb },
  upcoming:    { label: 'Binnenkort',   dotColor: 'bg-sky-500',     bar: 'bg-sky-400',     Icon: Calendar },
  heads_up:    { label: 'Heads-up',     dotColor: 'bg-amber-500',   bar: 'bg-amber-400',   Icon: AlertTriangle },
  milestone:   { label: 'Mijlpaal',     dotColor: 'bg-fuchsia-500', bar: 'bg-fuchsia-400', Icon: Sparkles },
  market:      { label: 'Markt',        dotColor: 'bg-slate-500',   bar: 'bg-slate-400',   Icon: LineChart },
}

/** Maximum aantal kaartjes — 3-koloms × 2 rijen = 6. */
const MAX_BRIEFING_ENTRIES = 6

/** Lees het gedeelde privacy-niveau (zelfde key als de vrijheidskaart-generator). */
function readPrivacyLevel(): 'anonymous' | 'named' | 'full' {
  try {
    const s = typeof window !== 'undefined' ? localStorage.getItem('trifinity_privacy_level') : null
    if (s === 'anonymous' || s === 'named' || s === 'full') return s
  } catch {
    /* localStorage niet beschikbaar */
  }
  return 'anonymous'
}

/** Bouw de ShareContent-tekst uit de vrijheidskaart-data. */
function buildShareContent(data: FreedomCardData): ShareContent {
  const pct = data.freedomPercentage != null ? `${data.freedomPercentage}%` : 'N/B'
  const daysWon = data.freedomDaysWonThisMonth ?? data.freedomDaysWon
  return {
    title: 'Mijn TriFinity vrijheidsweek',
    text: `Mijn financiële vrijheid: ${pct} · ${daysWon} vrijheidsdagen · FIRE: ${data.fireCountdown?.label ?? 'N/B'} #TriFinity`,
    url: typeof window !== 'undefined' ? window.location.origin : '',
    contentType: 'freedom_card',
    privacyLevel: data.privacyLevel,
  }
}

export function BriefingPanel({
  entries,
  refreshedAt,
  dataChanged = false,
  canRefresh = false,
  freedomHero,
  headline,
  weekHistory,
  simpleMode = false,
}: {
  entries: BriefingEntry[]
  /** ISO-tijdstip waarop de briefing voor vandaag is vastgezet ("Bijgewerkt …"). */
  refreshedAt?: string | null
  /** Live cijfers wijken af van het bevroren weekbeeld (server berekent de
   *  delta) → toon een kalme freshness-hint onder de stempel. */
  dataChanged?: boolean
  /** Of de handmatige ververs vandaag nog beschikbaar is (max 1×/dag). */
  canRefresh?: boolean
  /** Vrijheidstijd-hero bovenaan (week-over-week delta). Optioneel. */
  freedomHero?: FreedomHeroProps | null
  /** Eén-zin kop onder de titel (deterministisch of AI bij ververs). */
  headline?: string | null
  /** Afgesloten weken uit de snapshot-historie (nieuwste laatst). */
  weekHistory?: BriefingWeekHistoryItem[]
  /**
   * Eenvoudige weergave (display_mode === 'simple'): verberg de
   * "Jouw vrijheid deze week"-hero en toon enkel het belangrijkste briefje
   * (de eerste entry, door de engine al op prioriteit geordend) over de volle
   * breedte. Default false → ongewijzigde, volledige briefing.
   */
  simpleMode?: boolean
}) {
  // Override-state: alleen gezet ná een succesvolle handmatige ververs. Zonder
  // override blijven de server-props de bron van waarheid — remount-veilig.
  const [override, setOverride] = useState<{
    entries: BriefingEntry[]
    refreshedAt: string
    headline: string | null
  } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [usedToday, setUsedToday] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Defensieve upsell-vlag: getoond wanneer een ververs-POST alsnog 403 geeft
  // (stale client-subscriptions) — geen retry-lus, wél de AI-propositie.
  const [showUpsell, setShowUpsell] = useState(false)

  // AI-redactie van de briefing (de Ververs-knop → Fin's stem + AI-kop) is een
  // betaalde functie; de deterministische briefing eronder blijft gratis. Spiegel
  // de server-gate (checkTierGate 'ai') op active_subscriptions, niet op een module.
  const { subscriptions } = useModuleAccess()
  const hasAi = subscriptions.includes('ai')

  // Deel-state: de canvas-renderer wordt dynamisch geïmporteerd bij de eerste
  // klik zodat de tekencode buiten de initiële /overzicht-bundle blijft.
  const [sharing, setSharing] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareData, setShareData] = useState<FreedomCardData | null>(null)
  const [shareRenderer, setShareRenderer] = useState<
    ((d: FreedomCardData) => HTMLCanvasElement | Promise<HTMLCanvasElement>) | null
  >(null)

  // In Eenvoudig tonen we alleen het belangrijkste briefje (1, over de volle
  // breedte); anders het volledige grid (max 6).
  const entryLimit = simpleMode ? 1 : MAX_BRIEFING_ENTRIES
  const shownEntries = (override?.entries ?? entries).slice(0, entryLimit)
  const shownRefreshedAt = override?.refreshedAt ?? refreshedAt ?? null
  const shownHeadline = override?.headline ?? headline ?? null
  const refreshable = canRefresh && !usedToday && !refreshing

  async function handleShare() {
    if (sharing) return
    setSharing(true)
    setError(null)
    try {
      const [res, mod] = await Promise.all([
        fetch(`/api/share/freedom-card?privacy=${readPrivacyLevel()}`),
        import('@/components/app/freedom-card'),
      ])
      if (!res.ok) throw new Error('Kon je vrijheidskaart niet genereren')
      const data: FreedomCardData = await res.json()
      setShareData(data)
      setShareRenderer(() => mod.renderFreedomCardToCanvas)
      setShareOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delen mislukt')
    } finally {
      setSharing(false)
    }
  }

  async function handleRefresh() {
    if (!refreshable) return
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/briefing/refresh', { method: 'POST' })
      const data = await res.json()
      if (res.status === 403) {
        // AI-abonnement vereist (defense-in-depth): geen foutmelding of retry,
        // maar de upsell tonen. De knop wordt hierna niet meer aangeboden.
        setShowUpsell(true)
        setUsedToday(true)
        return
      }
      if (!res.ok) throw new Error(data?.error ?? 'Verversen mislukt')
      if (data.allowed && Array.isArray(data.entries)) {
        setOverride({
          entries: data.entries,
          refreshedAt: data.refreshedAt,
          headline: data.headline ?? null,
        })
      } else if (data.allowed === false) {
        // Stille no-op zichtbaar maken: zonder dit lijkt de spinner "niets te
        // doen" wanneer de dag-poort de ververs al had verbruikt.
        setNotice('Je hebt vandaag al ververst — morgen weer beschikbaar.')
      }
      // Of de ververs nu nieuwe content opleverde of al gebruikt was: vandaag
      // is de knop hierna uitgeput.
      setUsedToday(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verversen mislukt')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div id="briefing" className="mt-6 scroll-mt-20">
      {freedomHero && !simpleMode && <VrijheidsbriefingHero {...freedomHero} />}
      <BriefingHeader
        refreshedAt={shownRefreshedAt}
        headline={shownHeadline}
        // Na een geslaagde ververs (override) is het weekbeeld weer actueel.
        dataChanged={dataChanged && !override}
        refreshable={refreshable}
        refreshing={refreshing}
        showRefresh={canRefresh || usedToday}
        hasAi={hasAi}
        onRefresh={handleRefresh}
        onShare={handleShare}
        sharing={sharing}
      />

      {error && (
        <p className="mb-3 text-[11px] text-rose-600" role="status">
          {error}
        </p>
      )}
      {!error && notice && (
        <p className="mb-3 text-[11px] text-[var(--ink-3)]" role="status">
          {notice}
        </p>
      )}
      {showUpsell && (
        <div className="mb-3">
          <AiSubscriptionUpsell variant="inline" />
        </div>
      )}

      {shownEntries.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-3 sm:p-4 sm:col-span-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--ink-4)]" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Briefing
              </span>
            </div>
            <p className="text-sm text-[var(--ink-3)] italic leading-snug">
              Nog onvoldoende data voor een briefing — vul je hefbomen aan en
              check binnenkort terug voor je eerste samenvatting.
            </p>
          </article>
        </div>
      ) : (
        <div
          className={
            simpleMode
              ? 'grid grid-cols-1 gap-3 sm:gap-4'
              : 'grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4'
          }
        >
          {shownEntries.map((entry, i) => (
            <BriefingCard key={entry.id} entry={entry} index={i} />
          ))}
        </div>
      )}

      {weekHistory && weekHistory.length > 0 && (
        <BriefingWeekHistory items={weekHistory} />
      )}

      {shareOpen && shareData && shareRenderer && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          content={buildShareContent(shareData)}
          renderCanvas={() => shareRenderer(shareData)}
        />
      )}
    </div>
  )
}

/** 'YYYY-Www' → 'Week ww'. */
function formatWeekLabel(week: string): string {
  const n = Number(week.split('-W')[1])
  return Number.isFinite(n) ? `Week ${n}` : week
}

/**
 * Bescheiden terugblik op voorbije weken (uit de snapshot-historie, max 8).
 * Een native <details>-disclosure: standaard dicht, geen JS-state nodig.
 */
function BriefingWeekHistory({ items }: { items: BriefingWeekHistoryItem[] }) {
  // Nieuwste eerst tonen.
  const reversed = [...items].reverse()
  return (
    <details className="mt-4 group print:hidden">
      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>{' '}
        Vorige weken ({reversed.length})
      </summary>
      <div className="mt-3 space-y-3">
        {reversed.map((item) => (
          <article
            key={item.week}
            className="rounded-2xl border border-[var(--border-md)] bg-[var(--subtle)] p-3 sm:p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
                {formatWeekLabel(item.week)}
              </h3>
              {item.freedomDays != null && (
                <span className="text-[11px] text-[var(--ink-3)] tabular-nums">
                  {Math.round(item.freedomDays)} vrijheidsdagen
                </span>
              )}
            </div>
            {item.headline && (
              <p className="mt-1 text-[13px] text-[var(--ink-2)] leading-snug">{item.headline}</p>
            )}
            <ul className="mt-2 space-y-1">
              {item.entries.map((e) => (
                <li key={e.id} className="text-[12px] leading-snug text-[var(--ink-3)]">
                  <span className="text-[var(--ink-4)]">·</span> {e.text}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </details>
  )
}

/**
 * Sectiekop boven het briefing-grid: titel + "Bijgewerkt …"-stempel links,
 * Ververs-knop rechts. Vervangt het oude Fin-narratief-blok als visuele
 * identiteit van de briefing.
 */
function BriefingHeader({
  refreshedAt,
  headline,
  dataChanged,
  refreshable,
  refreshing,
  showRefresh,
  hasAi,
  onRefresh,
  onShare,
  sharing,
}: {
  refreshedAt: string | null
  headline: string | null
  dataChanged: boolean
  refreshable: boolean
  refreshing: boolean
  showRefresh: boolean
  /** Heeft de gebruiker het AI-abonnement? Zo niet: Ververs wordt een upsell. */
  hasAi: boolean
  onRefresh: () => void
  onShare: () => void
  sharing: boolean
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-serif text-lg sm:text-xl font-semibold leading-tight text-[var(--ink)]">
          Jouw wekelijkse briefing
        </h2>
        {headline && (
          <p className="mt-1 text-[13px] sm:text-sm text-[var(--ink-2)] leading-snug">
            {headline}
          </p>
        )}
        {refreshedAt && (
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)] tabular-nums">
            Bijgewerkt {formatTimestamp(refreshedAt)}
            {dataChanged && (
              <span className="ml-1.5 text-amber-700">
                · je cijfers zijn sindsdien veranderd
                {refreshable ? ' — ververs voor de actuele stand' : ''}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={onShare}
          disabled={sharing}
          title="Deel je vrijheidsweek"
          aria-label="Deel je vrijheidsweek"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Share2
            className={`h-3.5 w-3.5 ${sharing ? 'animate-pulse' : ''}`}
            aria-hidden="true"
          />
          {sharing ? 'Even…' : 'Deel'}
        </button>

        {showRefresh &&
          (!hasAi ? (
            // Zonder AI-abonnement: de ververs herschrijft de briefing door Fin
            // (een betaalde AI-functie). Toon op dezelfde plek een upsell-affordance
            // i.p.v. de POST — de deterministische briefing eronder blijft gratis.
            <Link
              href="/mijn/account"
              title="Laat Fin je briefing herschrijven — met AI-abonnement"
              aria-label="Ververs met Fin — vereist een AI-abonnement, bekijk het abonnement"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-wil-200 bg-wil-50/70 px-3 py-1.5 text-[11px] font-semibold text-wil-700 transition-colors hover:border-wil-300 hover:bg-wil-100"
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Ververs met Fin (AI)
            </Link>
          ) : (
            <button
              type="button"
              onClick={onRefresh}
              disabled={!refreshable}
              title={
                refreshable
                  ? 'Ververs je briefing (1× per dag)'
                  : 'Je hebt vandaag al ververst — morgen weer'
              }
              aria-label={
                refreshable
                  ? 'Ververs je briefing'
                  : 'Briefing verversen — vandaag al gebruikt, morgen weer'
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {refreshing ? 'Verversen…' : 'Ververs'}
            </button>
          ))}
      </div>
    </div>
  )
}

function BriefingImpactBadge({ impact }: { impact?: BriefingEntry['impact'] }) {
  if (!impact) return null
  const eur = impact.euroPerYear
  const days = impact.freedomDaysPerYear
  const hasEur = eur != null && eur > 0
  const hasDays = days != null && days > 0
  if (!hasEur && !hasDays) return null
  // "Geld is opgeslagen tijd": de vrijheidsdagen krijgen de visuele lead
  // (geaccentueerde chip), het euro-bedrag is de secundaire context.
  return (
    <div className="mt-2 inline-flex items-center gap-2 text-[10px] text-[var(--ink-3)]">
      {hasDays && (
        <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 font-semibold tabular-nums">
          +{Math.round(days)} dagen vrijheid/jr
        </span>
      )}
      {hasEur && (
        <span className="tabular-nums">+€{Math.round(eur).toLocaleString('nl-NL')}/jr</span>
      )}
    </div>
  )
}

function BriefingCard({ entry, index = 0 }: { entry: BriefingEntry; index?: number }) {
  const config = CATEGORY_CONFIG[entry.category]
  // Defensief: een bevroren snapshot kan na schema-evolutie een onbekende
  // categorie bevatten. Liever het kaartje overslaan dan /overzicht laten
  // crashen op een undefined config.
  if (!config) return null
  const Icon = config.Icon
  const hefboomCfg = entry.hefboom ? HEFBOOM_CONFIG[entry.hefboom] : null
  const HefboomIcon = hefboomCfg?.Icon
  // Wide span: 2 kolommen op sm+, full-width op mobile. Narrow: 1 kol.
  const spanClass = entry.span === 'wide' ? 'sm:col-span-2' : ''
  // Staggered reveal — altijd-actieve CSS-keyframe (reduced-motion-safe via
  // globals.css). Per-kaart vertraging zodat ze één voor één binnenvallen.
  const revealStyle = { animationDelay: `${index * 70}ms` } as const

  const inner = (
    <>
      {/* Kleur-accent: linkerrail per categorie. */}
      <span
        className={`absolute left-0 top-0 bottom-0 w-1 ${config.bar}`}
        aria-hidden="true"
      />
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${config.dotColor}`} aria-hidden="true" />
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
          {config.label}
        </span>
        {hefboomCfg && HefboomIcon && (
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded-md ${hefboomCfg.tint}`}
            aria-label={`Hefboom: ${hefboomCfg.label}`}
            title={`Hefboom: ${hefboomCfg.label}`}
          >
            <HefboomIcon className="w-3 h-3" aria-hidden="true" />
          </span>
        )}
        <Icon className="w-3.5 h-3.5 text-[var(--ink-4)] ml-auto" aria-hidden="true" />
      </div>
      <p className="text-sm text-[var(--ink)] leading-snug">{entry.text}</p>
      <BriefingImpactBadge impact={entry.impact} />
      {entry.href && (
        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--ink-3)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          Bekijk
          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
        </span>
      )}
    </>
  )

  const base =
    'group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-3.5 sm:p-4'

  if (entry.href) {
    return (
      <Link
        href={entry.href}
        style={revealStyle}
        className={`${base} ${spanClass} animate-fade-up transition-all hover:-translate-y-0.5 hover:border-[var(--ink-3)] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-3)] focus-visible:ring-offset-1`}
      >
        {inner}
      </Link>
    )
  }
  return (
    <article style={revealStyle} className={`${base} ${spanClass} animate-fade-up`}>
      {inner}
    </article>
  )
}

export { MAX_BRIEFING_ENTRIES }
