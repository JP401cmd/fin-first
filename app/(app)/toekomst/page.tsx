import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import HorizonPage from '@/components/app/horizon/horizon-client'
import { ToekomstNavCards } from '@/components/future/toekomst-nav-cards'
import { resolveWithdrawalProfiel } from '@/lib/withdrawal-strategy'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageVerdictOpening, EditorialDeck, OrnamentColophon } from '@/components/editorial'
import { resolveRouteTitle } from '@/lib/nav-config'
import { getPageInfo } from '@/lib/page-info-content'
import {
  DeficitNoticeProvider,
  DeficitNoticeDot,
} from '@/components/app/horizon/deficit-notice-provider'
import { AowNoticeProvider, AowNoticeDot } from '@/components/app/horizon/aow-notice-provider'
import {
  EindsituatieNoticeProvider,
  EindsituatieNoticeDot,
} from '@/components/app/horizon/eindsituatie-notice-provider'
import { PlanReviewProvider } from '@/components/future/plan-review/plan-review-provider'
import { isStrategieKey } from '@/lib/horizon/strategie-route'
import { loadToekomstData } from '@/lib/toekomst/load-toekomst-data'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/** Tabs die nu eigen subpagina's hebben — `?tab=<x>` redirect naar `/toekomst/<x>`. */
const TAB_ROUTES = new Set(['doelen', 'gebeurtenissen', 'voorkeuren', 'rekenhulp'])

/**
 * Pure redirect-guard: bepaal of een oude `?tab=`-deeplink naar een
 * subpagina geredirect moet worden. Geëxporteerd zodat de logica los van de
 * server-render getest kan worden.
 *
 * Regels:
 *  - `tab` ontbreekt of is geen bekende subpagina → `null` (blijf op /toekomst;
 *    bv. `?strategie=open`, `?whatif=open` zijn tijdas-modal/pane-params).
 *  - `tab` is een bekende subpagina → `/toekomst/<tab>`, met alle overige
 *    query-params behouden (bv. `?tab=doelen&focus=g1` → `/toekomst/doelen?focus=g1`).
 *  - Uitzondering: `tab=gebeurtenissen` mét een levensstrategie-sleutel
 *    (`strategie=aow|pensioen|huis|werk`) → `/toekomst/voorkeuren?strategie=…`;
 *    de strategieën wonen sinds 17 sep 2026 op Voorkeuren (één hop, geen keten).
 *
 * @returns de redirect-doel-URL, of `null` wanneer niet geredirect moet worden.
 */
export function resolveTabRedirect(
  sp: Record<string, string | string[] | undefined>,
): string | null {
  const rawTab = sp.tab
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab
  if (!tab || !TAB_ROUTES.has(tab)) return null

  const rest = new URLSearchParams()
  for (const [key, value] of Object.entries(sp)) {
    if (key === 'tab' || value === undefined) continue
    if (Array.isArray(value)) {
      for (const v of value) rest.append(key, v)
    } else {
      rest.append(key, value)
    }
  }
  const qs = rest.toString()
  const doel =
    tab === 'gebeurtenissen' && isStrategieKey(rest.get('strategie')) ? 'voorkeuren' : tab
  return qs ? `/toekomst/${doel}?${qs}` : `/toekomst/${doel}`
}

/**
 * /toekomst — tijdas-landing met vier navigatiekaarten (nieuwe architectuur).
 *
 * Render-volgorde:
 *  1. Landing-header (kicker + serif-titel) met de info-knop rechts.
 *  2. ToekomstNavCards — vier kaarten (Doelen · Gebeurtenissen · Voorkeuren ·
 *     Rekenhulp), elk met KPI + status-dot, die naar hun subpagina linken.
 *  3. HorizonPage — de tijdas zelf (grafiek + Risk Lab + drag&drop events).
 *
 * De zware per-view data (`strategieData`, `prefill`, `simSnapshot`,
 * `potBalances`, `aowRows`, volledige `custom_calculators`) is verhuisd naar de
 * respectievelijke subpagina's; de landing laadt alleen de lichte KPI-data
 * (`loadHorizonData` + `loadFinData`) plus één count-query op
 * `custom_calculators`.
 *
 * Backwards-compat: oude `?tab=<doelen|gebeurtenissen|voorkeuren|rekenhulp>`
 * deeplinks worden naar de bijbehorende subpagina geredirect met behoud van
 * alle overige query-params. Tijdas-modal/pane-params (`?strategie=open`,
 * `?whatif=open`, `?uitgaven=open`) hebben geen `tab` en blijven op `/toekomst`.
 */
export default async function ToekomstPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams

  // ── Redirect-guard: bewaar deeplinks naar de oude tab-views ──────────────
  const redirectTarget = resolveTabRedirect(sp)
  if (redirectTarget) redirect(redirectTarget)

  // ── Lichte landing-data: KPI's voor de kaarten + tijdas-data ─────────────
  // De lading zelf woont in `lib/toekomst/load-toekomst-data.ts` (fase 1 stroom R),
  // zodat de katern-layout van stap 15 dezelfde functie kan aanroepen.
  const {
    horizonData,
    finData,
    calculatorCount,
    planReviewProgress,
    deficitMinimizedPeak,
    aowMinimizedFlag,
    eindsituatieMinimizedFlag,
    planVerdict,
  } = await loadToekomstData()

  return (
    <>
      {/* Tab-root → 'rich' TopBar (utility-cluster) + tab-titel in de mobiele
          bovenbalk, gelijk aan /overzicht en /mijn. Zonder expliciete topBar
          valt NavStackMeta terug op 'simple' en verdwijnt de cluster. */}
      <NavStackMeta title="Toekomst" topBar={{ kind: 'rich' }} bottomBar={{ kind: 'tabs' }} />
      {/* De tekort-lening-melding leeft bij de tijdas-grafiek (in HorizonPage),
          maar haar geminimaliseerde vorm is een statuspunt náást de pagina-'i'
          hierboven. Deze provider omspant daarom béíde: hij deelt de piek uit de
          horizon-run met het punt en onthoudt minimaliseren server-side
          (jsonb-pref → PUT /api/overzicht/page-status). Zie
          `components/app/horizon/deficit-notice-provider.tsx`. */}
      <DeficitNoticeProvider initialMinimizedPeak={deficitMinimizedPeak}>
      {/* TPR-04 — zusje van de tekort-provider: de "AOW ontbreekt"-melding (uit de
          adapter-notice in de horizon-run) deelt haar toestand met een tweede
          statuspunt naast de 'i'; zelfde PUT-pad, eigen pref-only sleutel. */}
      <AowNoticeProvider initialMinimizedFlag={aowMinimizedFlag}>
      {/* Plan 17 sep (D) — de informatieve eindsituatie-uitleg: derde zusje, eigen
          pref-only sleutel, statuspunt in horizon-tint naast de 'i'. */}
      <EindsituatieNoticeProvider initialMinimizedFlag={eindsituatieMinimizedFlag}>
      {/* TPR-01 — plan-review: deelt `open()` met de Voorkeuren-kaart en montert de
          review-pane (ShellOverlay pane) naast de tijdas, zodat de grafiek zichtbaar
          blijft. Consumeert ook de deeplink `?planreview=open`. */}
      <PlanReviewProvider initialProgress={planReviewProgress}>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-6 print:hidden">
        <div className="mb-3 flex items-start justify-between gap-3">
          {/* Deck bewust NIET via de `deck`-prop: dan zit hij in deze flex-
              kolom en reserveert de knoppen-cluster rechts zijn breedte over
              de vólle hoogte — op mobiel wikkelde de intro daardoor in vier
              smalle regels. De deck rendert hieronder vol-breed. */}
          {/* Aanhef als ZIN (ADR 0174 D6): onder een vast stopmoment de dekking
              van je plan ("Je toekomstplan is *voor 96% gedekt*."), onder "zo
              vroeg mogelijk" de haalbaarheid. Zonder oordeel blijft de kale
              paginanaam staan. Zie `PageVerdictOpening`. */}
          <PageVerdictOpening
            className="min-w-0 flex-1"
            pageName={resolveRouteTitle('/toekomst') ?? 'Toekomst'}
            sentence={planVerdict.sentence}
            tone={planVerdict.status}
          />
          <div className="flex shrink-0 items-center gap-2">
            {/* Statuspunt van een geminimaliseerde melding: links naast de 'i',
                zelfde h-7 w-7-familie, stoplichtkleur (géén module-accent). De
                conventie noemt absolute offsets voor pagina's waar de 'i'
                absoluut staat; deze kop is een flex-cluster, dus DOM-volgorde +
                gap-2 (8px) geeft exact dezelfde plaatsing. */}
            <EindsituatieNoticeDot />
            <AowNoticeDot />
            <DeficitNoticeDot />
            <PageInfoButton content={getPageInfo('/toekomst')} />
          </div>
        </div>

        {/* Vol-breed onder de kop-rij (zie de aantekening hierboven). */}
        {/* Deck blijft bewust buiten de `deck`-prop van de aanhef: dan zit hij
            in de flex-kolom hierboven en reserveert de knoppen-cluster rechts
            zijn breedte over de vólle hoogte — op mobiel wikkelde de intro
            daardoor in vier smalle regels. Vol-breed dus, en kort (twee zinnen).

            De paginanaam die `PageVerdictOpening` op mobiel aan de shell
            overlaat, staat in de TopBar: links naast de "← home"-knop, gezet
            door de `<NavStackMeta title="Toekomst">` hierboven (ADR 0174;
            tab-root-topbar-title.test.ts pint dat).

            ADR 0165: de oude leus over geld als opgeslagen tijd is vervallen —
            geld lévert tijd op. Deck en colophon hieronder volgen dat. */}
        <EditorialDeck className="mb-4">
          Je tijdas met doelen, gebeurtenissen en voorkeuren. Zo zie je hoeveel tijd je geld
          oplevert.
        </EditorialDeck>

        {/* Navkaarten staan nu altijd boven de altijd-zichtbare tijdas. */}
        <ToekomstNavCards
          goals={finData.goals}
          goalProgresses={finData.goalProgresses}
          events={horizonData.events}
          fireStrategy={horizonData.fireStrategy}
          withdrawalStrategy={horizonData.withdrawalStrategy}
          // Het profiel zoals de kernel het leest: dezelfde rauwe rij (rawProfile,
          // select('*') incl. withdrawal_profile_config) door dezelfde voorrangs-
          // regel als de adapter (B-042). Enum-terugval = de al-geresolveerde config.
          withdrawalProfiel={resolveWithdrawalProfiel({
            withdrawal_strategy: horizonData.withdrawalStrategy.strategy,
            withdrawal_profile_config: horizonData.rawProfile?.withdrawal_profile_config,
          })}
          fireParams={horizonData.fireParams}
          calculatorCount={calculatorCount}
          planReview={planReviewProgress}
        />
      </section>

      {/* embedded: de tijdas leeft ónder de paginakop ("Je tijdas") — degradeer
          de horizon-client-kop tot sectie-niveau (geen tweede H1, geen eigen
          PageInfoButton). Zie K-02 (dubbele-hero-ontstapeling). */}
      {/* `goals` = exact dezelfde slice die de Doelen-navkaart hierboven en de
          dashboard-widget consumeren (M36): doelen met een streefdatum krijgen
          een marker op de tijdas, zodat het scherm dát over de toekomst gaat
          niet langer verzwijgt wat je zojuist hebt ingevoerd. Geen extra query. */}
      <HorizonPage initialData={horizonData} embedded goals={finData.goals} />

      {/* Krant-stijl colophon als landing-footer. `print:hidden` blijft staan:
          de eigen printknop is weg (B-021), maar de browser-print van de
          gebruiker (Ctrl+P) hoort deze footer nog steeds niet mee te nemen. */}
      <div className="print:hidden">
        <OrnamentColophon text="Geld levert tijd op" module="De Toekomst" />
      </div>
      </PlanReviewProvider>
      </EindsituatieNoticeProvider>
      </AowNoticeProvider>
      </DeficitNoticeProvider>
    </>
  )
}
