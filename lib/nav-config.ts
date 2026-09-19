import type { ComponentType } from 'react'
import { Wallet, Compass, User, Newspaper, Bell, MessageCircle, Settings, Zap, BarChart3, Home } from 'lucide-react'
import { HEFBOOM_CONFIG } from '@/lib/hefboom-config'

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
    description: 'Doelen, gebeurtenissen, voorkeuren, rekenhulp',
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
      {
        label: 'Budget',
        href: '/overzicht/budget',
        // De drie onderdelen — geneste, contextuele subroutes, net als de
        // Box-pagina's onder Belasting. Stonden er niet toen budget zelf nog een
        // laag dieper zat achter de cashflow-hub (UR3-28).
        children: [
          { label: 'Transacties', href: '/overzicht/budget/transacties' },
          { label: 'Vaste lasten', href: '/overzicht/budget/vaste-lasten' },
          // "Vooruitblik", niet "Forecast" (UR3-13 F2, optie C): een Engels
          // leenwoord met een gangbaar Nederlands equivalent hernoemen we aan
          // de bron, in béide weergavemodi — niet via een simpelLabel dat
          // alleen wérkt waar <GlossaryTerm> staat. De URL blijft ongewijzigd.
          { label: 'Vooruitblik', href: '/overzicht/budget/forecast' },
          // Vierde ingang, géén vierde onderdeel: hier stel je in waar de
          // cijfers op rusten (inkomen/uitgaven/spaarquote) en welke rekeningen
          // in budgetteren meelopen. Staat hier óók om de mobiele TopBar-titel
          // te voeden — `resolveRouteTitle()` leest deze boom (W-002).
          { label: 'Instellingen', href: '/overzicht/budget/instellingen' },
        ],
      },
      {
        label: 'Belasting',
        href: '/overzicht/belasting',
        // Box-subpagina's — geneste, contextuele subroutes (zie NavMenuSheet).
        children: [
          { label: 'Box 1 · Werk + woning', href: '/overzicht/belasting/box1' },
          { label: 'Box 2 · Aanmerkelijk belang', href: '/overzicht/belasting/box2' },
          { label: 'Box 3 · Sparen + beleggen', href: '/overzicht/belasting/box3' },
          // "Fiscale kansen" i.p.v. "Fiscale optimizer" — zelfde regel als
          // Vooruitblik hierboven (UR3-13 F2, optie C). De pagina zelf sprak al
          // over "kansen"; alleen het menu-label liep nog achter.
          { label: 'Fiscale kansen', href: '/overzicht/belasting/optimizer' },
        ],
      },
    ],
  },
  {
    parent: mainNav[1]!,
    items: [
      // Toekomst-subnavigatie. "Tijdas" stond hier tot 15 sep 2026 als eerste
      // item, maar wees naar /toekomst zelf — dezelfde plek als de hoofdpagina
      // erboven. Eén ingang per plek: de hoofdpagina ís de tijdas.
      { label: 'Doelen', href: '/toekomst/doelen' },
      { label: 'Gebeurtenissen', href: '/toekomst/gebeurtenissen' },
      { label: 'Voorkeuren', href: '/toekomst/voorkeuren' },
      { label: 'Rekenhulp', href: '/toekomst/rekenhulp' },
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
      { label: 'Weergave en uiterlijk', href: '/mijn/uiterlijk' },
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
 * not-found-pagina's) blijven bewust ongemoeid — die volgen op een expliciete
 * gebruikersvraag over dát onderwerp. De compound-insight-kaart stond hier ook
 * in dat rijtje, maar linkt sinds M41 naar /overzicht/bezittingen; ze was
 * daarmee stilletjes de laatste ingang van /toekomst/samengestelde-interest
 * kwijt (UR3-26).
 */
export const OVERVIEW_APP_SUBROUTES: OverviewAppItem[] = [
  { label: 'Aandelen holdings', href: '/overzicht/bezittingen/investment', tabHref: '/overzicht/bezittingen/investment?tab=aandelen-holdings', appKey: 'aandelen-holdings' },
  { label: 'Crypto holdings', href: '/overzicht/bezittingen/crypto', tabHref: '/overzicht/bezittingen/crypto?tab=crypto-holdings', appKey: 'crypto-holdings' },
  { label: 'Hypotheekplanner', href: '/overzicht/schulden/mortgage', tabHref: '/overzicht/schulden/mortgage?tab=hypotheekplanner', appKey: 'hypotheekplanner' },
  { label: 'Verhuurrendement', href: '/overzicht/bezittingen/real_estate', tabHref: '/overzicht/bezittingen/real_estate?tab=verhuurrendement', appKey: 'verhuurrendement' },
]

/** Sleutel in `LeverScores` (components/app/shell/lever-compass) voor de statusstip. */
export type MenuLeverKey = 'assets' | 'debts' | 'cashflow' | 'tax'

export type MenuEntry = NavItem & {
  icon: NavIcon
  color: NavColor
  /** Hefboom waarvan de statusstip naast deze hoofdpagina staat. */
  leverKey?: MenuLeverKey
  /**
   * `'plan'` → de statusstip is het plan-stoplicht (`usePlanStatus`, nagestreamd
   * uit de layout) i.p.v. een hefboomscore. Alleen De toekomst.
   */
  statusSource?: 'plan'
  /** Verdiepende apps onder deze hoofdpagina; zichtbaar per `activeAppKeys`. */
  apps?: OverviewAppItem[]
}

/**
 * Het zichtbare menu — desktop-zijbalk én mobiele nav-sheet lezen deze lijst.
 *
 * Plat, op één niveau (15 sep 2026): Home, de vier hefbomen en De toekomst.
 * Tot dan groepeerde het menu onder "Twee modules" (Het Overzicht / De
 * Toekomst), waardoor de hefbomen sub-items van een startpagina leken en hun
 * eigen onderdelen (Box 1/2/3, Transacties…) pas op een derde niveau kwamen.
 * Nu is elke hefboom een hoofdpagina en zijn zijn onderdelen gewone subpagina's.
 *
 * `mainNav`/`navGroups` blijven bestaan als titel- en tab-root-register
 * (resolveRouteTitle, de mobiele TopBar); deze lijst leidt zijn onderdelen
 * daaruit af, zodat labels en hrefs één bron houden.
 *
 * Home = /overzicht, de pagina met de briefing, widgets en het kompas. Die
 * route blijft de tab-root "Overzicht"; alleen het menu noemt hem Home.
 *
 * Kleur per hoofdpagina = het accent van dat onderdeel (kleurconventie in
 * CLAUDE.md, gespiegeld aan HEFBOOM_CONFIG.tint): Bezittingen `amber`→kern,
 * Schulden `teal`→wil, Budget `purple`→horizon, De toekomst `purple`→horizon
 * (route-accent /toekomst). Belasting heeft bewust geen accent (UR3-32) en Home
 * is geen hefboom: beide `stone`, neutraal ink.
 */
function overzichtItem(href: string): NavItem {
  const item = navGroups[0]!.items.find((i) => i.href === href)
  if (!item) throw new Error(`nav-config: ${href} ontbreekt in navGroups`)
  return item
}

const appsUnder = (prefix: string): OverviewAppItem[] =>
  OVERVIEW_APP_SUBROUTES.filter((a) => a.href.startsWith(prefix + '/'))

export const menuNav: MenuEntry[] = [
  {
    label: 'Home',
    href: '/overzicht',
    icon: Home,
    // Home is geen hefboom en krijgt dus geen hefboom-accent: neutraal.
    color: 'stone',
    description: 'Je briefing, widgets en kompas',
  },
  {
    ...overzichtItem('/overzicht/bezittingen'),
    icon: HEFBOOM_CONFIG.bezittingen.Icon,
    color: 'amber',
    leverKey: 'assets',
    apps: appsUnder('/overzicht/bezittingen'),
  },
  {
    ...overzichtItem('/overzicht/schulden'),
    icon: HEFBOOM_CONFIG.schulden.Icon,
    color: 'teal',
    leverKey: 'debts',
    apps: appsUnder('/overzicht/schulden'),
  },
  {
    ...overzichtItem('/overzicht/budget'),
    icon: HEFBOOM_CONFIG.cashflow.Icon,
    color: 'purple',
    leverKey: 'cashflow',
  },
  {
    ...overzichtItem('/overzicht/belasting'),
    icon: HEFBOOM_CONFIG.belasting.Icon,
    color: 'stone',
    leverKey: 'tax',
  },
  {
    label: 'De toekomst',
    href: '/toekomst',
    icon: Compass,
    color: 'purple',
    statusSource: 'plan',
    description: mainNav[1]!.description,
    children: navGroups[1]!.items,
  },
]

/**
 * Staat de gebruiker op (of onder) deze hoofdpagina? Home is exact-match:
 * /overzicht/bezittingen hoort bij Bezittingen, niet ook bij Home.
 */
export function isMenuEntryActive(pathname: string, href: string): boolean {
  if (href === '/overzicht') return pathname === '/overzicht'
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * Globale items — altijd beschikbaar onderaan het menu (tips, krant, berichten,
 * coach-chat, account/settings). Verschijnen ook als topbar-iconen op desktop.
 *
 * "Tips & acties" staat vooraan en spiegelt daarmee `OVERIGE_BASE` in de
 * desktop-sidebar (ADR 0095). Zonder die regel ontbrak de pagina volledig in
 * de mobiele nav-sheet: daar was ze alleen bereikbaar via /overzicht-links,
 * ⌘K, de gezondheidsscore-kassabon of een AI-actionUrl. Bewust géén badge —
 * het numerieke ongelezen-getal blijft exclusief bij Berichten.
 *
 * "Rapportages" volgt dezelfde redenering (UR3-26). De pagina stond in de
 * desktop-sidebar (`OVERIGE_BASE`) en in ⌘K, maar op mobiel alléén in het
 * account-dropdownmenu van de TopBar — en dat menu rendert uitsluitend bij
 * `topBar.kind === 'rich'` in een `lg:hidden`-balk. Een account-menu is een
 * ander mentaal model dan navigatie, dus de route ontbrak feitelijk in de
 * mobiele nav-sheet. Exact het ADR 0095-patroon, in de andere richting.
 */
export const globalNav: GlobalNavItem[] = [
  { label: 'Tips & acties', icon: Zap, href: '/overzicht/tips' },
  { label: 'Krant', icon: Newspaper, href: '/nieuws' },
  { label: 'Berichten', icon: Bell, href: '/berichten' },
  { label: 'Rapportages', icon: BarChart3, href: '/rapportages' },
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
  // '/toekomst/samengestelde-interest' stond hier tot UR3-26. Die route had nul
  // ingangen (geen menu, geen ⌘K, geen enkele in-app link) sinds de
  // compound-insight-kaart naar /overzicht/bezittingen verhuisde; hij redirect
  // nu op de routing-laag naar de rekenhulp-bibliotheek en bestaat niet meer
  // als pagina. Een titel hier zou naar een niet-bestaande pagina wijzen.
  // '/mijn/checkins' hoort hier BEWUST NIET (WF-NAV-05): die route is een
  // letterlijke re-export van app/(app)/core/checkin/historie/page.tsx, en dat
  // component registreert zelf `<NavStackMeta title="Check-in historie" />`.
  // Een expliciete paginatitel wint terecht van deze fallbackkaart, dus een
  // entry hier zou nooit gelezen worden — dode configuratie die suggereert dat
  // de TopBar "Check-ins" toont terwijl er "Check-in historie" staat. Voeg 'm
  // niet opnieuw toe; wil je de titel wijzigen, doe dat in de historie-pagina.
  //
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
  // NB: de hub '/rapportages' zelf staat sinds UR3-26 in `globalNav` en levert
  // zijn titel daarvandaan — dezelfde verhuizing als /overzicht/tips bij ADR
  // 0095. Hem hier laten staan zou dode configuratie zijn (`buildRouteTitleMap`
  // neemt de eerste winnaar, en globalNav gaat vóór EXTRA_ROUTE_TITLES).
  '/rapportages/balans': 'Balans-rapportage',
  '/rapportages/vermogen': 'Vermogensoverzicht',
  '/rapportages/budget': 'Budget-rapportage',
  '/rapportages/benchmark': 'Benchmark',
  '/rapportages/persoonlijk-plan': 'Persoonlijk plan',
  '/rapportages/totaalplan': 'Totaalplan',
  // De drie onderdelen van Budget stonden hier zolang ze buiten de nav vielen.
  // Sinds UR3-28 zijn ze `children` van de Budget-hefboom in `navGroups` en
  // leveren ze hun titel dus uit de nav-structuur zelf — hier laten staan zou
  // een tweede bron voor dezelfde titel zijn (`buildRouteTitleMap` neemt de
  // eerste winnaar, dus dat blijft stil fout gaan).
  // NB: /overzicht/tips stond hier tot ADR 0095 — die route zit nu in
  // `globalNav` en levert zijn titel op dezelfde manier.
}

/**
 * MERKTAAL EN UITZONDERINGEN — waarom een route méér dan één naam mag dragen.
 *
 * Een label zit in deze app op vier tot zes plekken: deze nav-config, de
 * zijbalk-literals, het commandopalet, het avatar-menu in de TopBar, het
 * kruimelpad en de pagina zelf. Eén naam per concept is de regel (bevinding
 * M14: de zijbalk zei drie weken "Nieuws" terwijl de rest "Krant" zei).
 *
 * `lib/nav-config.naamconsistentie.test.ts` dwingt die regel af en leest déze
 * kaart als allowlist: staat een href hier niet, dan moeten alle bronnen exact
 * hetzelfde label dragen. Een uitzondering toevoegen kan — maar alleen mét de
 * reden erbij, zodat criterium 2 van UR3-30 ("is vastgelegd waarom dat label
 * die uitzondering verdient") afdwingbaar is in plaats van beschrijvend.
 *
 * LET OP het verschil met `MERKTAAL_VERANTWOORDING` hieronder: dáár staat
 * waaróm een metafoor als naam behouden blijft. Dat is géén vrijstelling —
 * "Krant" moet juist overal exact "Krant" heten. Alleen een route die écht
 * twee namen draagt hoort hieronder.
 */
export const LABEL_UITZONDERINGEN: Record<string, string> = {
  // De vier deep-app-routes: sinds M41 draagt de app-tegel de KALE
  // categorie-route als href, terwijl diezelfde route ook een gewone
  // categoriepagina is met een eigen naam. Twee namen, maar geen drift: de
  // pagina levert haar eigen <NavStackMeta title>, dus de gebruiker ziet altijd
  // de categorienaam; de app-naam staat alleen op de tegel die ernaartoe wijst.
  '/overzicht/bezittingen/investment':
    'Pagina = "Beleggingen" (categorie), tegel = "Aandelen holdings" (verdiepende app op die categorie). Zie M41.',
  '/overzicht/bezittingen/crypto':
    'Pagina = "Crypto" (categorie), tegel = "Crypto holdings" (verdiepende app). Zie M41.',
  '/overzicht/bezittingen/real_estate':
    'Pagina = "Vastgoed" (categorie), tegel = "Verhuurrendement" (verdiepende app). Zie M41.',
  '/overzicht/schulden/mortgage':
    'Pagina = "Hypotheek" (categorie), tegel = "Hypotheekplanner" (verdiepende app). Zie M41.',
}

/**
 * MERKTAAL — welke metaforen als naam blijven staan, en waarom.
 *
 * Besluit 6 sep 2026 (UR3-30), na het beginner-onderzoek: "vertalen, niet
 * wegnemen". Vier metaforische menulabels lagen op tafel; precies één is
 * hernoemd, één blijft, één was een restant en één bleek helemaal geen
 * metafoor. Deze kaart legt de overgebleven merktaal vast — acceptatiecriterium
 * 2 van die kaart vraagt letterlijk dat vastligt waarom een label de
 * uitzondering verdient.
 *
 * Dit is NADRUKKELIJK geen vrijstelling van de naamconsistentie: een naam die
 * blijft, moet op álle bronnen hetzelfde luiden. `resolveRouteTitle` is en
 * blijft de canonieke naam; `nav-config.naamconsistentie.test.ts` toetst dat.
 */
export const MERKTAAL_VERANTWOORDING: Record<string, string> = {
  '/nieuws':
    'Blijft "Krant". De metafoor draagt de hele editorial-ontwerptaal (kicker, katern, colofon) en de landingbelofte; twee van de drie testpersona\'s noemden het woord onbekend, maar niemand liep vast. De twee botsingen zijn weggenomen: de masthead op /nieuws zegt nu zelf "De Krant", en het gelijknamige palet op /mijn/uiterlijk heet sinds UR3-30 "Redactioneel wit".',
  '/toekomst':
    'Heet in het menu en in de TopBar "Toekomst" / "De toekomst" — gewone taal, want daar zoekt een gebruiker. De metafoor "tijdas" leeft op de pagina zelf ("Je tijdas") en in het ⌘K-sublabel, waar hij pal naast het ding staat dat hij benoemt. De derde naam — een sub-item "Tijdas" dat naar zijn eigen ouder wees — is 15 sep 2026 verwijderd.',
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
    // Eerste winnaar behouden — mainNav/navGroups gaan vóór EXTRA's.
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
