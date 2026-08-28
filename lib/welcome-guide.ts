// ── Welkomstgids ─────────────────────────────────────────────────────────
// Data-model + pure helpers voor de multi-scherm welkomstgids die na het
// onboarden bovenaan /overzicht verschijnt. De gids leidt de gebruiker langs
// het aanvullen van zijn gegevens in 5 schermen (3 vast + 2 optioneel), elk met
// maximaal 4 handmatig-afvinkbare stappen.
//
// Twee opslaglagen (geen schema-wijziging nodig):
//  - CONFIG (welke schermen/stappen): app_settings key `welcome_guide_config`,
//    leesbaar door élke ingelogde user, alleen schrijfbaar door superadmin.
//    Spiegelt `coach_config`.
//  - PER-USER STAAT (afvinken/voortgang/sluiten): genest onder de bestaande
//    `profiles.module_guide_state` jsonb-kolom, top-level key `welcome:guide`.
//    Sinds 11 aug 2026 is dit de ENIGE levende lezer/schrijver van die kolom
//    (naast /api/module-guide/progress): de standard-/module-guide-hooks en de
//    `goal:`-completion-detector zijn verwijderd als dode gids-code.
//
// Dit bestand is PUUR: geen React, geen Supabase, geen lucide-imports — zo
// bruikbaar in zowel server- als client-context en triviaal te testen.

// ── Settings-/state-sleutels ───────────────────────────────────────────────

export const WELCOME_GUIDE_SETTINGS_KEY = 'welcome_guide_config' as const
export const WELCOME_GUIDE_MODULE_KEY = 'welcome:guide' as const

// ── Toegestane iconen ───────────────────────────────────────────────────────
// Alleen namen (strings); de naam→component-map leeft in guide-screen-view.tsx
// (lucide is client-only). De beheer-UI biedt deze lijst als dropdown.

export const ALLOWED_ICONS = [
  'Wallet',
  'Landmark',
  'PiggyBank',
  'Banknote',
  'Upload',
  'TrendingUp',
  'LineChart',
  'BarChart3',
  'CalendarClock',
  'Calendar',
  'Receipt',
  'Sparkles',
  'Newspaper',
  'Calculator',
  'Target',
  'Settings2',
  'LayoutGrid',
  'HeartPulse',
  'Lightbulb',
  'Compass',
  'Flag',
  'Home',
] as const

export type GuideIcon = (typeof ALLOWED_ICONS)[number]

// ── Types ─────────────────────────────────────────────────────────────────

export interface WelcomeGuideStep {
  /** Stabiele slug; voortgang wordt hierop bewaard. */
  id: string
  /** Vraag/prompt, bv. "Zijn al je bezittingen geregistreerd?" */
  title: string
  /** Korte toelichting, bv. "zoals eigen huis, cash rekeningen en aandelen". */
  description?: string
  /** Bestemming (gewone route of deeplink met query). Leeg = geen link. */
  href?: string
  /** Lucide-naam uit ALLOWED_ICONS. */
  icon?: GuideIcon
  enabled: boolean
}

export interface WelcomeGuideScreen {
  id: string
  title: string
  intro?: string
  /** 'process' = genummerde stappen links→rechts; 'list' = verticale lijst. */
  layout: 'process' | 'list'
  /** true = altijd zichtbaar (de eerste 3 schermen). */
  required: boolean
  enabled: boolean
  steps: WelcomeGuideStep[]
}

export interface WelcomeGuideConfig {
  enabled: boolean
  /** Kicker bovenaan de kaart. */
  kicker: string
  screens: WelcomeGuideScreen[]
}

/** Per-user staat, genest onder module_guide_state['welcome:guide']. */
export interface WelcomeGuideState {
  /** Handmatig afgevinkte stap-ids → groen. */
  completedStepIds: string[]
  /** Hervat-positie: index in de zichtbare schermen. */
  currentScreen: number
  /** Aantal ontgrendelde schermen (default = aantal required-schermen). */
  revealedScreens: number
  /**
   * Ingeklapt tot het punt naast de pagina-'i' (meldingen-conventie, S13).
   * Cross-device onthouden — in tegenstelling tot de vroegere sessie-vlag — en
   * ALTIJD heropenbaar via dat punt; dat is het verschil met
   * `status: 'dismissed'`, dat de gids voorgoed weghaalt.
   */
  minimized: boolean
  /** 'dismissed' = voorgoed verborgen ("geen schermen meer tonen"). */
  status: 'active' | 'dismissed'
}

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_WELCOME_GUIDE: WelcomeGuideConfig = {
  enabled: true,
  kicker: 'Welkom bij TriFinity',
  screens: [
    {
      id: 'overzicht-compleet',
      title: '',
      layout: 'process',
      required: true,
      enabled: true,
      steps: [
        {
          id: 's1-bezittingen',
          title: 'Zijn al je bezittingen geregistreerd?',
          description: 'Zoals eigen huis, cash rekeningen en aandelen.',
          href: '/overzicht/bezittingen',
          icon: 'Landmark',
          enabled: true,
        },
        {
          id: 's1-schulden',
          title: 'Zijn al je schulden geregistreerd?',
          description: 'Zoals hypotheek of studieschuld.',
          href: '/overzicht/schulden',
          icon: 'Banknote',
          enabled: true,
        },
        {
          id: 's1-budget',
          title: 'Heb je een budgetplan aangemaakt?',
          description: 'Verdeel je inkomsten en uitgaven over categorieën.',
          href: '/overzicht/cashflow/budget?newBudget=true',
          icon: 'Wallet',
          enabled: true,
        },
        {
          id: 's1-rekening',
          title: 'Heb je een rekening gekoppeld of een CSV geüpload?',
          description: 'Koppel je bank of upload een afschrift uit je bank.',
          href: '/overzicht/cashflow/transacties',
          icon: 'Upload',
          enabled: true,
        },
      ],
    },
    {
      id: 'toekomst-inrichten',
      title: '',
      layout: 'process',
      required: true,
      enabled: true,
      steps: [
        {
          id: 's2-voorkeuren',
          title: 'Heb je je voorkeuren al aangegeven?',
          description: 'Zie je de grafiek, dan heb je dat al gedaan.',
          href: '/toekomst',
          icon: 'Settings2',
          enabled: true,
        },
        {
          id: 's2-gebeurtenissen',
          title: 'Heb je al levensgebeurtenissen ingevuld of bewerkt?',
          description: 'Zoals AOW of de aanschaf van een auto in de toekomst.',
          href: '/toekomst/gebeurtenissen',
          icon: 'CalendarClock',
          enabled: true,
        },
        {
          id: 's2-uitgaven',
          title: 'Bewerk je uitgave na pensioen',
          description: 'Stel zelf in of laat je budgetten spreken.',
          href: '/toekomst?uitgaven=open',
          icon: 'Receipt',
          enabled: true,
        },
        {
          id: 's2-grafiek',
          title: 'Bekijk je grafiek',
          description: 'Sleep met levensgebeurtenissen en zie de analyses in de fasebalk.',
          href: '/toekomst',
          icon: 'LineChart',
          enabled: true,
        },
      ],
    },
    {
      id: 'tips-acties',
      title: '',
      layout: 'process',
      required: true,
      enabled: true,
      steps: [
        {
          id: 's3-vaste-kosten',
          title: 'Bekijk je terugkerende uitgaven en abonnementen',
          description: 'Je vaste lasten op een rij.',
          href: '/overzicht/cashflow/vaste-lasten',
          icon: 'Receipt',
          enabled: true,
        },
        {
          id: 's3-will',
          title: 'AI: vraag Fin om tips',
          description: 'Klik ook eens op de chatfunctie vanaf een ander scherm voor specifieke tips.',
          href: '/overzicht/tips',
          icon: 'Sparkles',
          enabled: true,
        },
        {
          id: 's3-nieuws',
          title: 'AI: bekijk jouw nieuws',
          description: 'Op jou afgestemde financiële krant.',
          href: '/nieuws',
          icon: 'Newspaper',
          enabled: true,
        },
        {
          id: 's3-rekenhulp',
          title: 'Bekijk een rekenhulp',
          description: 'Zoek in de bibliotheek of maak er één met AI.',
          href: '/toekomst/rekenhulp',
          icon: 'Calculator',
          enabled: true,
        },
      ],
    },
    {
      id: 'verdiep-inzichten',
      title: '',
      layout: 'process',
      required: false,
      enabled: true,
      steps: [
        {
          id: 's4-whatif',
          title: 'Speel met een what-if scenario',
          description: 'Zie direct het effect van keuzes op je vrijheid.',
          href: '/toekomst?whatif=open',
          icon: 'Compass',
          enabled: true,
        },
        {
          id: 's4-belasting',
          title: 'Bekijk je belastinginzichten',
          description: 'Box 1, 2 en 3 op een rij.',
          href: '/overzicht/belasting',
          icon: 'Landmark',
          enabled: true,
        },
        {
          id: 's4-rapportages',
          title: 'Bekijk je rapportages',
          description: 'Balans, vermogen en budget-analyse.',
          href: '/rapportages',
          icon: 'BarChart3',
          enabled: true,
        },
        {
          id: 's4-doelen',
          title: 'Stel doelen in',
          description: 'Bepaal waar je naartoe werkt.',
          href: '/toekomst/doelen',
          icon: 'Target',
          enabled: true,
        },
      ],
    },
    {
      id: 'maak-het-eigen',
      title: '',
      layout: 'process',
      required: false,
      enabled: true,
      steps: [
        {
          id: 's5-widgets',
          title: 'Voeg widgets toe aan je overzicht',
          description: 'Kies welke kaarten je op je overzicht ziet.',
          href: '/mijn/uiterlijk',
          icon: 'LayoutGrid',
          enabled: true,
        },
        {
          id: 's5-briefing',
          title: 'Bekijk de AI-briefing op je overzichtscherm',
          description: 'Je wekelijkse briefing bovenaan /overzicht.',
          href: '/overzicht',
          icon: 'Sparkles',
          enabled: true,
        },
        {
          id: 's5-gezondheid',
          title: 'Bekijk je gezondheidsgetal',
          description: 'Op zowel je overzicht als je toekomst-scherm.',
          href: '/toekomst',
          icon: 'HeartPulse',
          enabled: true,
        },
        {
          id: 's5-grafiek-instellingen',
          title: 'Stel je grafiek in',
          description: 'Natuurlijke mijlpalen, staafdiagram en inkomsten/uitgaven.',
          href: '/toekomst',
          icon: 'Settings2',
          enabled: true,
        },
      ],
    },
  ],
}

/** Aantal required-schermen in de default-config (= start-revealedScreens). */
export const DEFAULT_REVEALED_SCREENS = DEFAULT_WELCOME_GUIDE.screens.filter(
  (s) => s.required,
).length

export const DEFAULT_WELCOME_GUIDE_STATE: WelcomeGuideState = {
  completedStepIds: [],
  currentScreen: 0,
  revealedScreens: DEFAULT_REVEALED_SCREENS,
  minimized: false,
  status: 'active',
}

// ── Config-parsing/validatie ────────────────────────────────────────────────

const ICON_SET = new Set<string>(ALLOWED_ICONS)

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function parseStep(raw: unknown): WelcomeGuideStep | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = asString(r.id)?.trim()
  const title = asString(r.title)?.trim()
  if (!id || !title) return null
  const icon = asString(r.icon)
  return {
    id,
    title,
    description: asString(r.description)?.trim() || undefined,
    href: asString(r.href)?.trim() || undefined,
    icon: icon && ICON_SET.has(icon) ? (icon as GuideIcon) : undefined,
    enabled: r.enabled !== false,
  }
}

function parseScreen(raw: unknown): WelcomeGuideScreen | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = asString(r.id)?.trim()
  // Titel is optioneel (mag leeg) — een scherm wordt door zijn `id` geïdentifi-
  // ceerd, niet door de kop. Lege titel = geen kop in de kaart.
  const title = asString(r.title)?.trim() ?? ''
  if (!id) return null
  const steps = Array.isArray(r.steps)
    ? r.steps.map(parseStep).filter((s): s is WelcomeGuideStep => s !== null)
    : []
  return {
    id,
    title,
    intro: asString(r.intro)?.trim() || undefined,
    layout: r.layout === 'process' ? 'process' : 'list',
    required: r.required === true,
    enabled: r.enabled !== false,
    steps,
  }
}

/**
 * Valideer + normaliseer een ruwe app_settings-waarde naar een
 * WelcomeGuideConfig. Valt volledig terug op DEFAULT_WELCOME_GUIDE bij
 * ongeldige of lege invoer (string-JSON wordt eerst geparsed).
 */
export function parseWelcomeGuideConfig(value: unknown): WelcomeGuideConfig {
  if (value == null) return DEFAULT_WELCOME_GUIDE

  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return DEFAULT_WELCOME_GUIDE
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_WELCOME_GUIDE
  }

  const obj = parsed as Record<string, unknown>
  const screensRaw = obj.screens
  if (!Array.isArray(screensRaw)) return DEFAULT_WELCOME_GUIDE

  const screens = screensRaw
    .map(parseScreen)
    .filter((s): s is WelcomeGuideScreen => s !== null)

  if (screens.length === 0) return DEFAULT_WELCOME_GUIDE

  return {
    enabled: obj.enabled !== false,
    kicker: asString(obj.kicker)?.trim() || DEFAULT_WELCOME_GUIDE.kicker,
    screens,
  }
}

// ── Zichtbaarheid/voortgang-helpers ─────────────────────────────────────────

/**
 * Normaliseer ruwe per-user staat (uit jsonb) naar WelcomeGuideState met veilige
 * defaults. `revealedScreens` valt terug op het aantal required-schermen in de
 * gegeven config.
 */
export function parseWelcomeGuideState(
  value: unknown,
  config: WelcomeGuideConfig,
): WelcomeGuideState {
  const requiredCount = Math.max(
    1,
    config.screens.filter((s) => s.enabled && s.required).length,
  )
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_WELCOME_GUIDE_STATE, revealedScreens: requiredCount }
  }
  const v = value as Record<string, unknown>
  const completedStepIds = Array.isArray(v.completedStepIds)
    ? v.completedStepIds.filter((id): id is string => typeof id === 'string')
    : []
  const totalEnabled = config.screens.filter((s) => s.enabled).length
  const revealedRaw =
    typeof v.revealedScreens === 'number' ? Math.floor(v.revealedScreens) : requiredCount
  const revealedScreens = Math.min(Math.max(revealedRaw, requiredCount), Math.max(totalEnabled, requiredCount))
  const currentRaw = typeof v.currentScreen === 'number' ? Math.floor(v.currentScreen) : 0
  return {
    completedStepIds,
    currentScreen: Math.max(0, currentRaw),
    revealedScreens,
    // Voorwaartse compatibiliteit: bestaande jsonb-rijen kennen het veld niet →
    // `false` (uitgeklapt), precies het gedrag van vóór S13.
    minimized: v.minimized === true,
    status: v.status === 'dismissed' ? 'dismissed' : 'active',
  }
}

/**
 * Zichtbare schermen voor een gegeven staat: alle enabled required-schermen +
 * de eerste (revealedScreens − #required) enabled optionele schermen. Required
 * komt altijd eerst, ongeacht de configuratie-volgorde.
 */
export function getVisibleScreens(
  config: WelcomeGuideConfig,
  state: WelcomeGuideState,
): WelcomeGuideScreen[] {
  const enabled = config.screens.filter((s) => s.enabled)
  const required = enabled.filter((s) => s.required)
  const optional = enabled.filter((s) => !s.required)
  const optionalCount = Math.max(0, state.revealedScreens - required.length)
  return [...required, ...optional.slice(0, optionalCount)]
}

/** Of er na het huidige scherm nog een optioneel scherm te ontgrendelen valt. */
export function hasMoreScreens(
  config: WelcomeGuideConfig,
  state: WelcomeGuideState,
): boolean {
  const enabled = config.screens.filter((s) => s.enabled)
  return getVisibleScreens(config, state).length < enabled.length
}

/**
 * Filter afgevinkte stap-ids tot die welke nog in de config bestaan
 * (orphan-cleanup na verwijderde/hernoemde stappen).
 */
export function reconcileCompleted(
  config: WelcomeGuideConfig,
  completedStepIds: string[],
): string[] {
  const known = new Set<string>()
  for (const screen of config.screens) {
    for (const step of screen.steps) known.add(step.id)
  }
  return completedStepIds.filter((id) => known.has(id))
}

// ── Afgeleide stap-status (M1) ──────────────────────────────────────────────
//
// De gids wist tot nu toe NIETS van wat er al in het account staat: de enige
// schrijver van `completedStepIds` is de handmatige `toggleStep`-actie. Een
// account met 16 bezittingen zag daardoor "0/4 afgevinkt · Zijn al je
// bezittingen geregistreerd?".
//
// Hier staat de HYBRIDE oplossing (kaart M1, optie C):
//  · Een code-side REGISTRY op stap-id (de config leeft als admin-bewerkbare
//    JSONB in app_settings en kan dus geen functies dragen). Onbekende id →
//    geen regel → de stap blijft puur handmatig. Bewuste, veilige degradatie
//    wanneer een beheerder een stap hernoemt of toevoegt.
//  · DRIE toestanden, niet twee: 'nvt' (niet van toepassing) verlaat de noemer,
//    zodat een stap achter een uitgeschakelde module niet als 'done' wordt
//    verkocht én de teller niet onhaalbaar wordt.
//  · AFGELEID ≠ HANDMATIG. De afgeleide staat wordt per render berekend en
//    NOOIT naar `completedStepIds` geschreven: anders blijft een vinkje staan
//    als de data verdwijnt en is uitvinken onmogelijk (jsonb-vervuiling).
//
// Dit blok blijft PUUR — de feiten komen binnen als `GuideAccountFacts`; het
// ophalen ervan woont in `lib/account-status.ts`.

export type GuideStepState = 'done' | 'open' | 'nvt'

/** Stap-id → afgeleide toestand. Ontbrekende sleutel = puur handmatige stap. */
export type GuideDerivedStates = Record<string, GuideStepState>

/**
 * De feiten waarop de afleiding rust: eigen-account-gescopede signalen +
 * de bezochte feature-slugs. Bewust geen `perspective`: een compleetheids-
 * checklist gaat over JOUW account — anders vinkt de gids "bezittingen
 * geregistreerd" af omdat je partner ze heeft.
 */
export interface GuideAccountFacts {
  hasAssets: boolean
  hasDebts: boolean
  hasBudgets: boolean
  hasBankConnection: boolean
  hasTransactions: boolean
  /**
   * Verwacht rendement / inflatie ingevuld. LET OP: beide kolommen hebben een
   * DB-default (0.07 / 0.02), dus dit is voor vrijwel elke gebruiker waar —
   * bruikbaar als coach-signaal, NIET als "heeft de gebruiker iets gekozen".
   * De gids gebruikt 'm daarom bewust niet.
   */
  hasFireParams: boolean
  hasHorizonSetup: boolean
  hasLifeEvents: boolean
  /** Uitgave-na-pensioen bewust gekozen (dus niet de DB-default). */
  hasRetirementExpenseChoice: boolean
  hasGoals: boolean
  hasScenarioPrefs: boolean
  /** Slugs uit `user_feature_visits` (fase 2 — de "heb je hier al gekeken"-stappen). */
  visitedSlugs: readonly string[]
  /** Stappen die voor deze gebruiker niet van toepassing zijn (module uit). */
  notApplicableStepIds: readonly string[]
}

/**
 * Bezoek-slug per gidsstap (fase 2). Ongeveer de helft van de checklist gaat
 * helemaal niet over data maar over "heb je hier al gekeken" — die stappen zijn
 * alleen af te leiden uit een bezoekregister (`user_feature_visits`).
 *
 * BEWUST NIET voor `s5-briefing` (/overzicht) en `s5-gezondheid` (geen eigen
 * route): de gids stáát op /overzicht, dus een bezoeksignaal zou die twee voor
 * iedereen meteen afvinken. Vals-positief is erger dan handmatig.
 *
 * Prefix `guide_` houdt deze slugs los van de bestaande setup-markers in
 * dezelfde tabel (zie `lib/app-setup-status.ts`).
 */
export const GUIDE_VISIT_SLUG_BY_STEP_ID: Readonly<Record<string, string>> = {
  's2-grafiek': 'guide_toekomst_grafiek',
  's3-vaste-kosten': 'guide_vaste_lasten',
  's3-will': 'guide_tips',
  's3-nieuws': 'guide_nieuws',
  's3-rekenhulp': 'guide_rekenhulp',
  's4-whatif': 'guide_whatif',
  's4-belasting': 'guide_belasting',
  's4-rapportages': 'guide_rapportages',
  's5-widgets': 'guide_uiterlijk',
}

/** Alle bezoek-slugs die de gids kent (voor de server-read en de tracker). */
export const GUIDE_VISIT_SLUGS: readonly string[] = Object.values(
  GUIDE_VISIT_SLUG_BY_STEP_ID,
)

/**
 * Route → bezoek-slug. Eén tabel, zodat de tracker-component dom blijft en de
 * afbakening testbaar is. `exact` voor /toekomst (anders zou élke subroute de
 * grafiek-stap afvinken); `prefix` waar diepere routes bij dezelfde functie
 * horen (een nieuwsartikel telt als "nieuws bekeken").
 */
export interface GuideVisitRoute {
  slug: string
  pathname: string
  match: 'exact' | 'prefix'
  /** Optioneel query-paar dat óók moet kloppen (deeplink opent een paneel). */
  query?: readonly [key: string, value: string]
}

export const GUIDE_VISIT_ROUTES: readonly GuideVisitRoute[] = [
  { slug: 'guide_toekomst_grafiek', pathname: '/toekomst', match: 'exact' },
  { slug: 'guide_whatif', pathname: '/toekomst', match: 'exact', query: ['whatif', 'open'] },
  { slug: 'guide_vaste_lasten', pathname: '/overzicht/cashflow/vaste-lasten', match: 'prefix' },
  { slug: 'guide_tips', pathname: '/overzicht/tips', match: 'prefix' },
  { slug: 'guide_nieuws', pathname: '/nieuws', match: 'prefix' },
  { slug: 'guide_rekenhulp', pathname: '/toekomst/rekenhulp', match: 'prefix' },
  { slug: 'guide_belasting', pathname: '/overzicht/belasting', match: 'prefix' },
  { slug: 'guide_rapportages', pathname: '/rapportages', match: 'prefix' },
  { slug: 'guide_uiterlijk', pathname: '/mijn/uiterlijk', match: 'prefix' },
]

/**
 * Welke bezoek-slugs horen bij deze route? Meerdere tegelijk kan: /toekomst met
 * `?whatif=open` is zowel "grafiek bekeken" als "what-if geopend".
 */
export function guideVisitSlugsForRoute(
  pathname: string,
  query?: (key: string) => string | null,
): string[] {
  return GUIDE_VISIT_ROUTES.filter((r) => {
    const pathOk =
      r.match === 'exact'
        ? pathname === r.pathname
        : pathname === r.pathname || pathname.startsWith(`${r.pathname}/`)
    if (!pathOk) return false
    if (!r.query) return true
    return query?.(r.query[0]) === r.query[1]
  }).map((r) => r.slug)
}

/**
 * Datastappen: het predicaat per stap-id. Elke keuze is hier EXPLICIET, want de
 * app kende voor "bank gekoppeld", "budgetten", "doelen" en "levensgebeurtenissen"
 * al meerdere, onderling afwijkende definities (zie lib/account-status.ts).
 */
const DATA_CHECK_BY_STEP_ID: Readonly<Record<string, (f: GuideAccountFacts) => boolean>> = {
  's1-bezittingen': (f) => f.hasAssets,
  's1-schulden': (f) => f.hasDebts,
  's1-budget': (f) => f.hasBudgets,
  // De stap vraagt letterlijk "gekoppeld óf CSV geüpload" — beide tellen.
  's1-rekening': (f) => f.hasBankConnection || f.hasTransactions,
  // BEWUST alleen de setup-marker, NIET `hasFireParams`: `expected_return` en
  // `inflation_rate` dragen een DB-default (0.07 / 0.02) en zijn dus voor 26 van
  // 27 profielen gevuld zonder dat iemand iets koos — dat zou élke gebruiker
  // onterecht afvinken.
  's2-voorkeuren': (f) => f.hasHorizonSetup,
  // 'aow' is een afgeleide systeemgebeurtenis en telt NIET als "zelf gepland".
  's2-gebeurtenissen': (f) => f.hasLifeEvents,
  's2-uitgaven': (f) => f.hasRetirementExpenseChoice,
  // Doelen = de `goals`-tabel, nadrukkelijk NIET open acties.
  's4-doelen': (f) => f.hasGoals,
  's5-grafiek-instellingen': (f) => f.hasScenarioPrefs,
}

/**
 * De volledige registry: datastappen + bezoekstappen. Een stap zonder regel
 * (bv. door een beheerder toegevoegd) ontbreekt hier bewust en blijft handmatig.
 */
export function guideAutoCheck(stepId: string): ((f: GuideAccountFacts) => boolean) | undefined {
  const dataCheck = DATA_CHECK_BY_STEP_ID[stepId]
  if (dataCheck) return dataCheck
  const slug = GUIDE_VISIT_SLUG_BY_STEP_ID[stepId]
  if (!slug) return undefined
  return (f) => f.visitedSlugs.includes(slug)
}

/** Bereken de afgeleide toestand van elke stap in de config. */
export function deriveGuideStates(
  config: WelcomeGuideConfig,
  facts: GuideAccountFacts,
): GuideDerivedStates {
  const notApplicable = new Set(facts.notApplicableStepIds)
  const out: GuideDerivedStates = {}
  for (const screen of config.screens) {
    for (const step of screen.steps) {
      if (notApplicable.has(step.id)) {
        out[step.id] = 'nvt'
        continue
      }
      const check = guideAutoCheck(step.id)
      if (!check) continue // onbekende stap → handmatig, geen crash
      out[step.id] = check(facts) ? 'done' : 'open'
    }
  }
  return out
}

/**
 * Is deze stap af? Afgeleid 'done' wint; anders telt het handmatige vinkje.
 * Een 'nvt'-stap is nooit "af" — hij hoort simpelweg niet in de teller.
 */
export function isGuideStepDone(
  stepId: string,
  completedStepIds: readonly string[],
  derived?: GuideDerivedStates,
): boolean {
  const state = derived?.[stepId]
  if (state === 'nvt') return false
  if (state === 'done') return true
  return completedStepIds.includes(stepId)
}

export interface ScreenProgress {
  /** Afgevinkte stappen (afgeleid + handmatig). */
  done: number
  /** Noemer: ingeschakelde stappen MINUS de niet-van-toepassing-stappen. */
  total: number
  /** Aantal stappen dat niet van toepassing is (buiten de noemer). */
  notApplicable: number
}

/** Voortgang op één scherm (voor de teller in de kop). */
export function countScreenProgress(
  screen: WelcomeGuideScreen,
  completedStepIds: readonly string[],
  derived?: GuideDerivedStates,
): ScreenProgress {
  const steps = screen.steps.filter((s) => s.enabled)
  const notApplicable = steps.filter((s) => derived?.[s.id] === 'nvt').length
  const done = steps.filter((s) => isGuideStepDone(s.id, completedStepIds, derived)).length
  return { done, total: steps.length - notApplicable, notApplicable }
}

/**
 * Is de gids af? Waar zodra elke stap op elk ZICHTBAAR scherm 'done' of 'nvt'
 * is. Het predicaat dat S13 nodig heeft om de gids te verbergen zodra alles
 * klaar is — hier geëxporteerd zodat er niet elders een tweede definitie ontstaat.
 */
export function isGuideComplete(
  config: WelcomeGuideConfig,
  state: WelcomeGuideState,
  derived?: GuideDerivedStates,
): boolean {
  const screens = getVisibleScreens(config, state)
  if (screens.length === 0) return false
  return screens.every((screen) => {
    const progress = countScreenProgress(screen, state.completedStepIds, derived)
    return progress.total === 0 || progress.done === progress.total
  })
}
