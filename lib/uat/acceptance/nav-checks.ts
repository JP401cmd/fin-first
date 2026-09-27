/**
 * Gedeelde engine-checks voor de UAT-Nav-acceptatiecriteria (`nav.ts`).
 *
 * PURE, CLIENT-VEILIGE module — geen vitest/DOM-afhankelijkheden en GEEN
 * server-only imports — zodat dezelfde lijst checks kan draaien onder:
 *  1. `nav.engine.test.ts` (vitest/CI): `expect(actual).toBe(expected)` per check.
 *  2. de in-app regressietest-pagina (`lib/regression-tests/suites/uat-nav.ts`):
 *     `assertEqual(actual, expected, label)` per check — deze draait in de
 *     browser, dus elke import hier moet client-bundelbaar zijn.
 *
 * De meeste checks roepen ÉCHTE productiefuncties/-constanten aan. Drie
 * kleine mirrors met bronverwijzing (spiegelt de mirrors in eerdere zones):
 *  - Next' `has`-matching voor query-voorwaarden. Sinds ADR 0179 (fase 1,
 *    26 sep 2026) staan de oude `/toekomst?tab=`/`?whatif=`/`?modal=`/
 *    `?strategie=open`-deeplinks als `has`-regels in `next.config.ts`; de
 *    render-tijd-guard `resolveTabRedirect` in de oude toekomst-page is weg.
 *    De REGELS komen hier rechtstreeks uit `nextConfig.redirects()` — niets
 *    wordt opnieuw geïmplementeerd; alleen de keuze "eerste regel voor dit pad
 *    waarvan elke query-voorwaarde klopt" (Next: `^${value}$`, zonder `value`
 *    volstaat aanwezigheid) is gemirrord, omdat Next' matcher geen publieke,
 *    client-bundelbare functie is.
 *  - de FIFO-stack-trim (component-interne logica in nav-stack-provider.tsx,
 *    hier op de geëxporteerde `STACK_DEPTH_LIMIT`-constante toegepast)
 *  - de bel-badge-cap "9+" (components/app/shell/top-bar.tsx)
 *
 * `next.config.ts` wordt WEL rechtstreeks geïmporteerd (via de `@/`-alias):
 * het is een platte configuratie-module zonder Node-specifieke of server-only
 * imports (alleen een type-only `NextConfig`-import, die compile-time wordt
 * weggelaten), dus client-bundelbaar en de daadwerkelijke single source of
 * truth voor het redirect-net — geen mirror nodig.
 */

import { deriveTabFromPath, isTabRoot, STACK_DEPTH_LIMIT } from '@/lib/nav/tab-path'
import { resolveRouteTitle, SIMPLE_HIDDEN_NAV_HREFS } from '@/lib/nav-config'
import { getAllPageItems, filterPagesByModules } from '@/lib/command-palette/navigation-index'
import { buildActionItems, type ActionRunContext } from '@/lib/command-palette/actions'
import { euroViewLabel } from '@/lib/euro-display'
import type { PerspectiveOption } from '@/lib/types/perspective'
import nextConfig from '@/next.config'
import { NAV_ACCEPTANCE } from './nav'
import type { AcceptanceCriterion } from './types'

export interface NavEngineCheck {
  /** 'WF-NAV-01' */
  workflow: string
  /** 'UAT-NAV-01' */
  scenarioId: string
  /** Korte, mensleesbare omschrijving van wat deze check bewijst. */
  label: string
  /** Roept de échte rekenfunctie(s) aan en levert expected + actual. Mag async zijn (next.config redirects). */
  run: () => { expected: number | string; actual: number | string } | Promise<{ expected: number | string; actual: number | string }>
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Vindt het criterium in nav.ts — gooit als nav.ts niet meer in sync is. */
function criterion(workflow: string): AcceptanceCriterion {
  const found = NAV_ACCEPTANCE.criteria.find((c) => c.workflow === workflow)
  if (!found) throw new Error(`Geen acceptatiecriterium voor ${workflow} — nav.ts is niet in sync.`)
  if (found.assertion.kind !== 'exact') {
    throw new Error(`${workflow} is geen 'exact'-criterium meer in nav.ts (kind=${found.assertion.kind}).`)
  }
  return found
}

/** Mirror van de FIFO-stack-trim (components/app/shell/nav-stack-provider.tsx
 *  r556-557/741-742), toegepast op de echte `STACK_DEPTH_LIMIT`-constante. */
function trimStack<T>(stack: T[], limit: number): T[] {
  return stack.length > limit ? stack.slice(stack.length - limit) : stack
}

/** Mirror van de bel-badge-cap in components/app/shell/top-bar.tsx. */
function capBadge(n: number): string {
  return n > 9 ? '9+' : n === 0 ? '' : String(n)
}

type ConfigRedirect = Awaited<ReturnType<NonNullable<typeof nextConfig.redirects>>>[number]

/** Mirror van Next' redirect-keuze voor query-voorwaarden (zie module-header):
 *  loopt de ÉCHTE regels uit next.config.ts in volgorde af en geeft de
 *  `destination` van de eerste regel voor `pad` waarvan elke `has`-voorwaarde
 *  klopt (en geen `missing`-voorwaarde). Next toetst een `value` als
 *  `^${value}$`; zonder `value` volstaat aanwezigheid. De meegegeven query reist
 *  in Next ongewijzigd mee naar het doel — die samenvoeging zit hier bewust
 *  níét in: de check toetst welke regel wint, niet Next' query-merge.
 *  `null` = geen regel, de pagina zelf rendert. */
function eersteRedirectDoel(
  redirects: ConfigRedirect[],
  pad: string,
  query: Record<string, string>,
): string | null {
  const klopt = (h: { type: string; key?: string; value?: string }): boolean => {
    if (h.type !== 'query' || h.key == null) return false
    const v = query[h.key]
    if (v === undefined) return false
    return h.value === undefined || new RegExp(`^${h.value}$`).test(v)
  }
  for (const r of redirects) {
    if (r.source !== pad) continue
    if (!(r.has ?? []).every(klopt)) continue
    if ((r.missing ?? []).some(klopt)) continue
    return r.destination
  }
  return null
}

// ── Checks — één per 'exact'-workflow in NAV_ACCEPTANCE ────────────────────

export const NAV_ENGINE_CHECKS: NavEngineCheck[] = [
  {
    workflow: 'WF-NAV-01',
    scenarioId: 'UAT-NAV-01',
    label: 'Actieve module-tab per pad (deriveTabFromPath): canoniek + legacy-routes',
    run: () => {
      criterion('WF-NAV-01')
      const overzichtTab = deriveTabFromPath('/overzicht/bezittingen')
      const coreLegacyTab = deriveTabFromPath('/core/assets')
      const toekomstTab = deriveTabFromPath('/toekomst/doelen')
      const mijnTab = deriveTabFromPath('/mijn/profiel')
      const finTab = deriveTabFromPath('/will')
      return {
        expected: 'overzichtTab=kern; coreLegacyTab=kern; toekomstTab=horizon; mijnTab=identity; finTab=wil',
        actual: `overzichtTab=${overzichtTab}; coreLegacyTab=${coreLegacyTab}; toekomstTab=${toekomstTab}; mijnTab=${mijnTab}; finTab=${finTab}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-05',
    scenarioId: 'UAT-NAV-05',
    label: 'Titel-fallback (resolveRouteTitle) + tab-root-detectie (isTabRoot)',
    run: () => {
      criterion('WF-NAV-05')
      // /mijn/feedback valt écht op de titelkaart terug (geen <NavStackMeta> in
      // de pagina). /mijn/checkins juist niet: die re-export zet zelf
      // "Check-in historie", dus daar hoort de fallback leeg te zijn.
      const titelFeedback = resolveRouteTitle('/mijn/feedback')
      const titelCheckinsFallback = resolveRouteTitle('/mijn/checkins')
      const overzichtIsTabRoot = isTabRoot('/overzicht', 'kern')
      const toekomstIsTabRootVoorHorizon = isTabRoot('/toekomst', 'horizon')
      return {
        expected: 'titelFeedback=Melden; titelCheckinsFallback=null; overzichtIsTabRoot=true; toekomstIsTabRootVoorHorizon=true',
        actual: `titelFeedback=${titelFeedback}; titelCheckinsFallback=${titelCheckinsFallback}; overzichtIsTabRoot=${overzichtIsTabRoot}; toekomstIsTabRootVoorHorizon=${toekomstIsTabRootVoorHorizon}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-07',
    scenarioId: 'UAT-NAV-07',
    label: 'Command-palette-module-filter (filterPagesByModules): met/zonder requiredModule',
    run: () => {
      criterion('WF-NAV-07')
      const pages = getAllPageItems()
      const metModule = pages.find((p) => p.href === '/overzicht/bezittingen/investment')!
      const zonderModule = pages.find((p) => p.href === '/overzicht')!
      const metModuleActief = filterPagesByModules([metModule], ['vermogensregistratie'])
      const metModuleInactief = filterPagesByModules([metModule], [])
      const zonderModuleFiltered = filterPagesByModules([zonderModule], [])
      return {
        expected: 'metModuleActiefZichtbaar=true; metModuleInactiefGefilterd=true; zonderModuleAltijdZichtbaar=true',
        actual: `metModuleActiefZichtbaar=${metModuleActief.length === 1}; metModuleInactiefGefilterd=${metModuleInactief.length === 0}; zonderModuleAltijdZichtbaar=${zonderModuleFiltered.length === 1}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-09',
    scenarioId: 'UAT-NAV-09',
    label: 'Command-palette-acties (buildActionItems): perspectief-sortering + privacy-label + module-gate',
    run: () => {
      criterion('WF-NAV-09')
      const perspectives: PerspectiveOption[] = [
        { id: 'personal', label: 'Persoonlijk', description: 'Persoonlijk' },
        { id: 'household', label: 'Huishouden', description: 'Gezamenlijke cijfers' },
        { id: 'partner', label: 'Partner', description: 'Cijfers van je partner' },
      ]
      const baseCtx: ActionRunContext = {
        router: { push: () => {} },
        closePalette: () => {},
        togglePrivacy: () => {},
        privacyMasked: false,
        toggleDisplayMode: () => {},
        displayMode: 'full',
        toggleEuroView: () => {},
        euroView: 'nominal',
        toggleHomeScreen: () => {},
        homeScreen: 'overzicht',
        triggerPricesSync: () => {},
        currentPerspective: 'personal',
        availablePerspectives: perspectives,
        setPerspective: () => {},
      }
      const itemsMetModule = buildActionItems(baseCtx, ['vermogensregistratie'])
      const itemsZonderModule = buildActionItems(baseCtx, [])
      const perspectiefItems = itemsMetModule.filter((i) => i.id.startsWith('action:perspective-'))
      const actiefItem = perspectiefItems.find((i) => i.id === 'action:perspective-personal')!
      const privacyItem = itemsMetModule.find((i) => i.id === 'action:toggle-privacy')!
      const syncMetModule = itemsMetModule.some((i) => i.id === 'action:sync-prices')
      const syncZonderModule = itemsZonderModule.some((i) => i.id === 'action:sync-prices')
      return {
        // `syncPricesZonderModule=true` is sinds B-029 het JUISTE antwoord: de
        // sync-actie draagt geen module-gate meer, omdat haar ronde ook
        // banktransacties ophaalt en de header-knop die dezelfde ronde draait
        // nooit een gate had. De check blijft staan om precies dát vast te
        // pinnen — een teruggekeerde gate hoort hier rood te worden.
        expected: 'perspectiefItems=3; actiefLabel=Persoonlijk · actief; privacyLabel=Switch naar verborgen bedragen; syncPricesMetModule=true; syncPricesZonderModule=true',
        actual: `perspectiefItems=${perspectiefItems.length}; actiefLabel=${actiefItem.sublabel}; privacyLabel=${privacyItem.label}; syncPricesMetModule=${syncMetModule}; syncPricesZonderModule=${syncZonderModule}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-10',
    scenarioId: 'UAT-NAV-10',
    label: 'Eenvoudig-weergave verberg-lijst (SIMPLE_HIDDEN_NAV_HREFS): rekenhulp/whatif verborgen, doelen niet',
    run: () => {
      criterion('WF-NAV-10')
      const rekenhulpVerborgen = SIMPLE_HIDDEN_NAV_HREFS.includes('/toekomst/rekenhulp')
      const doelenZichtbaar = !SIMPLE_HIDDEN_NAV_HREFS.includes('/toekomst/doelen')
      return {
        expected: 'rekenhulpVerborgen=true; doelenZichtbaar=true',
        actual: `rekenhulpVerborgen=${rekenhulpVerborgen}; doelenZichtbaar=${doelenZichtbaar}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-14',
    scenarioId: 'UAT-NAV-14',
    label: 'Navigatie-stack FIFO-cap (STACK_DEPTH_LIMIT): 6e niveau verdringt het oudste',
    run: () => {
      criterion('WF-NAV-14')
      const stack = ['a', 'b', 'c', 'd', 'e', 'f'] // 6 niveaus, 'a' is het oudste
      const trimmed = trimStack(stack, STACK_DEPTH_LIMIT)
      return {
        expected: 'stackDepthLimit=5; naZesdeNiveauLengte=5; oudsteVerwijderd=true',
        actual: `stackDepthLimit=${STACK_DEPTH_LIMIT}; naZesdeNiveauLengte=${trimmed.length}; oudsteVerwijderd=${!trimmed.includes('a')}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-15',
    scenarioId: 'UAT-NAV-15',
    label: 'Oude /toekomst-deeplinks (has-regels in next.config.ts): ?tab=, ?whatif=open, ?modal=, ?strategie=open',
    run: async () => {
      criterion('WF-NAV-15')
      const redirects = (await nextConfig.redirects?.()) ?? []
      const doel = (query: Record<string, string>) => eersteRedirectDoel(redirects, '/toekomst', query)
      const uitkomst = [
        `tabGebeurtenissenStrategie=${doel({ tab: 'gebeurtenissen', strategie: 'aow' })}`,
        `tabGebeurtenissenOnbekendeStrategie=${doel({ tab: 'gebeurtenissen', strategie: 'aowx' })}`,
        `tabGebeurtenissen=${doel({ tab: 'gebeurtenissen' })}`,
        `tabVoorkeuren=${doel({ tab: 'voorkeuren' })}`,
        `tabDoelen=${doel({ tab: 'doelen' })}`,
        `tabRekenhulp=${doel({ tab: 'rekenhulp' })}`,
        `whatifOpen=${doel({ whatif: 'open' })}`,
        `strategieOpen=${doel({ strategie: 'open' })}`,
        `modalStrategie=${doel({ modal: 'strategie' })}`,
        `modalWithdrawal=${doel({ modal: 'withdrawal' })}`,
        `onbekendeTab=${doel({ tab: 'onzin' })}`,
        `uitgavenOpen=${doel({ uitgaven: 'open' })}`,
        `zonderQuery=${doel({})}`,
      ].join('; ')
      // Sinds de gebeurtenissen onder het plan staan (addendum ADR 0179, 26 sep 2026)
      // heeft `?tab=gebeurtenissen` zonder levensstrategie GEEN regel meer: een regel
      // /toekomst → /toekomst zou met de meereizende query een lus zijn. `OudeTabParam`
      // haalt `tab` weg en zet `#gebeurtenissen` (client, niet in deze check). Fase 3:
      // de Strategieën-modal is opgeheven; de oude modal-/strategie-deeplinks landen op
      // een rij in Instellingen (`?rij=`), `?uitgaven=open` op de rij Uitgave na pensioen.
      return {
        expected:
          'tabGebeurtenissenStrategie=/toekomst/instellingen; tabGebeurtenissenOnbekendeStrategie=null; tabGebeurtenissen=null; tabVoorkeuren=/toekomst/instellingen; tabDoelen=/toekomst/doelen; tabRekenhulp=/toekomst/rekenhulp; whatifOpen=/toekomst/doelen; strategieOpen=/toekomst/instellingen?rij=stopmoment; modalStrategie=/toekomst/instellingen?rij=stopmoment; modalWithdrawal=/toekomst/instellingen?rij=onttrekking; onbekendeTab=null; uitgavenOpen=/toekomst/instellingen?rij=uitgave-na-pensioen; zonderQuery=null',
        actual: uitkomst,
      }
    },
  },
  {
    workflow: 'WF-NAV-16',
    scenarioId: 'UAT-NAV-16',
    label: 'Legacy-redirect-net (next.config.ts#redirects): aantal + kern-redirects + geen-regel-voor-/core/assets',
    run: async () => {
      criterion('WF-NAV-16')
      const redirects = (await nextConfig.redirects?.()) ?? []
      const coreNaarOverzicht = redirects.some((r) => r.source === '/core' && r.destination === '/overzicht')
      // /dashboard mag juist GEEN config-regel meer hebben: de middleware
      // vertaalt hem naar het gekozen homescherm (profiles.home_screen).
      const dashboardGeenConfigRedirect = !redirects.some((r) => r.source === '/dashboard')
      const coreAssetsGeenRedirect = !redirects.some((r) => r.source === '/core/assets')
      // ADR 0135-deeplinks: de vijf cashflow-regels moeten er zijn ÉN hun
      // bestemming mag zelf geen query dragen — dan pas plakt Next de
      // meegegeven ?budget=/?maand=/?limit=/?rekening= er weer achter.
      const cashflowRegels = redirects.filter(
        (r) => r.source === '/overzicht/cashflow' || r.source.startsWith('/overzicht/cashflow/'),
      )
      const cashflowBestemmingZonderQuery = cashflowRegels.every((r) => !r.destination.includes('?'))
      // De oude subroute /toekomst/gebeurtenissen: eerst de gerichte levensstrategie-regel
      // (→ Instellingen), dan de algemene (→ Plan #gebeurtenissen, addendum 26 sep 2026).
      const gebeurtenissenDoel = eersteRedirectDoel(redirects, '/toekomst/gebeurtenissen', { nieuw: '1' })
      const gebeurtenissenStrategieDoel = eersteRedirectDoel(redirects, '/toekomst/gebeurtenissen', { strategie: 'huis' })
      return {
        // 24 = de eerdere 25 (16 + React #310-lichtingen, zie het redirect-blok
        // in next.config.ts) MIN de /dashboard-regel (1 sep 2026, kiesbaar
        // homescherm): /dashboard is nu het "ga naar home"-doel dat de
        // edge-middleware (lib/supabase/proxy.ts) naar profiles.home_screen
        // vertaalt — een statische config-regel zou die vertaling
        // onbereikbaar maken (config-redirects draaien vóór de middleware).
        // 31 -> 30 (14 sep 2026, ADR 0144): /horizon/whatif en /toekomst/whatif
        // zijn elk nu één ONVOORWAARDELIJKE redirect naar /toekomst?whatif=open
        // (geen ?via=dreamgate-vertakking meer) — één regel minder dan voorheen.
        // De regel zelf geeft een meegegeven ?via=dreamgate gewoon door (geen
        // eigen '?' op de bestemming); een losse client-side opschoonstap
        // (lib/horizon/deeplink-cleanup.ts) haalt `via` daarna uit de URL.
        // 30 -> 41 (26 sep 2026, ADR 0179 fase 1 — /toekomst in drie katernen):
        // +2 voor de opgeheven subroutes (/toekomst/voorkeuren -> /toekomst/
        // instellingen, /toekomst/gebeurtenissen -> …#gebeurtenissen), +5 `has`-
        // regels voor de oude `?tab=`-deeplinks (die de render-tijd-guard
        // `resolveTabRedirect` vervangen), +1 `?whatif=open` -> /toekomst/doelen,
        // +1 `?modal=withdrawal` en +2 `?strategie=open`/`?modal=strategie` ->
        // /toekomst/instellingen?regel=…. De whatif-, strategie- en
        // /identity/parameters-regels wijzen nu rechtstreeks naar het katern
        // (geen extra regel). Welke regel wint, toetst WF-NAV-15.
        // 41 -> 42 (26 sep 2026, addendum ADR 0179 + fase 3): +1 gerichte regel
        // /toekomst/gebeurtenissen?strategie=aow|pensioen|huis|werk -> Instellingen,
        // -1 `?tab=gebeurtenissen` zonder strategie (OudeTabParam doet dat nu),
        // +1 `?uitgaven=open` -> /toekomst/instellingen?rij=uitgave-na-pensioen.
        expected: 'aantalRedirects=42; coreNaarOverzicht=true; dashboardGeenConfigRedirect=true; coreAssetsGeenRedirect=true; cashflowRedirects=5; cashflowBestemmingZonderQuery=true; gebeurtenissen=/toekomst#gebeurtenissen; gebeurtenissenStrategie=/toekomst/instellingen',
        actual: `aantalRedirects=${redirects.length}; coreNaarOverzicht=${coreNaarOverzicht}; dashboardGeenConfigRedirect=${dashboardGeenConfigRedirect}; coreAssetsGeenRedirect=${coreAssetsGeenRedirect}; cashflowRedirects=${cashflowRegels.length}; cashflowBestemmingZonderQuery=${cashflowBestemmingZonderQuery}; gebeurtenissen=${gebeurtenissenDoel}; gebeurtenissenStrategie=${gebeurtenissenStrategieDoel}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-18',
    scenarioId: 'UAT-NAV-18',
    label: 'Bel-badge-cap (mirror, identiek aan WILL): 0/5/12 ongelezen meldingen',
    run: () => {
      criterion('WF-NAV-18')
      const badge0 = capBadge(0)
      const badge5 = capBadge(5)
      const badge12 = capBadge(12)
      return {
        expected: 'badge0=; badge5=5; badge12=9+',
        actual: `badge0=${badge0}; badge5=${badge5}; badge12=${badge12}`,
      }
    },
  },
  {
    workflow: 'WF-NAV-27',
    scenarioId: 'UAT-NAV-27',
    label: 'Euro-weergave-toggle (buildActionItems): label-flip nominal↔real + euroViewLabel',
    run: () => {
      criterion('WF-NAV-27')
      // Minimale ActionRunContext — alleen euroView wisselt; de overige velden
      // zijn no-op-callbacks/vaste waarden (spiegelt de WF-NAV-09-check hierboven).
      const baseCtx: ActionRunContext = {
        router: { push: () => {} },
        closePalette: () => {},
        togglePrivacy: () => {},
        privacyMasked: false,
        toggleDisplayMode: () => {},
        displayMode: 'full',
        toggleEuroView: () => {},
        euroView: 'nominal',
        toggleHomeScreen: () => {},
        homeScreen: 'overzicht',
        triggerPricesSync: () => {},
        currentPerspective: 'personal',
        availablePerspectives: [],
        setPerspective: () => {},
      }
      const toggleItem = (ctx: ActionRunContext) =>
        buildActionItems(ctx, []).find((i) => i.id === 'action:toggle-euro-view')!
      const labelNominal = toggleItem(baseCtx).label
      const labelReal = toggleItem({ ...baseCtx, euroView: 'real' }).label
      return {
        expected: "labelNominal=Switch naar huidige euro's; labelReal=Switch naar toekomstige euro's; euroViewLabelNominal=Toekomstige euro's; euroViewLabelReal=Huidige euro's",
        actual: `labelNominal=${labelNominal}; labelReal=${labelReal}; euroViewLabelNominal=${euroViewLabel('nominal')}; euroViewLabelReal=${euroViewLabel('real')}`,
      }
    },
  },
]
