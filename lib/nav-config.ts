import type { ComponentType } from 'react'
import { Wallet, Compass, User, Newspaper, Bell, MessageCircle, Settings, Zap } from 'lucide-react'

/**
 * Unified nav-config — single source of truth voor sidebar (desktop) én
 * floating-button-menu (mobile). Geïnspireerd op Vercel's command-mega-menu:
 * één lijst met hoofdpagina's, groepen subroutes onder elk, en globale
 * acties die overal beschikbaar zijn (krant, berichten, coach, account).
 *
 * Beide UI-laagen (sidebar + sheet) consumeren dezelfde structuur, dus
 * een nieuwe sub-route toevoegen verschijnt automatisch in beide.
 */

export type NavIcon = ComponentType<{ className?: string; size?: number }>
export type NavColor = 'amber' | 'teal' | 'purple' | 'stone'

export type NavItem = {
  label: string
  href: string
  icon?: NavIcon
  description?: string
  /**
   * Optionele geneste subroutes — verschijnen ingesprongen ónder dit item,
   * maar alléén wanneer de gebruiker op dit item (of een van zijn kinderen)
   * staat (contextueel derde niveau). Gebruikt voor Box 1/2/3 onder Belasting.
   */
  children?: NavItem[]
}

export type NavGroup = {
  parent: NavItem & { color: NavColor }
  items: NavItem[]
}

export type GlobalNavItem = {
  label: string
  icon: NavIcon
  href?: string
  /** Optionele action-id voor non-route items (chat openen, account-menu, etc.) */
  action?: 'open-chat' | 'open-account' | 'open-search'
}

/**
 * Hoofdpagina's — verschijnen bovenaan het menu als grote tap-targets.
 */
export const mainNav: Array<NavItem & { color: NavColor }> = [
  {
    label: 'Overzicht',
    href: '/overzicht',
    icon: Wallet,
    color: 'amber',
    description: 'Hoe sta je er voor — kompas, score, tijdslijn',
  },
  {
    label: 'Toekomst',
    href: '/toekomst',
    icon: Compass,
    color: 'purple',
    description: 'Tijdas, doelen, gebeurtenissen, voorkeuren',
  },
  {
    label: 'Mijn',
    href: '/mijn',
    icon: User,
    color: 'teal',
    description: 'Profiel, partner, voorkeuren, koppelingen',
  },
]

/**
 * Groepen subroutes onder elke hoofdpagina. Lege items-array = nog niet
 * uitgesplitste verdiepingen (alleen hoofdpagina toont).
 */
export const navGroups: NavGroup[] = [
  {
    parent: mainNav[0]!,
    items: [
      // De vier hefbomen — kompas-categorieën onder Overzicht. Statisch
      // omdat ze altijd beschikbaar zijn (lege state heeft eigen empty-
      // state-UI). Actieve deep-app-tools komen daar BOVENOP, dynamisch
      // gefilterd op tracking-flag — zie OVERVIEW_APP_SUBROUTES.
      { label: 'Bezittingen', href: '/overzicht/bezittingen' },
      { label: 'Schulden', href: '/overzicht/schulden' },
      { label: 'Cashflow', href: '/overzicht/cashflow' },
      {
        label: 'Belasting',
        href: '/overzicht/belasting',
        // Box-subpagina's — geneste, contextuele subroutes (zie NavMenuSheet).
        children: [
          { label: 'Box 1 · Werk + woning', href: '/overzicht/belasting/box1' },
          { label: 'Box 2 · Aanmerkelijk belang', href: '/overzicht/belasting/box2' },
          { label: 'Box 3 · Sparen + beleggen', href: '/overzicht/belasting/box3' },
          { label: 'Fiscale optimizer', href: '/overzicht/belasting/optimizer' },
        ],
      },
    ],
  },
  {
    parent: mainNav[1]!,
    items: [
      // Toekomst-subnavigatie: Tijdas (/toekomst) is de landing met
      // navigatiekaarten; Doelen/Gebeurtenissen/Voorkeuren/Rekenhulp en
      // Wat-Als hebben elk een eigen subroute.
      { label: 'Tijdas', href: '/toekomst' },
      { label: 'Doelen', href: '/toekomst/doelen' },
      { label: 'Gebeurtenissen', href: '/toekomst/gebeurtenissen' },
      { label: 'Voorkeuren', href: '/toekomst/voorkeuren' },
      { label: 'Rekenhulp', href: '/toekomst/rekenhulp' },
      { label: 'Wat-Als', href: '/toekomst/whatif' },
    ],
  },
  {
    parent: mainNav[2]!,
    // Plan §6.4 + §6.10: nieuwe nav verwijst naar /mijn-sub-routes
    // i.p.v. legacy /identity/*. De legacy routes blijven werken via
    // bestaande server-pagina's, maar zijn niet meer in de nav.
    items: [
      { label: 'Profiel', href: '/mijn/profiel' },
      { label: 'Account', href: '/mijn/account' },
      { label: 'Privacy', href: '/mijn/privacy' },
      { label: 'Koppelingen', href: '/mijn/koppelingen' },
      { label: 'Notificaties', href: '/mijn/notificaties' },
      { label: 'Uiterlijk', href: '/mijn/uiterlijk' },
      { label: 'Geavanceerd', href: '/mijn/geavanceerd' },
    ],
  },
]

/**
 * Nav-ingangen die in de Eenvoudig-weergave (`useDisplayMode().mode === 'simple'`)
 * verborgen worden op de navigatie-oppervlakken (desktop-sidebar, mobiele
 * nav-sheet, command-palette ⌘K). De pagina's blijven via deeplink én in de
 * Volledig-weergave bereikbaar — dit filtert ALLEEN de menu-ingang, niet de
 * route. `navGroups`/`EXTRA_ROUTE_TITLES` blijven ongewijzigd, zodat
 * `resolveRouteTitle()` (mobiele TopBar-titel) deze routes blijft dekken.
 */
export const SIMPLE_HIDDEN_NAV_HREFS: readonly string[] = [
  '/toekomst/rekenhulp',
  '/toekomst/whatif',
]

/**
 * Overzicht-sub-tools (deep-app-tools) per appKey — dynamisch gefilterd op
 * de active-tracking-flag op assets/debts. Sidebar én NavMenuSheet lezen
 * deze lijst en tonen alleen items waarvan `appKey` voorkomt in de
 * runtime `activeAppKeys` (via useActiveAppKeys-context op mobiel, of
 * `activeAppKeys`-prop op de sidebar).
 *
 * Bron-of-truth voor appKey-slugs is `getActiveAppKeys()` uit
 * components/core/category-deepening-registry.ts. Toevoegen van een
 * nieuwe deep-tool: hier registreren én registry bijwerken.
 */
export type OverviewAppItem = NavItem & {
  appKey: string
  /**
   * Deeplink die de verdiepingstab meteen opent (`?tab=…`). BEWUST gescheiden
   * van `href` — zie de M41-toelichting hieronder. Alleen het commandopalet
   * gebruikt dit veld; de navigatie (sidebar + nav-sheet) gebruikt `href`.
   */
  tabHref?: string
}

/**
 * M41 (28 aug 2026) — `href` is de **kale categorie-route**, niet de
 * `?tab=`-deeplink.
 *
 * Twee losstaand-correcte besluiten van 9 aug botsten in combinatie: NAV-1 werd
 * afgewezen (het Apps-blok blijft óók in Eenvoudig zichtbaar) terwijl BEZ-4 de
 * verdiepingstabs juist Volledig-only maakte — mét de bewuste uitzondering dat
 * een binnenkomende `?tab=`-deeplink de tab zichtbaar én actief houdt
 * (`CategoryTabs.simpleBaseTabKey`). Omdat deze nav-links rechtstreeks naar die
 * deeplink wezen, landde één zijbalk-klik in Eenvoudig direct in het expert-
 * scherm dat BEZ-4 buiten het standaardpad wilde houden. Zonder de deeplink
 * landt de gebruiker op de gewone categorielijst en kan hij zelf doorklikken;
 * NAV-1 én BEZ-4 blijven daarmee allebei overeind.
 *
 * Het commandopalet houdt wél de deeplink (`tabHref`): daar tikt de gebruiker
 * de app expliciet bij naam aan — hetzelfde "je moet er zelf om vragen"-patroon
 * als de URL van rekenhulp/whatif. Bovendien vereist M10 dat elke app een
 * eigen, unieke palet-href heeft; de kale routes bestaan daar al als gewone
 * categoriepagina's ("Beleggingen", "Crypto", "Hypotheek", "Vastgoed").
 *
 * NB: contextuele deeplinks elders (coach-suggesties, widget-catalogus,
 * compound-insight-kaart, not-found-pagina's) blijven bewust ongemoeid — die
 * volgen op een expliciete gebruikersvraag over dát onderwerp.
 */
export const OVERVIEW_APP_SUBROUTES: OverviewAppItem[] = [
  { label: 'Budgetteren', href: '/overzicht/cashflow/budget', appKey: 'budgetteren' },
  { label: 'Aandelen holdings', href: '/overzicht/bezittingen/investment', tabHref: '/overzicht/bezittingen/investment?tab=aandelen-holdings', appKey: 'aandelen-holdings' },
  { label: 'Crypto holdings', href: '/overzicht/bezittingen/crypto', tabHref: '/overzicht/bezittingen/crypto?tab=crypto-holdings', appKey: 'crypto-holdings' },
  { label: 'Hypotheekplanner', href: '/overzicht/schulden/mortgage', tabHref: '/overzicht/schulden/mortgage?tab=hypotheekplanner', appKey: 'hypotheekplanner' },
  { label: 'Verhuurrendement', href: '/overzicht/bezittingen/real_estate', tabHref: '/overzicht/bezittingen/real_estate?tab=verhuurrendement', appKey: 'verhuurrendement' },
]

/**
 * Globale items — altijd beschikbaar onderaan het menu (tips, krant, berichten,
 * coach-chat, account/settings). Verschijnen ook als topbar-iconen op desktop.
 *
 * "Tips & acties" staat vooraan en spiegelt daarmee `OVERIGE_BASE` in de
 * desktop-sidebar (ADR 0095). Zonder die regel ontbrak de pagina volledig in
 * de mobiele nav-sheet: daar was ze alleen bereikbaar via /overzicht-links,
 * ⌘K, de gezondheidsscore-kassabon of een AI-actionUrl. Bewust géén badge —
 * het numerieke ongelezen-getal blijft exclusief bij Berichten.
 */
export const globalNav: GlobalNavItem[] = [
  { label: 'Tips & acties', icon: Zap, href: '/overzicht/tips' },
  { label: 'Krant', icon: Newspaper, href: '/nieuws' },
  { label: 'Berichten', icon: Bell, href: '/berichten' },
  { label: 'Vraag Fin', icon: MessageCircle, action: 'open-chat' },
  { label: 'Account', icon: Settings, action: 'open-account' },
]

/**
 * Canonieke subpagina-titels die NIET in de nav-structuur (mainNav/navGroups/
 * OVERVIEW_APP_SUBROUTES/globalNav) staan, maar wél een eigen route + pagina
 * hebben. Bron voor de mobiele TopBar-titel-fallback (`resolveRouteTitle`).
 *
 * Elke route hieronder is geverifieerd tegen `app/(app)/<route>/page.tsx`.
 * Dynamische routes (bv. /toekomst/bibliotheek/[id]) horen hier bewust NIET:
 * die hebben een runtime-afhankelijke titel en leveren die via <NavStackMeta>.
 * Redirect-only routes evenmin: /toekomst/strategie en
 * /toekomst/uitgaven-na-pensioen redirecten sinds de React #310-opruiming op
 * de routing-laag (next.config.ts) en renderen geen TopBar meer — een titel
 * hier zou naar een pagina wijzen die niet bestaat.
 */
export const EXTRA_ROUTE_TITLES: Record<string, string> = {
  '/toekomst/bibliotheek': 'Rekenhulp-bibliotheek',
  '/toekomst/inflatie-koopkracht': 'Inflatie & koopkracht',
  '/toekomst/samengestelde-interest': 'Samengestelde interest',
  '/mijn/checkins': 'Check-ins',
  // Jaaroverzicht zit — net als Check-ins — wél in het kaartengrid op /mijn
  // (`components/mijn/mijn-overview.tsx`) maar niet in `navGroups`. Eén ingang
  // per functie; de TopBar-titel komt dus hiervandaan.
  '/mijn/jaaroverzicht': 'Jaaroverzicht',
  // Mijlpalen: idem — alleen in het kaartengrid op /mijn, niet in `navGroups`.
  '/mijn/mijlpalen': 'Mijlpalen',
  '/mijn/lokale-chat': 'Lokale chat',
  // ADR 0096: geen inzendformulier meer maar een verwijspagina naar de
  // meldmodus. De mobiele TopBar valt hierop terug (de pagina zet geen eigen
  // <NavStackMeta>), dus deze titel moet "Melden" zeggen — net als ⌘K en de
  // kop van de pagina zelf.
  '/mijn/feedback': 'Melden',
  // Rapportages-familie — eigen routes buiten de nav-structuur. De titels
  // spiegelen exact de `<NavStackMeta title>` van elke pagina, zodat de
  // SSoT-fallback en de pagina niet uiteenlopen. De dynamische
  // /rapportages/[id] hoort hier bewust NIET: die levert een runtime-titel
  // via <NavStackMeta>.
  '/rapportages': 'Rapportages',
  '/rapportages/balans': 'Balans-rapportage',
  '/rapportages/vermogen': 'Vermogensoverzicht',
  '/rapportages/budget': 'Budget-rapportage',
  '/rapportages/benchmark': 'Benchmark',
  '/rapportages/persoonlijk-plan': 'Persoonlijk plan',
  '/rapportages/totaalplan': 'Totaalplan',
  // Cashflow-verdiepingen onder /overzicht/cashflow. /overzicht/cashflow zelf
  // en .../budget zitten al in de nav (navGroups resp. OVERVIEW_APP_SUBROUTES);
  // deze drie niet. Titels = de `<NavStackMeta title>` per pagina.
  // NB: /overzicht/tips stond hier tot ADR 0095 — die route zit nu in
  // `globalNav` en levert zijn titel dus uit de nav-structuur zelf.
  '/overzicht/cashflow/forecast': 'Forecast',
  '/overzicht/cashflow/transacties': 'Transacties',
  '/overzicht/cashflow/vaste-lasten': 'Vaste lasten',
}

/**
 * Strip querystring + hash + trailing slash van een pathname zodat de
 * exact-match-lookup robuust blijft tegen URL-varianten.
 */
function normalizePathname(pathname: string): string {
  let p = pathname.split('?')[0]!.split('#')[0]!
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

/**
 * Bouw één keer een exact-match map `href → label` uit alle nav-bronnen.
 * Module-lazy gemaakt zodat we niet bij elke lookup opnieuw bouwen.
 */
let routeTitleMap: Map<string, string> | null = null

function buildRouteTitleMap(): Map<string, string> {
  const map = new Map<string, string>()

  const add = (href: string | undefined, label: string) => {
    if (!href) return
    const key = normalizePathname(href)
    // Eerste winnaar behouden — mainNav/navGroups gaan vóór EXTRA's. Zo wint
    // voor /toekomst bewust de mainNav-titel ("Toekomst") boven het navGroups-
    // item met hetzelfde href ("Tijdas"): dat item is zichtbare menu-structuur,
    // de dubbele titel-registratie is onschuldig — de eerste winnaar telt.
    if (!map.has(key)) map.set(key, label)
  }

  // Hoofdpagina's. Bewust óók opgenomen voor volledigheid; de TopBar vult
  // alleen op `simple`-subpagina's een fallback in, dus tab-roots blijven leeg.
  for (const item of mainNav) add(item.href, item.label)

  // Alle subroutes onder elke hoofdpagina, inclusief geneste children (Box 1/2/3).
  for (const group of navGroups) {
    for (const item of group.items) {
      add(item.href, item.label)
      if (item.children) {
        for (const child of item.children) add(child.href, child.label)
      }
    }
  }

  // Deep-app-tools. Hun `href` is sinds M41 al de kale route (de `?tab=`-
  // deeplink staat apart in `tabHref`); `add` normaliseert bovendien.
  for (const item of OVERVIEW_APP_SUBROUTES) add(item.href, item.label)

  // Globale items met een echte route (Krant/Berichten); action-items overslaan.
  for (const item of globalNav) add(item.href, item.label)

  // Canonieke extra-routes buiten de nav-structuur.
  for (const [href, label] of Object.entries(EXTRA_ROUTE_TITLES)) add(href, label)

  return map
}

/**
 * Resolve de paginatitel voor een route via exact-match tegen de nav-config
 * (single source). Gebruikt door de mobiele TopBar als fallback wanneer een
 * subpagina geen `<NavStackMeta title>` registreert.
 *
 * - EXACT-match (geen prefix-magie): dynamische routes worden bewust via
 *   <NavStackMeta> afgehandeld, niet hier.
 * - Querystring/hash/trailing-slash worden genormaliseerd vóór de lookup.
 * - Retourneert `null` als er geen match is.
 */
export function resolveRouteTitle(pathname: string): string | null {
  if (!pathname) return null
  if (!routeTitleMap) routeTitleMap = buildRouteTitleMap()
  return routeTitleMap.get(normalizePathname(pathname)) ?? null
}
