// ── Module Registry ──────────────────────────────────────────────────────────
// User-selectable module system that replaces sovereignty-level feature gating.
// Each module controls a functional domain; users pick which modules they want.
// This file is the foundation — all other module-related code depends on it.

// ── Types ────────────────────────────────────────────────────────────────────

/** Functional modules the user can activate */
export type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'inzicht_acties'
  | 'toekomstplannen'
  | 'nieuws'

/** Onboarding intent presets — each maps to a default set of modules */
export type IntentId =
  | 'coaching'
  | 'grip_uitgaven'
  | 'overzicht_geld'
  | 'toekomst'
  | 'alles'
  | 'nieuws'

/** @deprecated Use IntentId instead */
export type PersonaId =
  | 'budgetteerder'
  | 'vermogensverdeler'
  | 'pensioenplanner'
  | 'fire_fighter'

/**
 * Navigation tab identifiers. Strict subset of WidgetModule (excludes 'cross')
 * and FeatureModule (excludes 'bank', 'ai'). These represent user-visible navigation tabs.
 */
export type NavModule = 'kern' | 'wil' | 'horizon'

export interface ModuleDef {
  id: ModuleId
  label: string
  description: string
  /** Module can be activated without any other module */
  standalone: boolean
  /** Hard dependencies — ALL listed modules must be active */
  requires: ModuleId[]
  /** Soft dependency — at least ONE of these must be active */
  requiresOneOf?: ModuleId[]
  /** Which navigation tab this module belongs to (undefined = no tab) */
  navModule?: NavModule
  /** Module exists but is not fully built yet */
  inDevelopment?: boolean
}

// ── Module Catalog ───────────────────────────────────────────────────────────

export const MODULE_CATALOG: ModuleDef[] = [
  {
    id: 'budgetteren',
    label: 'Budgetteren',
    description: 'Budgetten, cashflow, spaarquote, noodfonds en vaste lasten',
    standalone: true,
    requires: [],
    navModule: 'kern',
  },
  {
    id: 'vermogensregistratie',
    label: 'Vermogensregistratie',
    description: 'Vermogen bijhouden, Box 3 belasting en allocatie',
    standalone: true,
    requires: [],
    navModule: 'kern',
  },
  {
    id: 'aandelenregistratie',
    label: 'Aandelenregistratie',
    description: 'Aandelen en beleggingsportefeuille beheren',
    standalone: false,
    requires: ['vermogensregistratie'],
    navModule: 'kern',
    inDevelopment: true,
  },
  {
    id: 'inzicht_acties',
    label: 'Inzicht & Acties',
    description: 'Doelen, trends, patronen en gepersonaliseerde aanbevelingen',
    standalone: false,
    requires: [],
    requiresOneOf: ['budgetteren', 'vermogensregistratie'],
    navModule: 'wil',
  },
  {
    id: 'toekomstplannen',
    label: 'Toekomstplannen',
    description: 'FIRE-projecties, simulaties, scenario\'s en levensgebeurtenissen',
    standalone: false,
    requires: [],
    requiresOneOf: ['budgetteren', 'vermogensregistratie'],
    navModule: 'horizon',
  },
  {
    id: 'nieuws',
    label: 'Nieuws',
    description: 'Gepersonaliseerd financieel nieuws en marktinzichten',
    standalone: true,
    requires: [],
  },
]

// ── All Module IDs ───────────────────────────────────────────────────────────

export const ALL_MODULES: ModuleId[] = MODULE_CATALOG.map((m) => m.id)

// ── Intent Presets ───────────────────────────────────────────────────────────
// Default module sets per onboarding intent.

// Budgetteren is bewust afwezig uit `coaching` en `grip_uitgaven`: de gebruiker
// activeert die module via de cash-asset-prompt in onboarding ("wil je deze
// rekening gebruiken voor budgetteren?"). Zo wordt budgettering een bewuste
// opt-in op het juiste moment — niet een onuitlegbare default die op het
// dashboard verschijnt.
export const INTENT_MODULE_PRESETS: Record<IntentId, ModuleId[]> = {
  coaching: ['inzicht_acties'],
  grip_uitgaven: [],
  overzicht_geld: ['vermogensregistratie'],
  toekomst: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
  alles: [...ALL_MODULES],
  nieuws: ['nieuws'],
}

// ── Persona Presets (deprecated) ────────────────────────────────────────────
// @deprecated Use INTENT_MODULE_PRESETS instead.

/** @deprecated Use INTENT_MODULE_PRESETS instead */
export const PERSONA_MODULE_PRESETS: Record<PersonaId, ModuleId[]> = {
  budgetteerder: ['budgetteren'],
  vermogensverdeler: ['vermogensregistratie', 'inzicht_acties'],
  pensioenplanner: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
  fire_fighter: [...ALL_MODULES],
}

// ── Widget → Module Mapping ──────────────────────────────────────────────────
// Maps each widget ID to the module that must be active for it to show.
// Widgets NOT in this map are "foundation" widgets (e.g. jouw_pad, acties, meldingen)
// that are always visible regardless of which modules the user has activated.

export const WIDGET_MODULE_MAP: Record<string, ModuleId> = {
  // Budgetteren
  budgetten: 'budgetteren',
  nibud_benchmark: 'budgetteren',
  spaarquote: 'budgetteren',
  noodfonds: 'budgetteren',
  cash_flow: 'budgetteren',
  maandoverzicht: 'budgetteren',
  vaste_lasten: 'budgetteren',

  // Vermogensregistratie
  assets: 'vermogensregistratie',
  belasting_box3: 'vermogensregistratie',
  box3_drag: 'vermogensregistratie',
  netto_vermogen: 'vermogensregistratie',
  schulden: 'vermogensregistratie',

  // Aandelenregistratie
  holdings: 'aandelenregistratie',

  // Inzicht & Acties
  doelen: 'inzicht_acties',
  voorstellen: 'inzicht_acties',
  volgende_stap: 'inzicht_acties',
  trend_inkomen: 'inzicht_acties',
  trend_uitgaven: 'inzicht_acties',
  trend_sparen: 'inzicht_acties',
  trend_schulden: 'inzicht_acties',
  beslissingspatronen: 'inzicht_acties',
  gezondheids_score: 'inzicht_acties',
  ai_inzicht: 'inzicht_acties',

  // Toekomstplannen
  fire_prognose: 'toekomstplannen',
  vrijheidsmijlpalen: 'toekomstplannen',
  vrijheidsscenarios: 'toekomstplannen',
  sim_vermogenspad: 'toekomstplannen',
  monte_carlo: 'toekomstplannen',
  backtesting_score: 'toekomstplannen',
  levensgebeurtenissen: 'toekomstplannen',
  vrijheidsvoortgang: 'toekomstplannen',
  surplus_gap: 'toekomstplannen',
}

// ── Lookup Maps ─────────────────────────────────────────────────────────────

const MODULE_MAP: Record<ModuleId, ModuleDef> = Object.fromEntries(
  MODULE_CATALOG.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleDef>

// ── Functions ────────────────────────────────────────────────────────────────

/**
 * Get the required module for a widget, or undefined if always visible.
 * Widgets not in WIDGET_MODULE_MAP are shown regardless of active modules.
 */
export function getWidgetRequiredModule(widgetId: string): ModuleId | undefined {
  return WIDGET_MODULE_MAP[widgetId]
}

/**
 * Look up a module definition by ID.
 * Always returns a valid definition since ModuleId is a closed union
 * with exactly one catalog entry per member.
 */
export function getModuleDef(moduleId: ModuleId): ModuleDef {
  return MODULE_MAP[moduleId]
}

/**
 * Check whether a specific module is in the active set.
 */
export function isModuleActive(activeModules: ModuleId[], moduleId: ModuleId): boolean {
  return activeModules.includes(moduleId)
}

/**
 * Validate a set of active modules against dependency rules.
 *
 * Rules:
 * 1. Minstens één module moet actief zijn
 * 2. 'aandelenregistratie' vereist 'vermogensregistratie'
 * 3. 'inzicht_acties' vereist 'budgetteren' of 'vermogensregistratie'
 * 4. 'toekomstplannen' vereist 'budgetteren' of 'vermogensregistratie'
 *
 * Returns user-friendly Dutch error messages.
 */
export function validateModules(modules: ModuleId[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const has = (id: ModuleId) => modules.includes(id)

  // Rule 1: at least one module must be selected
  if (modules.length === 0) {
    errors.push('Kies minstens één module.')
  }

  // Rules 2-4: check each module's dependencies from the catalog
  for (const moduleId of modules) {
    const def = getModuleDef(moduleId)

    for (const reqId of def.requires) {
      if (!has(reqId)) {
        const reqLabel = getModuleDef(reqId).label
        errors.push(`${def.label} vereist dat ${reqLabel} actief is.`)
      }
    }

    if (def.requiresOneOf && def.requiresOneOf.length > 0) {
      const hasAny = def.requiresOneOf.some((id) => has(id))
      if (!hasAny) {
        const labels = def.requiresOneOf.map((id) => getModuleDef(id).label).join(' of ')
        errors.push(`${def.label} vereist dat ${labels} actief is.`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Determine which navigation tabs should be visible based on active modules.
 * Returns deduplicated, ordered list of nav module identifiers.
 */
export function getActiveNavModules(activeModules: ModuleId[]): NavModule[] {
  const navOrder: NavModule[] = ['kern', 'wil', 'horizon']
  const activeNavSet = new Set<NavModule>()

  for (const moduleId of activeModules) {
    const def = getModuleDef(moduleId)
    if (def.navModule) {
      activeNavSet.add(def.navModule)
    }
  }

  // Return in canonical order
  return navOrder.filter((nav) => activeNavSet.has(nav))
}

/**
 * Determine the landing page path based on active modules.
 *
 * Priority:
 * 1. nieuws only → '/nieuws' (dedicated news-only page)
 * 2. inzicht_acties → '/will' (richest overview)
 * 3. fallback       → '/core'
 */
/**
 * Get the first-win page path for an onboarding intent.
 * After onboarding, the user is routed to the page most relevant to their chosen intent.
 */
export function getFirstWinPath(intent: IntentId): string {
  const map: Record<IntentId, string> = {
    coaching: '/will',
    grip_uitgaven: '/core/budgets',
    overzicht_geld: '/core',
    toekomst: '/horizon',
    alles: '/will',
    nieuws: '/nieuws',
  }
  return map[intent]
}

export function getHomePath(activeModules: ModuleId[]): string {
  const isNewsOnly = activeModules.length === 1 && activeModules[0] === 'nieuws'
  if (isNewsOnly) return '/nieuws'
  if (activeModules.includes('inzicht_acties')) return '/will'
  return '/core'
}
