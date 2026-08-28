/**
 * Coach-suggestie catalogus + selectie-logica.
 *
 * De "coach" is de zwevende CoachBubble ("Tip van Fin"). Deze module bevat
 * de volledige, statische catalogus van coaching-tips in 4 prioriteitslagen
 * en de pure selectie-functie die bepaalt welke tip getoond wordt.
 *
 * Lagen (hoog → laag):
 *   1. deferred  — onboarding-velden die de gebruiker oversloeg ("Later invullen")
 *   2. data_gap  — ontbrekende kerngegevens (bank → vermogen → budget → doelen)
 *   3. path      — één tip per route, als fallback
 *   4. default   — welkomstbericht, laatste terugval
 *
 * HARDE REGEL — FIRST-USE-COPY HOORT BIJ FIRST USE (kaart H15, 27-08-2026).
 * De lagen 3 en 4 worden per constructie pas bereikt als élke data-gap dicht
 * is: ze zijn dus de "dit account is gevuld"-lagen. Stond daar first-use-copy
 * ("voeg je eerste … toe", "breng je … in kaart", "welkom"), dan was die
 * uitsluitend zichtbaar voor wie het betreffende gegeven al hád — precies
 * omgekeerd. Elke regel in laag 3/4 die zulke copy draagt MOET daarom een
 * `check`-predicaat hebben dat op de accountstatus toetst; regels zonder
 * predicaat moeten voor élke datastand kloppen. Bewaakt door de
 * regressie-toets "geen first-use-copy zonder check" in coach-suggestions.test.ts.
 *
 * De statusbron is `CoachDataGaps`, die de shell-layout uit de gedeelde
 * `lib/account-status.ts` (`toCoachDataGaps`) opbouwt — dezelfde bron die de
 * welkomstgids gebruikt. Geen tweede definitie van "heeft budgetten".
 *
 * Admin-overrides (tekst/CTA/aan-uit per regel) + globale timing worden
 * opgeslagen in app_settings (key 'coach_config') en hier toegepast. De
 * predicaten (wanneer een regel van toepassing is) blijven in code — alleen
 * de presentatie is aanpasbaar.
 *
 * Spiegelt het patroon van lib/nudge-definitions.ts.
 */

import type { ModuleId } from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────────────────

export type CoachSuggestion = {
  key: string
  message: string
  cta: string
  ctaHref?: string
}

/** Inhoud van een suggestie zonder key — de bewerkbare velden. */
type SuggestionContent = {
  message: string
  cta: string
  ctaHref?: string
}

/**
 * Data-gap signalen vanuit de server-layout. Bepalen welke contextuele
 * suggestie de coach toont. Prioriteit (eerste open gap wint):
 * bank > assets > debts > budget > transactions > holdings > isin >
 * goals > fire-params > life-events.
 *
 * De laatste zes signalen absorberen de setup-prompts die voorheen alleen
 * als module-nudges bestonden (lib/nudge-definitions.ts), zodat het
 * nudge-systeem later zonder dekkingsgat verwijderd kan worden.
 */
export type CoachDataGaps = {
  /** Heeft de gebruiker minstens één bankrekening (asset type=cash)? */
  hasBank: boolean
  /** Heeft de gebruiker minstens één actief asset? */
  hasAssets: boolean
  /** Heeft de gebruiker minstens één top-level budget? */
  hasBudgets: boolean
  /** Heeft de gebruiker openstaande acties/doelen? */
  hasGoals: boolean
  /** Heeft de gebruiker minstens één actieve schuld? */
  hasDebts: boolean
  /** Heeft de gebruiker minstens één transactie? */
  hasTransactions: boolean
  /** Heeft de gebruiker minstens één actieve belegging (holding)? */
  hasHoldings: boolean
  /** Heeft minstens één holding een ISIN-code gekoppeld? */
  hasHoldingsWithIsin: boolean
  /** Heeft de gebruiker FIRE-parameters ingesteld (verwacht rendement / inflatie)? */
  hasFireParams: boolean
  /** Heeft de gebruiker minstens één actieve levensgebeurtenis? */
  hasLifeEvents: boolean
}

/**
 * Velden die de gebruiker expliciet heeft overgeslagen met "Later invullen"
 * tijdens onboarding. Stored in profiles.feature_preferences.deferred_onboarding_fields.
 */
export type DeferredField = 'income' | 'assets' | 'spaardoel'

/** De vier prioriteitslagen waarin coach-regels zijn ingedeeld. */
export type CoachLayer = 'deferred' | 'data_gap' | 'path' | 'default'

// ── Override / config types ──────────────────────────────────────────────

/** Per-regel admin-override van de bewerkbare velden. */
export interface CoachRuleOverride {
  message?: string
  cta?: string
  ctaHref?: string
  enabled?: boolean
}

export type CoachOverrides = Record<string, CoachRuleOverride>

/** Globale timing-instellingen voor de coach-bubble. */
export interface CoachTiming {
  /** Vertraging vóór de bubble verschijnt (ms). */
  delayMs: number
  /**
   * Tijd waarna de melding automatisch sluit (ms). De klok start pas zodra de
   * boodschap volledig is uitgetypt (`done`), niet bij het verschijnen —
   * anders knipt een korte timer een lange boodschap halverwege af.
   */
  autoDismissMs: number
}

/** Volledige coach-configuratie zoals opgeslagen in app_settings. */
export interface CoachConfig {
  rules: CoachOverrides
  timing: CoachTiming
  headerLabel: string
}

export const DEFAULT_COACH_TIMING: CoachTiming = {
  delayMs: 1500,
  // 8s ná het uittypen. Stond op 45s: dat is 7,5-11x de toast-norm uit de
  // ui-ux-kwaliteitstoets (4-6s, fouten 8-10s) en dekte op 390x844 zo'n
  // dertig procent van het scherm af — inclusief de primaire actieknop
  // eronder.
  autoDismissMs: 8_000,
}

/**
 * Rustpauze na een gesloten melding vóór er op een volgende route weer een
 * route-tip (`path_*`) mag verschijnen. Zonder deze pauze duwt elke navigatie
 * een nieuwe, nog ongeziene route-tip omhoog — technisch bedoeld gedrag, in
 * de praktijk las het als "de tip komt op elke pagina terug".
 */
export const PATH_SUGGESTION_COOLDOWN_MS = 10 * 60_000

export const DEFAULT_COACH_HEADER = 'Tip van Fin'

// ── Laag-metadata (voor de beheer-weergave) ───────────────────────────────

export const COACH_LAYER_META: Record<
  CoachLayer,
  { label: string; description: string; order: number }
> = {
  deferred: {
    label: 'Uitgestelde onboarding-velden',
    description:
      'Velden die de gebruiker met "Later invullen" oversloeg. Hoogste prioriteit — verwijst naar een concrete actie van de gebruiker.',
    order: 1,
  },
  data_gap: {
    label: 'Data-gaten',
    description:
      'Ontbrekende kerngegevens. Vaste volgorde: bank → vermogen → budget → doelen. De eerste niet-weggeklikte gap wint.',
    order: 2,
  },
  path: {
    label: 'Pad-gebaseerd',
    description:
      'Eén tip per pagina/route, als fallback wanneer er geen data-gap of uitgesteld veld speelt. Deze laag wordt pas bereikt als élke data-gap dicht is — een regel hier moet dus voor een gevuld account kloppen, of een eigen check dragen.',
    order: 3,
  },
  default: {
    label: 'Standaard welkomstbericht',
    description:
      'Laatste terugval als geen enkele andere regel van toepassing is. Twee varianten: gevuld account eerst, daarna het onvoorwaardelijke welkomstbericht.',
    order: 4,
  },
}

// ── Accountrijpheid (de ene lezing voor first-use vs. gevuld) ─────────────

/**
 * "Dit account is gevuld" — het predicaat dat first-use-copy van gevulde copy
 * scheidt (kaart H15). ÉÉN lezing, hier gedefinieerd, nergens anders herhaald.
 *
 * LEZING: bezittingen geregistreerd **én** boekhouding op gang (transacties óf
 * budgetten). Bewust een conjunctie: één losse bezitting maakt van een nieuw
 * account nog geen gevuld account, terwijl bezittingen + transacties/budgetten
 * niet meer als "begin hier" aan te spreken zijn.
 *
 * WAAROM NAAST DE LAAGVOLGORDE. De path- en default-laag worden alleen bereikt
 * als élke data-gap dicht is — dan is dit predicaat per definitie waar. Behalve
 * wanneer de gebruiker gaps heeft weggeklikt of beheer ze heeft uitgezet: dán
 * valt de selectie door naar laag 3/4 zónder dat het account gevuld is. Dit
 * predicaat maakt de COPY zelf-conditionerend in plaats van afhankelijk van de
 * laagvolgorde — precies de "de bug verplaatst zich"-val uit de kaart.
 *
 * LET OP (bewuste onnauwkeurigheden, geërfd van `CoachDataGaps`): `hasAssets`
 * is RLS-breed en telt dus een gedeelde bezitting van je partner mee, en
 * module-gated signalen staan op `true` wanneer hun module uit staat. Beide
 * eigenaardigheden zijn coach-breed; zie `toCoachDataGaps` in
 * `lib/account-status.ts`. Voor een compleetheids-oordeel (de gids) gebruik je
 * de eigen-gescopede `AccountStatus`, niet deze.
 */
export function isEstablishedAccount(gaps: CoachDataGaps): boolean {
  return gaps.hasAssets && (gaps.hasTransactions || gaps.hasBudgets)
}

// ── Catalogus ──────────────────────────────────────────────────────────────

type DeferredRule = {
  field: DeferredField
  key: string
  condition: string
  /** Retourneert true als het uitgestelde veld inmiddels is ingevuld — regel lost dan vanzelf op. */
  resolved: (gaps: CoachDataGaps) => boolean
  suggestion: SuggestionContent
}

export const DEFERRED_FIELD_SUGGESTIONS: DeferredRule[] = [
  {
    field: 'income',
    key: 'deferred_income',
    condition:
      'Inkomen overgeslagen tijdens onboarding. Lost niet automatisch op via data-gaps — wordt via een API-call gewist zodra het inkomen is ingevuld.',
    resolved: () => false,
    suggestion: {
      message:
        'Vul je inkomen aan, dan laat ik zien hoeveel vrijheid je elke maand opbouwt.',
      cta: 'Inkomen aanvullen',
      ctaHref: '/mijn/profiel',
    },
  },
  {
    field: 'assets',
    key: 'deferred_assets',
    condition: 'Bezittingen overgeslagen tijdens onboarding. Verdwijnt zodra er ≥1 bezitting is.',
    resolved: (gaps) => gaps.hasAssets,
    suggestion: {
      message:
        'Voeg je bezittingen toe — dan vertaal ik je vermogen meteen naar jaren vrijheid.',
      cta: 'Bezittingen toevoegen',
      ctaHref: '/overzicht/bezittingen',
    },
  },
  {
    field: 'spaardoel',
    key: 'deferred_spaardoel',
    condition: 'Spaardoel overgeslagen tijdens onboarding. Verdwijnt zodra er ≥1 doel is.',
    resolved: (gaps) => gaps.hasGoals,
    suggestion: {
      message:
        'Eén concreet doel maakt je vrijheid tastbaar. Stel het in en volg je voortgang.',
      cta: 'Doel instellen',
      ctaHref: '/toekomst/doelen',
    },
  },
]

type DataGapRule = {
  key: string
  condition: string
  check: (gaps: CoachDataGaps) => boolean
  suggestion: SuggestionContent
  /**
   * Optionele module-koppeling. Wanneer gezet, verschijnt deze gap-suggestie
   * alleen als de bijbehorende module actief is (zie `activeModules`-parameter
   * van getFirstUndismissedSuggestion). Spiegelt de module-gating van de
   * nudges (lib/nudge-definitions.ts). Geen moduleId → altijd toepasselijk.
   */
  moduleId?: ModuleId
}

export const DATA_GAP_SUGGESTIONS: DataGapRule[] = [
  {
    key: 'gap_bank',
    condition: 'Geen bankrekening gekoppeld (geen asset van type "cash").',
    check: (g) => !g.hasBank,
    suggestion: {
      message:
        'Koppel je bank, dan houd ik je uitgaven automatisch bij — minder typewerk, meer zicht op je vrijheid.',
      cta: 'Bank koppelen',
      ctaHref: '/mijn/koppelingen',
    },
  },
  {
    key: 'gap_assets',
    condition: 'Geen enkele bezitting geregistreerd.',
    check: (g) => !g.hasAssets,
    suggestion: {
      message:
        'Spaargeld, beleggingen, je huis — samen tonen ze hoeveel vrijheid je al hebt opgebouwd. Voeg ze toe.',
      cta: 'Vermogen toevoegen',
      ctaHref: '/overzicht/bezittingen',
    },
  },
  {
    key: 'gap_debts',
    condition: 'Geen enkele schuld geregistreerd (module Vermogensregistratie actief).',
    moduleId: 'vermogensregistratie',
    check: (g) => !g.hasDebts,
    suggestion: {
      message: 'Breng je schulden in kaart — elke afgeloste euro koop je vrijheid terug.',
      cta: 'Schuld toevoegen',
      ctaHref: '/overzicht/schulden',
    },
  },
  {
    key: 'gap_budgets',
    condition: 'Geen top-level budget ingesteld.',
    check: (g) => !g.hasBudgets,
    suggestion: {
      message: 'Met een budget bepaal je zelf hoeveel vrijheid je elke maand opzijzet. Stel je eerste in.',
      cta: 'Budget instellen',
      ctaHref: '/overzicht/cashflow',
    },
  },
  {
    key: 'gap_transactions',
    condition: 'Geen enkele transactie geïmporteerd (module Budgetteren actief).',
    moduleId: 'budgetteren',
    check: (g) => !g.hasTransactions,
    suggestion: {
      message:
        'Importeer je transacties, dan houd ik je uitgaven — en je vrijheid — automatisch bij.',
      cta: 'Transacties importeren',
      ctaHref: '/core/cash/import',
    },
  },
  {
    key: 'gap_holdings',
    condition: 'Geen enkele belegging geregistreerd (module Aandelenregistratie actief).',
    moduleId: 'aandelenregistratie',
    check: (g) => !g.hasHoldings,
    suggestion: {
      message: 'Registreer je beleggingen — dan zie ik hoeveel vrijheid je portefeuille opbouwt.',
      cta: 'Beleggingen toevoegen',
      ctaHref: '/overzicht/bezittingen/investment?tab=aandelen-holdings',
    },
  },
  {
    key: 'gap_isin',
    condition: 'Beleggingen geregistreerd, maar nog geen ISIN-codes gekoppeld (module Aandelenregistratie actief).',
    moduleId: 'aandelenregistratie',
    check: (g) => g.hasHoldings && !g.hasHoldingsWithIsin,
    suggestion: {
      message: 'Koppel ISIN-codes voor automatische koersupdates van je holdings.',
      cta: 'ISIN koppelen',
      ctaHref: '/overzicht/bezittingen/investment?tab=aandelen-holdings',
    },
  },
  {
    key: 'gap_goals',
    condition: 'Geen openstaande acties/doelen.',
    check: (g) => !g.hasGoals,
    suggestion: {
      message: 'Een doel maakt zichtbaar waar je naartoe werkt — en hoeveel vrijheid je ervoor terugkrijgt.',
      cta: 'Doel instellen',
      ctaHref: '/toekomst/doelen',
    },
  },
  {
    key: 'gap_fire_params',
    condition: 'Geen verwacht rendement / inflatie ingesteld (module Toekomstplannen actief).',
    moduleId: 'toekomstplannen',
    check: (g) => !g.hasFireParams,
    suggestion: {
      message: 'Stel je verwacht rendement in, dan klopt je vrijheidsprojectie met jouw situatie.',
      cta: 'Rendement instellen',
      ctaHref: '/toekomst/voorkeuren',
    },
  },
  {
    key: 'gap_life_events',
    condition: 'Geen levensgebeurtenissen gepland (module Toekomstplannen actief).',
    moduleId: 'toekomstplannen',
    check: (g) => !g.hasLifeEvents,
    suggestion: {
      message: 'Plan je levensgebeurtenissen — ze bepalen mee wanneer je vrij bent.',
      cta: 'Gebeurtenis toevoegen',
      ctaHref: '/toekomst/gebeurtenissen',
    },
  },
]

type PathRule = {
  pathPrefix: string
  key: string
  condition: string
  /**
   * Optioneel predicaat op de accountstatus — spiegelt `DataGapRule.check`.
   * Verplicht zodra de tekst first-use-copy draagt (zie de harde regel in de
   * module-kop): zonder predicaat spreekt deze laag juist het GEVULDE account
   * als beginner aan. Levert het predicaat `false` — of zijn de gaps nog
   * onbekend — dan valt de selectie door naar de volgende (bredere) pad-regel.
   * Die terugval moet dus zelf voor elke datastand kloppen.
   */
  check?: (gaps: CoachDataGaps) => boolean
  suggestion: SuggestionContent
}

export const PATH_SUGGESTIONS: PathRule[] = [
  // Volgorde = specifiek → breed: de specifieke /overzicht/*-paden staan
  // vóór de brede /overzicht-fallback (anders zou /overzicht die afvangen).
  //
  // GEEN `path_budgets`-regel meer (bevinding C7, besluit eigenaar 26-08-2026).
  // Die vuurde onvoorwaardelijk op `/overzicht/cashflow` met de tekst "Voeg je
  // eerste budget toe" — óók voor iemand met tientallen bestaande budgetten,
  // wat feitelijk onjuist is en het vertrouwen in Fin ondermijnt. De juiste
  // regel bestond al één laag hoger: `gap_budgets` (DATA_GAP_SUGGESTIONS)
  // vuurt hetzelfde advies mét `check: (g) => !g.hasBudgets`. De pad-regel was
  // dus een ongeconditioneerd duplicaat en is verwijderd; `/overzicht/cashflow`
  // valt nu terug op `path_core`, dat voor élke datastand klopt.
  {
    pathPrefix: '/overzicht/schulden',
    key: 'path_debts',
    condition:
      'Op een pagina onder /overzicht/schulden ÉN er staat minstens één schuld geregistreerd.',
    // H15: de oude tekst ("Breng je schulden in kaart en kies een strategie")
    // was first-use-copy zónder predicaat, en deze laag wordt pas bereikt als
    // alle gaps dicht zijn — je kreeg 'm dus alleen te zien als je je schulden
    // al hád ingebracht. De first-use-variant bestaat al één laag hoger
    // (`gap_debts`, check `!hasDebts`); hier blijft alleen de gevulde variant,
    // met het predicaat dat de scheiding hard maakt. Zonder schulden (of met
    // de gaps nog onbekend) valt de selectie terug op `path_core`, dat voor
    // elke datastand klopt.
    check: (g) => g.hasDebts,
    suggestion: {
      message:
        'Je schulden staan in beeld. Kies een aflosvolgorde, dan zie je hoeveel vrijheid je terugkoopt.',
      cta: 'Bekijk je aflosplan',
    },
  },
  {
    pathPrefix: '/overzicht/tips',
    key: 'path_will',
    condition: 'Op een pagina onder /overzicht/tips.',
    suggestion: {
      message: 'Hier staan je tips — elke afgeronde actie levert je dagen vrijheid op.',
      cta: 'Tips bekijken',
    },
  },
  {
    pathPrefix: '/overzicht/belasting/box1',
    key: 'path_belasting_box1',
    condition: 'Op een pagina onder /overzicht/belasting/box1.',
    suggestion: {
      // H24 (Wft): beschrijvend, niet gebiedend. De oude tekst ("benut hem
      // vóór 31 december en koop vrijheid terug") was een aansporing tot een
      // concrete productstorting (lijfrente) mét deadline. De bubble hangt in
      // de app-shell en staat dus los van de "Indicatie, geen advies"-
      // voetnoten op de pagina zelf — er is hier geen voorbehoud in beeld.
      message:
        'Je jaarruimte is de pensioenruimte die je dit jaar mag aftrekken — die telt per kalenderjaar en vervalt na 31 december.',
      cta: 'Bekijk jaarruimte',
      ctaHref: '/overzicht/belasting/box1#jaarruimte-uitleg',
    },
  },
  {
    pathPrefix: '/overzicht/belasting/box2',
    key: 'path_belasting_box2',
    condition: 'Op een pagina onder /overzicht/belasting/box2.',
    suggestion: {
      // H24-bijvangst: zelfde tabel, zelfde defect. "Hou je rekening-courant
      // onder €500k en time je dividend slim" was een dubbele instructie over
      // concrete financiële handelingen (DGA-lening, dividendmoment).
      // Bewust zónder bedrag: de leengrens is een fiscale constante en hoort
      // niet als los getal in statische copy (CLAUDE.md — geen hardcoded
      // financiële constanten buiten lib/constants.ts). De kaart zelf toont
      // de actuele drempel wél, uit de canonieke bron.
      message:
        'Boven de leengrens telt je BV-lening mee als Box 2-inkomen, en je dividendmoment bepaalt in welk jaar het valt.',
      cta: 'Bekijk Box 2',
    },
  },
  {
    pathPrefix: '/overzicht/belasting/box3',
    key: 'path_belasting_box3',
    condition: 'Op een pagina onder /overzicht/belasting/box3.',
    suggestion: {
      message:
        'Betaal je niet te veel over je vermogen? Vergelijk forfaitair met je werkelijke rendement.',
      cta: 'Vergelijk tegenbewijs',
    },
  },
  {
    pathPrefix: '/overzicht/belasting',
    key: 'path_belasting',
    condition:
      'Op de belasting-hub onder /overzicht/belasting (en niet onder een specifieker box-pad hierboven).',
    suggestion: {
      message:
        'Hier zie je je totale fiscale plaatje en waar de meeste vrijheid te winnen valt.',
      cta: 'Bekijk je belasting',
    },
  },
  {
    pathPrefix: '/overzicht',
    key: 'path_core',
    condition: 'Op een pagina onder /overzicht (en niet onder een specifieker /overzicht-pad hierboven).',
    suggestion: {
      message:
        'Dit is je fundament. Hoe completer je bezittingen en schulden, hoe scherper ik je vrijheid laat zien.',
      cta: 'Naar je overzicht',
    },
  },
  {
    pathPrefix: '/toekomst',
    key: 'path_horizon',
    condition: 'Op een pagina onder /toekomst.',
    suggestion: {
      message: "Ontdek wanneer je vrij kunt zijn — en speel met scenario's om die dag dichterbij te halen.",
      cta: 'Bekijk je tijdas',
    },
  },
  {
    pathPrefix: '/nieuws',
    key: 'path_nieuws',
    condition: 'Op een pagina onder /nieuws.',
    suggestion: {
      message: 'Je financiële krant staat klaar — even bijlezen.',
      cta: 'Open de krant',
    },
  },
]

type DefaultRule = {
  key: string
  condition: string
  /** Zelfde semantiek als `PathRule.check`; de láátste regel draagt er géén. */
  check?: (gaps: CoachDataGaps) => boolean
  suggestion: SuggestionContent
}

/**
 * De terugval, in evaluatievolgorde. Twee varianten sinds H15: routes zónder
 * pad-regel (o.a. `/mijn` en `/berichten`) kwamen hier uit, waarna een account
 * met duizenden transacties "Welkom." te lezen kreeg. De terugval moest dus
 * zélf gevuld-bewust worden — anders verplaatst de bug zich hierheen zodra de
 * pad-laag wél conditioneert.
 *
 * De laatste regel draagt bewust geen predicaat: er moet altijd één terugval
 * overblijven, óók wanneer de accountstatus nog niet geladen is.
 */
export const DEFAULT_SUGGESTIONS: DefaultRule[] = [
  {
    key: 'default_gevuld',
    condition:
      'Geen enkele andere regel matcht én het account is gevuld (bezittingen + transacties of budgetten).',
    check: isEstablishedAccount,
    suggestion: {
      message: 'Je basis staat. Elke euro die je opzijzet reken ik voor je om naar vrijheidstijd.',
      cta: 'Naar je overzicht',
      ctaHref: '/overzicht',
    },
  },
  {
    key: 'default',
    condition:
      'Altijd van toepassing — wint alleen als geen enkele andere regel matcht én het account nog niet gevuld is.',
    suggestion: {
      message: 'Welkom. Geld is opgeslagen tijd — ik help je zien hoeveel vrijheid het je geeft.',
      cta: 'Aan de slag',
      ctaHref: '/overzicht',
    },
  },
]

/**
 * Het onvoorwaardelijke welkomstbericht. Blijft geëxporteerd onder de
 * bestaande naam/key omdat beheer-overrides en weggeklikte suggesties op
 * `'default'` zijn opgeslagen.
 */
export const DEFAULT_SUGGESTION: DefaultRule =
  DEFAULT_SUGGESTIONS[DEFAULT_SUGGESTIONS.length - 1]

// ── Selectie ───────────────────────────────────────────────────────────────

/** Pas een per-regel-override toe op de standaard-inhoud. */
function applyOverride(
  key: string,
  base: SuggestionContent,
  overrides?: CoachOverrides,
): CoachSuggestion {
  const ov = overrides?.[key]
  return {
    key,
    message: ov?.message || base.message,
    cta: ov?.cta || base.cta,
    ctaHref: ov?.ctaHref || base.ctaHref,
  }
}

/**
 * Vind de eerste niet-weggeklikte, ingeschakelde suggestie. Prioriteit:
 *  0. Uitgestelde onboarding-velden — specifieke feedback
 *  1. Data-gap suggesties (bank > assets > budget > goals)
 *  2. Pad-gebaseerde suggestie (exacte + prefix match, specifiek → breed)
 *  3. Default welkomstbericht
 *
 * Admin-overrides bepalen de getoonde tekst/CTA en kunnen een regel
 * uitschakelen (overrides[key].enabled === false → overgeslagen).
 *
 * `activeModules` gate-t alleen de data-gap-laag: een data-gap-regel met een
 * `moduleId` wordt overgeslagen wanneer die module niet actief is (spiegelt de
 * module-gating van de nudges). Is `activeModules` undefined, dan vindt geen
 * gating plaats (achterwaarts compatibel).
 *
 * Retourneert null als alle toepasselijke regels al gezien of uitgeschakeld zijn.
 */
export function getFirstUndismissedSuggestion(
  dataGaps: CoachDataGaps | undefined,
  pathname: string,
  dismissed: Set<string>,
  deferredFields?: DeferredField[],
  overrides?: CoachOverrides,
  activeModules?: ModuleId[],
): CoachSuggestion | null {
  const isEnabled = (key: string) => overrides?.[key]?.enabled !== false

  // 0. Deferred onboarding fields
  if (deferredFields && deferredFields.length > 0 && dataGaps) {
    for (const entry of DEFERRED_FIELD_SUGGESTIONS) {
      if (
        deferredFields.includes(entry.field) &&
        !entry.resolved(dataGaps) &&
        !dismissed.has(entry.key) &&
        isEnabled(entry.key)
      ) {
        return applyOverride(entry.key, entry.suggestion, overrides)
      }
    }
  }

  // De-dup met de /toekomst-overlay: op /toekomst-routes wijzen de
  // ballonnen al naar rendement/parameters en levensgebeurtenissen. Bied die
  // twee gaps daar dus niet óók via de coach aan (anders dubbel). Andere gaps +
  // de deferred-veld-nudges blijven ongemoeid.
  const onToekomst = pathname === '/toekomst' || pathname.startsWith('/toekomst/')
  const TOEKOMST_OVERLAY_KEYS = new Set(['gap_fire_params', 'gap_life_events'])

  // 1. Data-gap suggesties — module-gated wanneer activeModules is meegegeven
  if (dataGaps) {
    for (const entry of DATA_GAP_SUGGESTIONS) {
      // Module-gating: sla over wanneer de regel aan een module hangt die niet
      // actief is. Alleen toegepast als activeModules expliciet is meegegeven.
      if (entry.moduleId && activeModules && !activeModules.includes(entry.moduleId)) {
        continue
      }
      // Overlay-overlap op /toekomst — zie comment hierboven.
      if (onToekomst && TOEKOMST_OVERLAY_KEYS.has(entry.key)) {
        continue
      }
      if (entry.check(dataGaps) && !dismissed.has(entry.key) && isEnabled(entry.key)) {
        return applyOverride(entry.key, entry.suggestion, overrides)
      }
    }
  }

  // 2. Pad-gebaseerde suggestie — specifiek → breed (catalogus is al geordend)
  for (const entry of PATH_SUGGESTIONS) {
    const matches =
      pathname === entry.pathPrefix || pathname.startsWith(entry.pathPrefix + '/')
    if (!matches) continue
    // Predicaat op de accountstatus (H15). Zonder gaps kunnen we het niet
    // toetsen: dan valt de regel weg ten gunste van de bredere, datastand-
    // onafhankelijke terugval — nooit andersom.
    if (entry.check && !(dataGaps && entry.check(dataGaps))) continue
    if (!dismissed.has(entry.key) && isEnabled(entry.key)) {
      return applyOverride(entry.key, entry.suggestion, overrides)
    }
  }

  // 3. Default welkomstbericht — gevulde variant vóór het first-use-welkom
  for (const entry of DEFAULT_SUGGESTIONS) {
    if (entry.check && !(dataGaps && entry.check(dataGaps))) continue
    if (!dismissed.has(entry.key) && isEnabled(entry.key)) {
      return applyOverride(entry.key, entry.suggestion, overrides)
    }
  }

  return null
}

// ── Admin-catalogus ──────────────────────────────────────────────────────

export interface CoachAdminRow {
  key: string
  layer: CoachLayer
  condition: string
  /** 1-gebaseerde volgorde binnen de laag. */
  order: number
  defaultMessage: string
  defaultCta: string
  defaultCtaHref: string
  message: string
  cta: string
  ctaHref: string
  enabled: boolean
  hasOverride: boolean
}

/**
 * Bouw de platte lijst regels voor het beheerscherm, met standaardwaarden,
 * toegepaste overrides en hasOverride-vlag. Volgorde = evaluatievolgorde:
 * deferred → data_gap → path → default.
 */
export function buildCoachCatalogForAdmin(overrides: CoachOverrides = {}): CoachAdminRow[] {
  const rows: CoachAdminRow[] = []

  const push = (
    layer: CoachLayer,
    key: string,
    condition: string,
    order: number,
    base: SuggestionContent,
  ) => {
    const ov = overrides[key]
    rows.push({
      key,
      layer,
      condition,
      order,
      defaultMessage: base.message,
      defaultCta: base.cta,
      defaultCtaHref: base.ctaHref ?? '',
      message: ov?.message ?? base.message,
      cta: ov?.cta ?? base.cta,
      ctaHref: ov?.ctaHref ?? base.ctaHref ?? '',
      enabled: ov?.enabled !== false,
      hasOverride: !!ov,
    })
  }

  DEFERRED_FIELD_SUGGESTIONS.forEach((e, i) => push('deferred', e.key, e.condition, i + 1, e.suggestion))
  DATA_GAP_SUGGESTIONS.forEach((e, i) => push('data_gap', e.key, e.condition, i + 1, e.suggestion))
  PATH_SUGGESTIONS.forEach((e, i) => push('path', e.key, e.condition, i + 1, e.suggestion))
  // Beide default-varianten als eigen rij: een gesplitste regel MOET in beheer
  // twee bewerkbare regels zijn, anders overschrijft één override stilzwijgend
  // zowel de first-use- als de gevulde tekst (risico 1 op kaart H15).
  DEFAULT_SUGGESTIONS.forEach((e, i) => push('default', e.key, e.condition, i + 1, e.suggestion))

  return rows
}

/** Totaal aantal coach-regels in de catalogus. */
export const COACH_RULE_COUNT =
  DEFERRED_FIELD_SUGGESTIONS.length +
  DATA_GAP_SUGGESTIONS.length +
  PATH_SUGGESTIONS.length +
  DEFAULT_SUGGESTIONS.length

// ── Config-parsing ─────────────────────────────────────────────────────────

/**
 * Parse en normaliseer de opgeslagen coach-config (app_settings 'coach_config').
 * Onbekende/ontbrekende velden vallen terug op de standaardwaarden, zodat een
 * lege of corrupte config zich identiek gedraagt aan "geen config".
 */
export function parseCoachConfig(value: string | null | undefined): CoachConfig {
  let parsed: Partial<CoachConfig> = {}
  if (value) {
    try {
      const json = JSON.parse(value)
      if (json && typeof json === 'object') parsed = json as Partial<CoachConfig>
    } catch {
      /* corrupt — gebruik defaults */
    }
  }
  return {
    rules: parsed.rules && typeof parsed.rules === 'object' ? parsed.rules : {},
    timing: {
      delayMs:
        typeof parsed.timing?.delayMs === 'number'
          ? parsed.timing.delayMs
          : DEFAULT_COACH_TIMING.delayMs,
      autoDismissMs:
        typeof parsed.timing?.autoDismissMs === 'number'
          ? parsed.timing.autoDismissMs
          : DEFAULT_COACH_TIMING.autoDismissMs,
    },
    headerLabel:
      typeof parsed.headerLabel === 'string' && parsed.headerLabel.trim()
        ? parsed.headerLabel
        : DEFAULT_COACH_HEADER,
  }
}
