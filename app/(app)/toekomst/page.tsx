import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { loadFinData } from '@/lib/fin-data-loader'
import HorizonPage from '@/components/app/horizon/horizon-client'
import { ToekomstNavCards } from '@/components/future/toekomst-nav-cards'
import { PrintTijdasButton } from '@/components/future/print-tijdas-button'
import { PageInfoButton } from '@/components/editorial/page-info-button'
import { PageOpening, OrnamentColophon } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import {
  DeficitNoticeProvider,
  DeficitNoticeDot,
} from '@/components/app/horizon/deficit-notice-provider'
import { readMinimizedMap } from '@/lib/page-status/minimized-prefs'
import {
  DEFICIT_NOTICE_MINIMIZE_KEY,
  asDeficitMinimizedPeak,
} from '@/lib/horizon/deficit-loan-minimize'

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
 *    query-params behouden (bv. `?tab=gebeurtenissen&strategie=aow`
 *    → `/toekomst/gebeurtenissen?strategie=aow`).
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
  return qs ? `/toekomst/${tab}?${qs}` : `/toekomst/${tab}`
}

/**
 * /toekomst — tijdas-landing met vier navigatiekaarten (nieuwe architectuur).
 *
 * Render-volgorde:
 *  1. Landing-header (kicker + serif-titel) met de PrintTijdasButton rechts.
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [horizonData, finData, calcCountRes, minimizedMap] = await Promise.all([
    loadHorizonData(supabase),
    loadFinData(supabase),
    user
      ? supabase
          .from('custom_calculators')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
      : Promise.resolve({ count: 0 }),
    // Server-seed van de "geminimaliseerd"-voorkeur voor de tekort-lening-melding
    // (own-row jsonb-pref, cross-device). Lichte single-row select, parallel aan
    // de zware loaders — zo flikkert de melding/het statuspunt niet na hydration.
    user
      ? readMinimizedMap(supabase, user.id)
      : Promise.resolve({} as Record<string, unknown>),
  ])
  const calculatorCount = calcCountRes.count ?? 0
  const deficitMinimizedPeak = asDeficitMinimizedPeak(
    minimizedMap[DEFICIT_NOTICE_MINIMIZE_KEY],
  )

  // Een echte tijdas-projectie vereist een leeftijd (geboortedatum). Zonder die
  // kan er geen FIRE-pad berekend worden — dan tonen we ook geen print/deel-knop.
  const hasProjection = horizonData.effectiveInput?.dateOfBirth != null

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
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-4 sm:pt-6 print:hidden">
        <div className="mb-4 flex items-start justify-between gap-3">
          <PageOpening
            className="min-w-0 flex-1"
            kicker="De Toekomst"
            titleBefore="Je "
            emphasis="tijdas"
            titleAfter=""
            deck="Geld is opgeslagen tijd — kies wat je later met die tijd doet."
          />
          <div className="flex shrink-0 items-center gap-2">
            {/* Statuspunt van een geminimaliseerde melding: links naast de 'i',
                zelfde h-7 w-7-familie, stoplichtkleur (géén module-accent). De
                conventie noemt absolute offsets voor pagina's waar de 'i'
                absoluut staat; deze kop is een flex-cluster, dus DOM-volgorde +
                gap-2 (8px) geeft exact dezelfde plaatsing. */}
            <DeficitNoticeDot />
            <PageInfoButton description={PAGE_INFO['/toekomst'] ?? ''} />
            {/* Print/Deel toont op basis van een ECHTE projectie (geboortedatum
                aanwezig → tijdas berekenbaar), niet langer op de verwijderde
                setup-flag. Geen data-backfill nodig. */}
            {hasProjection && <PrintTijdasButton />}
          </div>
        </div>

        {/* Navkaarten staan nu altijd boven de altijd-zichtbare tijdas. */}
        <ToekomstNavCards
          goals={finData.goals}
          goalProgresses={finData.goalProgresses}
          events={horizonData.events}
          fireStrategy={horizonData.fireStrategy}
          withdrawalStrategy={horizonData.withdrawalStrategy}
          fireParams={horizonData.fireParams}
          calculatorCount={calculatorCount}
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

      {/* Krant-stijl colophon als landing-footer. print:hidden zodat de
          tijdas-print (PrintTijdasButton) ongewijzigd blijft. */}
      <div className="print:hidden">
        <OrnamentColophon text="Geld is opgeslagen tijd" module="De Toekomst" />
      </div>
      </DeficitNoticeProvider>
    </>
  )
}
