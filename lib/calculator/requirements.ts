/**
 * Rekenhulp — vereisten-detectie.
 *
 * Pure afleiding uit een `CalculatorDefinition`: welke gebruikersdata
 * moet een bezoeker hebben om deze rekenhulp zinvol te kunnen draaien?
 * Geen DB-velden, geen LLM-call — louter mapping van gebruikte
 * `prefill`-keys naar semantische vereisten.
 *
 * Twee functies:
 *   - inferRequirements(def) → CalculatorRequirement[]
 *   - checkRequirements(reqs, ctx) → CalculatorRequirementCheck[]
 *
 * Het resultaat voedt de bibliotheek-lijstkaart (chip-rij), de detail-
 * preview-checklist en de duplicate-waarschuwing.
 */

import type { CalculatorDefinition } from './types'

export type RequirementKind =
  | 'debt:mortgage'
  | 'debt:any'
  | 'asset:home'
  | 'asset:investment'
  | 'asset:cash'
  | 'asset:any'
  | 'profile:income'
  | 'profile:expenses'
  | 'profile:income_and_expenses'
  | 'profile:dob'

export interface CalculatorRequirement {
  kind: RequirementKind
  /** Korte Nederlandse label voor chip-weergave ("Hypotheek"). */
  label: string
  /** Iets langer voor de checklist op detail-preview. */
  detail: string
  /** App-deeplink waar de gebruiker dit kan toevoegen. */
  deepLink: string
}

/**
 * Mapping prefill-key → vereiste. Eén key kan meerdere vereisten
 * impliceren (bv. monthly_surplus = income + expenses).
 */
const PREFILL_TO_REQUIREMENTS: Record<string, RequirementKind[]> = {
  mortgage_balance: ['debt:mortgage'],
  home_value: ['asset:home'],
  investment_total: ['asset:investment'],
  liquid_cash: ['asset:cash'],
  total_assets: ['asset:any'],
  total_debts: ['debt:any'],
  monthly_income: ['profile:income'],
  monthly_expenses: ['profile:expenses'],
  monthly_surplus: ['profile:income_and_expenses'],
  current_age: ['profile:dob'],
  // net_worth, gross_return, inflation_rate hebben géén vereiste —
  // altijd beschikbaar of veilige default.
}

const REQUIREMENT_META: Record<RequirementKind, Omit<CalculatorRequirement, 'kind'>> = {
  'debt:mortgage': {
    label: 'Hypotheek',
    detail: 'Een actieve schuld van het type hypotheek',
    deepLink: '/core/debts',
  },
  'debt:any': {
    label: 'Schuld',
    detail: 'Minstens één actieve schuld',
    deepLink: '/core/debts',
  },
  'asset:home': {
    label: 'Eigen huis',
    detail: 'Een eigen huis als bezit',
    deepLink: '/core/assets',
  },
  'asset:investment': {
    label: 'Beleggingen',
    detail: 'Een beleggings- of crypto-bezit',
    deepLink: '/core/assets',
  },
  'asset:cash': {
    label: 'Spaargeld',
    detail: 'Een cash- of spaarrekening',
    deepLink: '/core/assets',
  },
  'asset:any': {
    label: 'Bezit',
    detail: 'Minstens één bezit',
    deepLink: '/core/assets',
  },
  'profile:income': {
    label: 'Inkomen',
    detail: 'Netto maandinkomen ingevuld in je profiel',
    deepLink: '/identity',
  },
  'profile:expenses': {
    label: 'Uitgaven',
    detail: 'Maandelijkse uitgaven ingevuld',
    deepLink: '/identity',
  },
  'profile:income_and_expenses': {
    label: 'Inkomen + uitgaven',
    detail: 'Zowel inkomen als uitgaven ingevuld',
    deepLink: '/identity',
  },
  'profile:dob': {
    label: 'Leeftijd',
    detail: 'Geboortedatum ingevuld in je profiel',
    deepLink: '/identity',
  },
}

/**
 * Lees de `prefill`-keys uit alle inputs en converteer naar een
 * gedupliceerde, gesorteerde lijst vereisten.
 */
export function inferRequirements(
  definition: CalculatorDefinition,
): CalculatorRequirement[] {
  const kinds = new Set<RequirementKind>()
  for (const input of definition.inputs ?? []) {
    if (!input.prefill) continue
    const mapped = PREFILL_TO_REQUIREMENTS[input.prefill]
    if (!mapped) continue
    for (const k of mapped) kinds.add(k)
  }
  return Array.from(kinds).map((kind) => ({ kind, ...REQUIREMENT_META[kind] }))
}

// ── Resolver tegen gebruikersdata ─────────────────────────────────

/**
 * Compacte context die we tegen vereisten matchen. Gevuld vanuit de
 * bestaande horizon-data-bundle in de server-component. Houden we
 * losjes-getypeerd zodat de loader-shape mag evolueren.
 */
export interface UserDataContext {
  hasMortgage: boolean
  hasHome: boolean
  hasInvestment: boolean
  hasCash: boolean
  hasAnyAsset: boolean
  hasAnyDebt: boolean
  hasIncome: boolean
  hasExpenses: boolean
  hasDob: boolean
}

export interface CalculatorRequirementCheck extends CalculatorRequirement {
  met: boolean
}

export function checkRequirements(
  reqs: CalculatorRequirement[],
  ctx: UserDataContext,
): CalculatorRequirementCheck[] {
  return reqs.map((req) => ({
    ...req,
    met: matches(req.kind, ctx),
  }))
}

function matches(kind: RequirementKind, ctx: UserDataContext): boolean {
  switch (kind) {
    case 'debt:mortgage':
      return ctx.hasMortgage
    case 'debt:any':
      return ctx.hasAnyDebt
    case 'asset:home':
      return ctx.hasHome
    case 'asset:investment':
      return ctx.hasInvestment
    case 'asset:cash':
      return ctx.hasCash
    case 'asset:any':
      return ctx.hasAnyAsset
    case 'profile:income':
      return ctx.hasIncome
    case 'profile:expenses':
      return ctx.hasExpenses
    case 'profile:income_and_expenses':
      return ctx.hasIncome && ctx.hasExpenses
    case 'profile:dob':
      return ctx.hasDob
  }
}

/**
 * Helper: bouw `UserDataContext` uit de minimale subset die
 * `loadHorizonData` levert. Houden we los van `PrefillSource` zodat we
 * niet aan dezelfde shape gebonden zijn (vereisten kunnen verschillen).
 */
export interface UserDataSource {
  effectiveInput?: {
    monthlyIncome?: number | null
    monthlyExpenses?: number | null
    dateOfBirth?: string | null
  } | null
  unlinkedCash?: number | null
  assets?: Array<{ asset_type?: string | null; current_value?: number | null }> | null
  debts?: Array<{ debt_type?: string | null; current_balance?: number | null }> | null
  housingContext?: { eigenHuisValue?: number | null; mortgageBalance?: number | null } | null
}

export function buildUserDataContext(src: UserDataSource): UserDataContext {
  const assets = src.assets ?? []
  const debts = src.debts ?? []
  const ei = src.effectiveInput ?? {}

  const cashFromAssets = assets.some((a) =>
    ['cash', 'savings', 'checking'].includes(a.asset_type ?? ''),
  )
  const unlinkedCash = Number(src.unlinkedCash ?? 0) > 0

  return {
    hasMortgage:
      Number(src.housingContext?.mortgageBalance ?? 0) > 0 ||
      debts.some((d) => d.debt_type === 'mortgage'),
    hasHome: Number(src.housingContext?.eigenHuisValue ?? 0) > 0,
    hasInvestment: assets.some((a) =>
      ['investment', 'crypto'].includes(a.asset_type ?? ''),
    ),
    hasCash: cashFromAssets || unlinkedCash,
    hasAnyAsset: assets.length > 0,
    hasAnyDebt: debts.length > 0 || Number(src.housingContext?.mortgageBalance ?? 0) > 0,
    hasIncome: Number(ei.monthlyIncome ?? 0) > 0,
    hasExpenses: Number(ei.monthlyExpenses ?? 0) > 0,
    hasDob: Boolean(ei.dateOfBirth),
  }
}
