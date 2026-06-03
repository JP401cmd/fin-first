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
 * suggestie de coach toont. Prioriteit: bank > assets > budget > goals.
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
        'Je hebt je inkomen overgeslagen bij het instellen. Vul het in voor een nauwkeuriger financieel beeld.',
      cta: 'Inkomen invullen',
      ctaHref: '/identity/profiel',
    },
  },
  {
    field: 'assets',
    key: 'deferred_assets',
    condition: 'Bezittingen overgeslagen tijdens onboarding. Verdwijnt zodra er ≥1 bezitting is.',
    resolved: (gaps) => gaps.hasAssets,
    suggestion: {
      message:
        'Je hebt je bezittingen overgeslagen bij het instellen. Voeg ze toe voor een compleet vermogensoverzicht.',
      cta: 'Bezittingen toevoegen',
      ctaHref: '/core/assets',
    },
  },
  {
    field: 'spaardoel',
    key: 'deferred_spaardoel',
    condition: 'Spaardoel overgeslagen tijdens onboarding. Verdwijnt zodra er ≥1 doel is.',
    resolved: (gaps) => gaps.hasGoals,
    suggestion: {
      message:
        'Je hebt je spaardoel overgeslagen bij het instellen. Een concreet doel helpt je sneller sparen.',
      cta: 'Spaardoel instellen',
      ctaHref: '/will',
    },
  },
]

type DataGapRule = {
  key: string
  condition: string
  check: (gaps: CoachDataGaps) => boolean
  suggestion: SuggestionContent
}

export const DATA_GAP_SUGGESTIONS: DataGapRule[] = [
  {
    key: 'gap_bank',
    condition: 'Geen bankrekening gekoppeld (geen asset van type "cash").',
    check: (g) => !g.hasBank,
    suggestion: {
      message:
        'Koppel je bank voor automatisch inzicht — je transacties worden vanzelf geïmporteerd en gecategoriseerd.',
      cta: 'Bank koppelen',
      ctaHref: '/core/cash/connect',
    },
  },
  {
    key: 'gap_assets',
    condition: 'Geen enkele bezitting geregistreerd.',
    check: (g) => !g.hasAssets,
    suggestion: {
      message:
        'Voeg je vermogen toe — spaargeld, beleggingen, je woning — voor een compleet financieel beeld.',
      cta: 'Vermogen toevoegen',
      ctaHref: '/core/assets',
    },
  },
  {
    key: 'gap_budgets',
    condition: 'Geen top-level budget ingesteld.',
    check: (g) => !g.hasBudgets,
    suggestion: {
      message: 'Stel je eerste budget in om grip te krijgen op je maandelijkse uitgaven.',
      cta: 'Budget instellen',
      ctaHref: '/core/budgets',
    },
  },
  {
    key: 'gap_goals',
    condition: 'Geen openstaande acties/doelen.',
    check: (g) => !g.hasGoals,
    suggestion: {
      message: 'Stel je financiële doelen in — zo weet je precies waar je naartoe werkt.',
      cta: 'Doelen bekijken',
      ctaHref: '/will',
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
  {
    pathPrefix: '/core/budgets',
    key: 'path_budgets',
    condition: 'Op een pagina onder /core/budgets.',
    suggestion: {
      message: 'Voeg je eerste budget toe om grip te krijgen op je uitgaven.',
      cta: 'Budget toevoegen',
    },
  },
  {
    pathPrefix: '/core/debts',
    key: 'path_debts',
    condition: 'Op een pagina onder /core/debts.',
    suggestion: {
      message: 'Registreer je schulden om je aflosstrategie in kaart te brengen.',
      cta: 'Schuld toevoegen',
    },
  },
  {
    pathPrefix: '/core',
    key: 'path_core',
    condition: 'Op een pagina onder /core (en niet onder een specifieker /core-pad hierboven).',
    suggestion: {
      message:
        'Dit is je financieel fundament. Voeg bezittingen en schulden toe voor een compleet overzicht.',
      cta: 'Overzicht bekijken',
    },
  },
  {
    pathPrefix: '/will',
    key: 'path_will',
    condition: 'Op een pagina onder /will.',
    suggestion: {
      message: 'Hier vind je gepersonaliseerde tips en acties om je financiële doelen te bereiken.',
      cta: 'Tips bekijken',
    },
  },
  {
    pathPrefix: '/horizon',
    key: 'path_horizon',
    condition: 'Op een pagina onder /horizon.',
    suggestion: {
      message: "Ontdek wanneer je financieel vrij kunt zijn en speel met scenario's.",
      cta: 'Projectie bekijken',
    },
  },
  {
    pathPrefix: '/nieuws',
    key: 'path_nieuws',
    condition: 'Op een pagina onder /nieuws.',
    suggestion: {
      message: 'Je persoonlijke financiële krant staat klaar. Lees het laatste nieuws.',
      cta: 'Eerste artikel lezen',
    },
  },
]

export const DEFAULT_SUGGESTION: { key: string; condition: string; suggestion: SuggestionContent } = {
  key: 'default',
  condition: 'Altijd van toepassing — wint alleen als geen enkele andere regel matcht.',
  suggestion: {
    message: 'Welkom! Verken de app en ontdek wat je financiële vrijheid betekent.',
    cta: 'Aan de slag',
    ctaHref: '/core',
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
 * Retourneert null als alle toepasselijke regels al gezien of uitgeschakeld zijn.
 */
export function getFirstUndismissedSuggestion(
  dataGaps: CoachDataGaps | undefined,
  pathname: string,
  dismissed: Set<string>,
  deferredFields?: DeferredField[],
  overrides?: CoachOverrides,
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

  // 1. Data-gap suggesties
  if (dataGaps) {
    for (const entry of DATA_GAP_SUGGESTIONS) {
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
