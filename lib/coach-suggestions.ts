/**
 * Coach-suggestie catalogus + selectie-logica.
 *
 * De "coach" is de zwevende CoachBubble ("Tip van Will"). Deze module bevat
 * de volledige, statische catalogus van coaching-tips in 4 prioriteitslagen
 * en de pure selectie-functie die bepaalt welke tip getoond wordt.
 *
 * Lagen (hoog → laag):
 *   1. deferred  — onboarding-velden die de gebruiker oversloeg ("Later invullen")
 *   2. data_gap  — ontbrekende kerngegevens (bank → vermogen → budget → doelen)
 *   3. path      — één tip per route, als fallback
 *   4. default   — welkomstbericht, laatste terugval
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
  /** Tijd waarna de bubble automatisch sluit (ms). */
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
  autoDismissMs: 45_000,
}

export const DEFAULT_COACH_HEADER = 'Tip van Will'

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
      'Eén tip per pagina/route, als fallback wanneer er geen data-gap of uitgesteld veld speelt.',
    order: 3,
  },
  default: {
    label: 'Standaard welkomstbericht',
    description: 'Laatste terugval als geen enkele andere regel van toepassing is.',
    order: 4,
  },
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
  suggestion: SuggestionContent
}

export const PATH_SUGGESTIONS: PathRule[] = [
  // Volgorde = specifiek → breed: de specifieke /overzicht/*-paden staan
  // vóór de brede /overzicht-fallback (anders zou /overzicht die afvangen).
  {
    pathPrefix: '/overzicht/cashflow',
    key: 'path_budgets',
    condition: 'Op een pagina onder /overzicht/cashflow.',
    suggestion: {
      message: 'Hier bepaal je hoeveel vrijheid je elke maand opzijzet. Voeg je eerste budget toe.',
      cta: 'Budget toevoegen',
    },
  },
  {
    pathPrefix: '/overzicht/schulden',
    key: 'path_debts',
    condition: 'Op een pagina onder /overzicht/schulden.',
    suggestion: {
      message: 'Elke afgeloste euro koop je vrijheid terug. Breng je schulden in kaart en kies een strategie.',
      cta: 'Schuld toevoegen',
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
      message:
        'Je grootste Box 1-kans is je jaarruimte — benut hem vóór 31 december en koop vrijheid terug.',
      cta: 'Bekijk jaarruimte',
    },
  },
  {
    pathPrefix: '/overzicht/belasting/box2',
    key: 'path_belasting_box2',
    condition: 'Op een pagina onder /overzicht/belasting/box2.',
    suggestion: {
      message:
        'Hou je rekening-courant onder €500k en time je dividend slim rond de jaarwisseling.',
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

export const DEFAULT_SUGGESTION: { key: string; condition: string; suggestion: SuggestionContent } = {
  key: 'default',
  condition: 'Altijd van toepassing — wint alleen als geen enkele andere regel matcht.',
  suggestion: {
    message: 'Welkom. Geld is opgeslagen tijd — ik help je zien hoeveel vrijheid het je geeft.',
    cta: 'Aan de slag',
    ctaHref: '/overzicht',
  },
}

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
    if (matches && !dismissed.has(entry.key) && isEnabled(entry.key)) {
      return applyOverride(entry.key, entry.suggestion, overrides)
    }
  }

  // 3. Default welkomstbericht
  if (!dismissed.has(DEFAULT_SUGGESTION.key) && isEnabled(DEFAULT_SUGGESTION.key)) {
    return applyOverride(DEFAULT_SUGGESTION.key, DEFAULT_SUGGESTION.suggestion, overrides)
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
  push('default', DEFAULT_SUGGESTION.key, DEFAULT_SUGGESTION.condition, 1, DEFAULT_SUGGESTION.suggestion)

  return rows
}

/** Totaal aantal coach-regels in de catalogus. */
export const COACH_RULE_COUNT =
  DEFERRED_FIELD_SUGGESTIONS.length + DATA_GAP_SUGGESTIONS.length + PATH_SUGGESTIONS.length + 1

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
