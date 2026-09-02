'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
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
import { HEFBOOM_CONFIG } from '@/lib/hefboom-config'
import {
  BRIEFING_ROTATION_COOKIE,
  BRIEFING_ROTATION_MAX_AGE,
  nextRotationOffset,
  rotateEntries,
} from '@/lib/briefing/rotation'
import { formatTimestamp } from '@/lib/format'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import { AiSubscriptionUpsell } from '@/components/app/ai-subscription-upsell'
import { useExecutionMode } from '@/lib/ai/local/use-execution-mode'
import type { LocalBriefingProgress } from '@/lib/ai/local/local-briefing-resolver'

/**
 * De deel-flow (standen-keuze + live kaartvoorbeeld + canvas-renderer) is een
 * eigen scherm; lazy geladen zodat de kaart-tekencode en de deel-dialoog buiten
 * de initiële /overzicht-bundle blijven — precies wat de oude klik-tijd
 * `import()` van de canvas-renderer hier deed.
 */
const DeelKaartSheet = dynamic(
  () => import('@/components/app/deel-kaart-sheet').then((m) => m.DeelKaartSheet),
  { ssr: false },
)

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

// Datacontracten wonen nu in lib/types/briefing.ts (import-richting UI→lib).
import type {
  BriefingCategory, BriefingSpan, HefboomTag, BriefingEntry, BriefingWeekHistoryItem,
  BriefingRefreshState,
} from '@/lib/types/briefing'
export type {
  BriefingCategory, BriefingSpan, HefboomTag, BriefingEntry, BriefingWeekHistoryItem,
  BriefingRefreshState,
}

const CATEGORY_CONFIG: Record<
  BriefingCategory,
  { label: string; dotColor: string; bar: string; text: string; Icon: LucideIcon }
> = {
  observation: { label: 'Wat valt op', dotColor: 'bg-emerald-500', bar: 'bg-emerald-400', text: 'text-emerald-700', Icon: TrendingUp },
  tip:         { label: 'Een tip',      dotColor: 'bg-violet-500',  bar: 'bg-violet-400',  text: 'text-violet-700',  Icon: Lightbulb },
  upcoming:    { label: 'Binnenkort',   dotColor: 'bg-sky-500',     bar: 'bg-sky-400',     text: 'text-sky-700',     Icon: Calendar },
  heads_up:    { label: 'Heads-up',     dotColor: 'bg-amber-500',   bar: 'bg-amber-400',   text: 'text-amber-700',   Icon: AlertTriangle },
  milestone:   { label: 'Mijlpaal',     dotColor: 'bg-fuchsia-500', bar: 'bg-fuchsia-400', text: 'text-fuchsia-700', Icon: Sparkles },
  market:      { label: 'Markt',        dotColor: 'bg-slate-500',   bar: 'bg-slate-400',   text: 'text-slate-600',   Icon: LineChart },
}

/** Maximum aantal kaartjes — 3-koloms × 2 rijen = 6. */
const MAX_BRIEFING_ENTRIES = 6

/** Eenvoudige weergave: 3 briefjes naast elkaar op sm+, 1 op mobiel. */
const SIMPLE_BRIEFING_ENTRIES = 3

/**
 * Voortgangstekst tijdens de ON-DEVICE redactie. De eerste sessie-load is een
 * stille GPU-warmup van ~45-60s; zonder deze tekst voelt dat als een hang.
 */
export function localeVoortgangTekst(p: LocalBriefingProgress): string {
  if (p.fase === 'model-laden') {
    return p.gedaan >= p.van
      ? 'Fin is klaar om te schrijven…'
      : 'Fin start op je eigen toestel op — de eerste keer duurt dit even.'
  }
  if (p.fase === 'kopzin') return 'Fin schrijft de kop…'
  return `Fin herschrijft je briefjes (${Math.min(p.gedaan + 1, p.van)} van ${p.van})…`
}

/**
 * Eerlijke uitkomst-melding na een ververs.
 *
 * De nummer-guard keurt elk briefje af waarin een bedrag niet letterlijk
 * terugkomt — bij het kleine on-device model gebeurt dat regelmatig. Zonder
 * deze melding lijkt de ververs dan "niets gedaan te hebben", terwijl de
 * briefing wél op verse cijfers staat. Liever eerlijk tellen dan stil falen.
 */
export function herschrevenNotice(
  herschreven: number | undefined,
  totaal: number | undefined,
  lokaal: boolean,
): string | null {
  if (typeof herschreven !== 'number' || typeof totaal !== 'number' || totaal <= 0) {
    return null
  }
  const waar = lokaal ? ' op je eigen toestel' : ''
  if (herschreven === 0) {
    return `Je briefing staat op verse cijfers. Fin kon geen enkel briefje herschrijven${waar} — je leest de standaardformulering.`
  }
  if (herschreven >= totaal) {
    return `Je briefing is ververst en Fin heeft alle ${totaal} briefjes herschreven${waar}.`
  }
  return `Je briefing is ververst; Fin herschreef ${herschreven} van de ${totaal} briefjes${waar}, de rest bleef zoals hij was.`
}

export function BriefingPanel({
  entries,
  refreshedAt,
  dataChanged = false,
  canRefresh = false,
  refreshState = 'available',
  headline,
  weekHistory,
  simpleMode = false,
  rotationOffset = 0,
}: {
  entries: BriefingEntry[]
  /** ISO-tijdstip waarop de briefing voor vandaag is vastgezet ("Bijgewerkt …"). */
  refreshedAt?: string | null
  /** Live cijfers wijken af van het bevroren weekbeeld (server berekent de
   *  delta) → toon een kalme freshness-hint onder de stempel. */
  dataChanged?: boolean
  /** Of de handmatige ververs vandaag nog beschikbaar is (max 1×/dag). */
  canRefresh?: boolean
  /**
   * L9 — WAAROM de ververs niet beschikbaar is, server-bepaald.
   *
   * `canRefresh` alleen was niet genoeg: die is óók false in een weergave waar
   * de ververs helemaal niet van toepassing is. De knop bleef daardoor alleen
   * zichtbaar via de EPHEMERE `usedToday`-clientstate, die bij elke remount
   * (F5, nieuwe tab, later dezelfde dag) terugvalt naar false — en dan verdween
   * de hele affordance: geen knop, geen tooltip, geen uitleg. Met
   * `refreshState === 'used_today'` blijft de uitgeschakelde knop mét reden
   * staan, ook na een remount. Default 'available' → gedrag ongewijzigd voor
   * elke call site die dit (nog) niet meegeeft.
   */
  refreshState?: BriefingRefreshState
  /**
   * Eén-zin kop onder de titel (deterministisch of AI bij ververs).
   *
   * UR2-09: de deterministische variant wordt server-side uit de LIVE canonieke
   * vrijheidstijd gerekend, niet uit de bevroren week-snapshot. Dat was de
   * tweede drager van hetzelfde stale getal als het verwijderde
   * "Jouw vrijheid deze week"-blok.
   */
  headline?: string | null
  /** Afgesloten weken uit de snapshot-historie (nieuwste laatst). */
  weekHistory?: BriefingWeekHistoryItem[]
  /**
   * Eenvoudige weergave (display_mode === 'simple'): toon een ROULEREND venster
   * over de zes briefjes in hetzelfde 3-koloms grid als de volledige weergave —
   * 3 naast elkaar op sm+, 1 op mobiel. Ook de "Vorige weken"-terugblik onderaan valt
   * weg: Eenvoudig gaat over nú, de historie hoort bij de volledige weergave.
   * Default false → volledige briefing (max 6, geen rotatie).
   */
  simpleMode?: boolean
  /**
   * Startpositie van het rouleer-venster in Eenvoudig (server-prop uit de
   * rotatiecookie). Bij élke vernieuwing van /overzicht schuift hij één plek op
   * — zie lib/briefing/rotation.ts voor het waarom van de cookie. Genegeerd in
   * de volledige weergave: die toont alle zes al.
   */
  rotationOffset?: number
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

  // WAAR draait de redactie? De gebruiker kiest dat per uitvoergroep op
  // /mijn/privacy. Alleen actief wanneer de ververs-knop überhaupt aangeboden
  // wordt (met AI-abonnement) — anders zou elke /overzicht-load een
  // voorkeur-fetch + GPU-check doen voor een knop die er niet staat.
  //
  // FAIL-CLOSED: 'resolving' en 'blocked' geven allebei canUseCloud === false
  // én canUseLocal === false. Er vertrekt dan niets — geen stille cloud-uitwijk
  // wanneer het lokale model (nog) niet kan draaien.
  const exec = useExecutionMode('briefing', hasAi)
  const execReady = exec.canUseCloud || exec.canUseLocal

  // Deel-state: de knop opent alleen nog de deel-sheet. Die draagt zelf de
  // standen-keuze, het live voorbeeld, het ophalen van de kaart én de
  // deel-dialoog — hier blijft niets van die flow achter.
  const [deelOpen, setDeelOpen] = useState(false)

  // In Eenvoudig rouleert een venster van 3 over dezelfde zes briefjes die de
  // volledige weergave toont; anders het volledige grid (max 6, ongeroteerd).
  const pool = (override?.entries ?? entries).slice(0, MAX_BRIEFING_ENTRIES)
  const shownEntries = simpleMode
    ? rotateEntries(pool, rotationOffset, SIMPLE_BRIEFING_ENTRIES)
    : pool
  const canRotate = simpleMode && pool.length > 1

  // Schuif de cursor één plek op voor de VOLGENDE vernieuwing van /overzicht.
  // Bewust ná het renderen (effect) en in een cookie: de server leest 'm bij de
  // volgende load en rendert meteen het juiste venster — geen naspringende
  // kaartjes. Zonder rotatiemateriaal (0 of 1 briefje) blijft de cursor staan.
  useEffect(() => {
    if (!canRotate || typeof document === 'undefined') return
    const secure = typeof location !== 'undefined' && location.protocol === 'https:'
    document.cookie =
      `${BRIEFING_ROTATION_COOKIE}=${nextRotationOffset(rotationOffset)}; path=/; ` +
      `max-age=${BRIEFING_ROTATION_MAX_AGE}; samesite=lax${secure ? '; secure' : ''}`
  }, [canRotate, rotationOffset])

  const shownRefreshedAt = override?.refreshedAt ?? refreshedAt ?? null
  const shownHeadline = override?.headline ?? headline ?? null
  // L9: de server zegt dat de dagbeurt op is. Dit houdt de knop ZICHTBAAR
  // (uitgeschakeld, met reden) over remounts heen; `refreshable` blijft false,
  // dus er kan niets extra's vertrekken.
  const serverUsedToday = refreshState === 'used_today'
  const refreshable = canRefresh && !usedToday && !refreshing && execReady

  /**
   * Gedeelde 403-afhandeling. DRIE heel verschillende oorzaken delen die status:
   * geen AI-abonnement (→ upsell), de privé-modus-poort (→ uitleg) en de
   * kill-switch "AI uit" (→ uitleg). Ze door elkaar halen zou iemand een
   * abonnement aansmeren dat hij al heeft — of erger: iemand die AI zelf heeft
   * uitgezet een betaalmuur voorschotelen als reden.
   *
   * De kill-switch-tak is bereikbaar ondanks de client-gate: die leest de stand
   * per tab, dus wie AI op een ander toestel uitzet krijgt hier alsnog de
   * server-403 binnen. De dag-vlag zetten we in dat geval bewust NIET — er is
   * geen ververs verbruikt.
   */
  function handle403(data: { code?: string; error?: string } | null): void {
    if (data?.code === 'privacy_mode_active') {
      setError(data.error ?? 'Je briefing draait lokaal op je apparaat.')
      return
    }
    if (data?.code === 'ai_disabled') {
      setError(data.error ?? 'AI staat uit in je instellingen. Via Mijn → Privacy kun je AI weer aanzetten.')
      return
    }
    setShowUpsell(true)
    setUsedToday(true)
  }

  /** Bestaande cloud-flow: composeren, redigeren en opslaan in één request. */
  async function refreshViaCloud() {
    const res = await fetch('/api/briefing/refresh', { method: 'POST' })
    const data = await res.json()
    if (res.status === 403) return handle403(data)
    if (!res.ok) throw new Error(data?.error ?? 'Verversen mislukt')
    if (data.allowed && Array.isArray(data.entries)) {
      setOverride({
        entries: data.entries,
        refreshedAt: data.refreshedAt,
        headline: data.headline ?? null,
      })
      setNotice(herschrevenNotice(data.herschreven, data.totaal, false))
    } else if (data.allowed === false) {
      // Stille no-op zichtbaar maken: zonder dit lijkt de spinner "niets te
      // doen" wanneer de dag-poort de ververs al had verbruikt.
      setNotice('Je hebt vandaag al ververst — morgen weer beschikbaar.')
    }
    // Of de ververs nu nieuwe content opleverde of al gebruikt was: vandaag
    // is de knop hierna uitgeput.
    setUsedToday(true)
  }

  /**
   * ON-DEVICE-flow: de server componeert (stap 1), de browser herschrijft op
   * WebGPU/Gemma, de server sanitiseert opnieuw en slaat op (stap 2). Er gaat
   * op dit pad geen enkel gegeven naar een AI-leverancier.
   *
   * Elke fout in de lokale redactie is een STILLE TERUGVAL op de
   * deterministische tekst — precies zoals op het cloudpad. Dat is bewust géén
   * cloud-fallback: er wordt hier nooit alsnog een cloud-call gedaan.
   */
  async function refreshViaLokaal() {
    const composeRes = await fetch('/api/briefing/refresh?stap=compose', { method: 'POST' })
    const compose = await composeRes.json()
    if (composeRes.status === 403) return handle403(compose)
    if (!composeRes.ok) throw new Error(compose?.error ?? 'Verversen mislukt')
    if (compose.allowed === false) {
      setNotice('Je hebt vandaag al ververst — morgen weer beschikbaar.')
      setUsedToday(true)
      return
    }

    const composed: BriefingEntry[] = Array.isArray(compose.entries) ? compose.entries : []
    setNotice('Fin start op je eigen toestel op — de eerste keer duurt dit even.')

    // Dynamische import: de LiteRT-runtime hoort niet in de initiële
    // /overzicht-bundel, hij wordt pas geladen als er echt lokaal gedraaid wordt.
    const { redactBriefingLocally } = await import('@/lib/ai/local/local-briefing-resolver')
    const lokaal = await redactBriefingLocally(composed, {
      directivesBlock: typeof compose.directivesBlock === 'string' ? compose.directivesBlock : undefined,
      onProgress: (p) => setNotice(localeVoortgangTekst(p)),
    })

    const persistRes = await fetch('/api/briefing/refresh?stap=persist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headline: lokaal.headline, texts: lokaal.texts }),
    })
    const data = await persistRes.json()
    if (persistRes.status === 403) return handle403(data)
    if (!persistRes.ok) throw new Error(data?.error ?? 'Verversen mislukt')
    if (data.allowed && Array.isArray(data.entries)) {
      setOverride({
        entries: data.entries,
        refreshedAt: data.refreshedAt,
        headline: data.headline ?? null,
      })
      // Tellen doet de SERVER, na zijn eigen her-sanitatie — niet het lokale
      // model. Wat hier staat is dus wat er echt is overgenomen.
      setNotice(herschrevenNotice(data.herschreven, data.totaal, true))
    } else if (data.allowed === false) {
      setNotice('Je hebt vandaag al ververst — morgen weer beschikbaar.')
    }
    setUsedToday(true)
  }

  async function handleRefresh() {
    if (!refreshable) return
    // TWEEDE SLUITING op fail-closed: `refreshable` is al false in 'resolving'
    // en 'blocked', maar de keuze hieronder test expliciet op canUseLocal/
    // canUseCloud in plaats van op `status === 'lokaal'`. Een onbekende of nog
    // ladende voorkeur mag nooit "dan maar de cloud" betekenen.
    if (!exec.canUseLocal && !exec.canUseCloud) return

    setRefreshing(true)
    setError(null)
    setNotice(null)
    try {
      if (exec.canUseLocal) {
        await refreshViaLokaal()
      } else {
        await refreshViaCloud()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verversen mislukt')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div id="briefing" className="mt-6 scroll-mt-20">
      <BriefingHeader
        refreshedAt={shownRefreshedAt}
        headline={shownHeadline}
        // Na een geslaagde ververs (override) is het weekbeeld weer actueel.
        dataChanged={dataChanged && !override}
        refreshable={refreshable}
        refreshing={refreshing}
        showRefresh={canRefresh || usedToday || serverUsedToday}
        hasAi={hasAi}
        // Waarom de knop uit staat is niet altijd "vandaag al gebruikt": zolang
        // we niet weten waar de AI draait (of het toestel het niet kan) mag er
        // niets vertrekken, en dat verdient een eigen uitleg.
        disabledReason={
          canRefresh && !usedToday && !execReady
            ? exec.status === 'blocked'
              ? (exec.message ?? 'Lokale AI is nu niet beschikbaar op dit toestel.')
              : 'Even bepalen waar je AI draait…'
            : null
        }
        onRefresh={handleRefresh}
        onShare={() => setDeelOpen(true)}
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
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-x-0 sm:gap-y-10">
          {shownEntries.map((entry, i) => (
            <BriefingCard
              key={entry.id}
              entry={entry}
              index={i}
              // Eenvoudig op mobiel: één briefje. De andere twee blijven in de
              // DOM maar zijn display:none — op sm+ vormen ze weer de drie
              // kolommen. Rouleren doet het venster als geheel, dus mobiel ziet
              // achtereenvolgens briefje 1, 2, 3, …
              hiddenOnMobile={simpleMode && i > 0}
            />
          ))}
        </div>
      )}

      {!simpleMode && shownEntries.length > 0 && <BriefingColophon />}

      {!simpleMode && weekHistory && weekHistory.length > 0 && (
        <BriefingWeekHistory items={weekHistory} />
      )}

      {deelOpen && <DeelKaartSheet open onClose={() => setDeelOpen(false)} />}
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
              {/* Runway-stand van die week (ADR 0126 PR C): "als je toen zou
                  stoppen, reikte je vermogen nog N maanden". Bewust maanden en
                  geen dagen — de runway is maandnauwkeurig, en een dagenaantal
                  hier zou de MARGINALE grootheid naast de TOTALE zetten. */}
              {item.freedomMonths != null && (
                <span className="text-[11px] text-[var(--ink-3)] tabular-nums">
                  {Math.round(item.freedomMonths)} maanden vermogen
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
  disabledReason,
  onRefresh,
  onShare,
}: {
  refreshedAt: string | null
  headline: string | null
  dataChanged: boolean
  refreshable: boolean
  refreshing: boolean
  showRefresh: boolean
  /** Heeft de gebruiker het AI-abonnement? Zo niet: Ververs wordt een upsell. */
  hasAi: boolean
  /** Waarom de knop uit staat, wanneer dat níet "vandaag al gebruikt" is. */
  disabledReason?: string | null
  onRefresh: () => void
  /** Opent de deel-sheet (standen-keuze + voorbeeld); doet zelf geen fetch. */
  onShare: () => void
}) {
  return (
    <div className="mb-5">
      {/* Masthead: krantenkop + dikke inkt-regel, met de acties rechts. */}
      <div className="flex items-end justify-between gap-3 border-b-2 border-[var(--ink)] pb-2.5">
        <h2
          className="text-2xl sm:text-[26px] font-bold leading-none tracking-[-0.02em] text-[var(--ink)]"
          style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
        >
          De briefing
        </h2>

        <div className="flex shrink-0 items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={onShare}
          title="Deel je vrijheidsweek"
          aria-label="Deel je vrijheidsweek"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          Deel
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
                  : (disabledReason ?? 'Je hebt vandaag al ververst — morgen weer')
              }
              aria-label={
                refreshable
                  ? 'Ververs je briefing'
                  : (disabledReason ??
                    'Briefing verversen — vandaag al gebruikt, morgen weer')
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

      {(refreshedAt || headline) && (
        <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {refreshedAt && (
            // Dateline: bewust DM Mono (data-stempel), óók onder het Krant-palet —
            // spiegelt de reference waar de rubrieken Inter zijn maar de datum mono blijft.
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-3)] tabular-nums">
              Bijgewerkt {formatTimestamp(refreshedAt)}
              {dataChanged && (
                <span className="ml-1.5 normal-case tracking-normal text-amber-700">
                  · je cijfers zijn sindsdien veranderd
                  {refreshable ? ' — ververs voor de actuele stand' : ''}
                </span>
              )}
            </p>
          )}
          {headline && (
            <p className="min-w-0 flex-1 text-right font-serif text-[13px] italic leading-snug text-[var(--ink-2)] sm:text-sm">
              {headline}
            </p>
          )}
        </div>
      )}
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

function BriefingCard({
  entry,
  index = 0,
  hiddenOnMobile = false,
}: {
  entry: BriefingEntry
  index?: number
  /** Onder sm verbergen (Eenvoudig toont op mobiel één briefje). */
  hiddenOnMobile?: boolean
}) {
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
      {/* Rubriek: krant-kicker met categorie-dot. Inter onder het Krant-palet
          (ed-kicker/briefing-rubriek → globals.css), anders DM Mono. */}
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`} aria-hidden="true" />
        <span className={`briefing-rubriek font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${config.text}`}>
          {config.label}
        </span>
        {hefboomCfg && HefboomIcon && (
          <span
            className={`inline-flex h-5 w-5 items-center justify-center rounded-md ${hefboomCfg.tint}`}
            aria-label={`Hefboom: ${hefboomCfg.label}`}
            title={`Hefboom: ${hefboomCfg.label}`}
          >
            <HefboomIcon className="h-3 w-3" aria-hidden="true" />
          </span>
        )}
        <Icon className="ml-auto h-3.5 w-3.5 text-[var(--ink-4)]" aria-hidden="true" />
      </div>
      {/* Body: redactionele serif (Source Serif), krant-leesbaar. */}
      <p className="font-serif text-[15px] leading-[1.55] text-pretty text-[var(--ink)]">{entry.text}</p>
      <BriefingImpactBadge impact={entry.impact} />
      {entry.href && (
        <span className="briefing-rubriek mt-3.5 inline-flex items-center gap-1 self-start border-b border-[var(--border-md)] pb-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-2)] transition-colors group-hover:border-[var(--ink-3)] group-hover:text-[var(--ink)]">
          Bekijk
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </>
  )

  // Krant-kolom i.p.v. kaart: geen doos/afronding, wél verticale scheidslijn
  // tussen kolommen (border-l, gereset op de eerste van elke rij) — spiegelt
  // de reference-plaat. Op mobiel stapelen ze zonder rail (grid-gap scheidt).
  // `hidden sm:flex` i.p.v. een los `flex` — beide zijn display-utilities, dus
  // ze naast elkaar zetten zou op stylesheet-volgorde leunen i.p.v. op intentie.
  const base =
    `group relative ${hiddenOnMobile ? 'hidden sm:flex' : 'flex'} min-w-0 flex-col animate-fade-up ` +
    'sm:px-6 sm:border-l sm:border-[var(--border-ed)] ' +
    'sm:[&:nth-child(3n+1)]:border-l-0 sm:[&:nth-child(3n+1)]:pl-0 ' +
    'sm:[&:nth-child(3n)]:pr-0'

  if (entry.href) {
    return (
      <Link
        href={entry.href}
        style={revealStyle}
        className={`${base} ${spanClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink-3)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]`}
      >
        {inner}
      </Link>
    )
  }
  return (
    <article style={revealStyle} className={`${base} ${spanClass}`}>
      {inner}
    </article>
  )
}

/**
 * Colofon onder de briefing — de krant-signatuur "Geld is opgeslagen tijd"
 * gecentreerd onder een hairline, zoals op de reference-plaat. Puur visueel.
 */
function BriefingColophon() {
  return (
    <div className="mt-9 border-t border-[var(--border-ed)] pt-4 text-center">
      <span className="briefing-rubriek font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-3)]">
        Geld is opgeslagen tijd
      </span>
    </div>
  )
}

export { MAX_BRIEFING_ENTRIES, SIMPLE_BRIEFING_ENTRIES }
