/**
 * Goal types, labels, and progress helpers for the Will module.
 */

export type GoalType =
  | 'savings'
  | 'debt_payoff'
  | 'net_worth'
  | 'freedom_days'
  | 'savings_rate'
  | 'invested_assets'
  | 'passive_income'
  | 'emergency_fund'
  | 'salary'
  | 'expected_return'
  | 'fire_age'
  | 'custom'

export type GoalOwnership = 'personal' | 'shared'

export type Goal = {
  id: string
  user_id: string
  name: string
  description: string | null
  goal_type: GoalType
  target_value: number
  current_value: number
  target_date: string | null
  linked_asset_id: string | null
  linked_debt_id: string | null
  budget_id?: string | null
  custom_unit?: string | null
  icon: string
  color: string
  is_completed: boolean
  completed_at: string | null
  sort_order: number
  ownership: GoalOwnership
  household_id: string | null
  /**
   * Vrije JSONB-metadata (kolom `goals.metadata`, DEFAULT `{}`; ronde 4). Lab-
   * gegenereerde parameter-doelen dragen `metadata.bron === 'parameter'` plus
   * `oorsprong` (`'lab'|'backfill'`) en — voor het FIRE-doel — `margeDoelJaren`.
   * Optioneel: oude rijen of legacy-DB's zonder de kolom leveren geen veld (de
   * lezers behandelen ontbrekend/`null`/`{}` defensief als "geen parameter-doel").
   */
  metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  savings: 'Spaardoel',
  debt_payoff: 'Schuld aflossen',
  net_worth: 'Netto vermogen',
  freedom_days: 'Vrijheidsdagen',
  savings_rate: 'Spaarquote',
  invested_assets: 'Belegd vermogen',
  passive_income: 'Passief inkomen',
  emergency_fund: 'Noodfonds',
  salary: 'Salaris',
  expected_return: 'Verwacht rendement',
  fire_age: 'Vrijheidsleeftijd',
  custom: 'Vrij doel',
}

export const GOAL_TYPE_ICONS: Record<GoalType, string> = {
  savings: 'PiggyBank',
  debt_payoff: 'CreditCard',
  net_worth: 'TrendingUp',
  freedom_days: 'Sun',
  savings_rate: 'Activity',
  invested_assets: 'LineChart',
  passive_income: 'Banknote',
  emergency_fund: 'ShieldCheck',
  salary: 'Briefcase',
  expected_return: 'Coins',
  fire_age: 'Hourglass',
  custom: 'Target',
}

export type GoalTypeMeta = {
  unit: string
  group: 'Financieel' | 'Persoonlijk'
  step: string
  min?: number
  max?: number
  supportsAssetLink: boolean
  supportsDebtLink: boolean
  freedomTimeRelevant: boolean
  /**
   * Voortgangsrichting. 'up' (afwezig = default) = hoger-is-beter (spaargeld,
   * vermogen, spaarquote …). 'down' = lager-is-beter: de gewenste waarde ligt
   * ONDER de huidige (bv. `fire_age`: eerder vrij = beter). Alleen expliciet
   * gezet waar het van 'up' afwijkt — zie `computeGoalProgress`.
   */
  direction?: 'up' | 'down'
  /**
   * true = dit doel-type wordt via het /toekomst-lab ("verkennen wordt richten")
   * gegenereerd en is NIET vrij aanmaakbaar in GoalForm. Afwezig/false = normaal
   * handmatig aanmaakbaar (bestaand gedrag, incl. `savings_rate`/`salary`).
   */
  viaLab?: boolean
}

export const GOAL_TYPE_META: Record<GoalType, GoalTypeMeta> = {
  savings:         { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: false, freedomTimeRelevant: true },
  debt_payoff:     { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: false, supportsDebtLink: true,  freedomTimeRelevant: true },
  net_worth:       { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: false, freedomTimeRelevant: true },
  freedom_days:    { unit: 'dagen', group: 'Financieel', step: '1',  supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false },
  savings_rate:    { unit: '%',  group: 'Financieel', step: '0.1', min: 0, max: 100, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false },
  invested_assets: { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: true,  supportsDebtLink: false, freedomTimeRelevant: true },
  passive_income:  { unit: 'EUR/mnd', group: 'Financieel', step: '0.01', supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false },
  emergency_fund:  { unit: 'maanden', group: 'Financieel', step: '0.5', min: 0, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false },
  salary:          { unit: 'EUR', group: 'Financieel', step: '0.01', supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: true },
  expected_return: { unit: '%',   group: 'Financieel', step: '0.1', min: 0,  max: 20,  supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, viaLab: true },
  fire_age:        { unit: 'jaar', group: 'Financieel', step: '0.5', min: 18, max: 100, supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false, direction: 'down', viaLab: true },
  custom:          { unit: 'custom', group: 'Persoonlijk', step: '1',  supportsAssetLink: false, supportsDebtLink: false, freedomTimeRelevant: false },
}

/**
 * Format a goal value with the appropriate unit suffix/prefix.
 */
export function formatGoalValue(value: number, goalType: GoalType, customUnit?: string | null): string {
  const meta = GOAL_TYPE_META[goalType]
  switch (meta.unit) {
    case 'EUR':
      return `€${value.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    case 'EUR/mnd':
      return `€${value.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mnd`
    case '%':
      return `${value.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    case 'dagen':
      return `${Math.round(value)} dagen`
    case 'maanden':
      return `${value.toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} maanden`
    case 'jaar':
      // Halve jaren mogelijk (step 0.5) → 1 decimaal, maar trailing .0 weglaten
      // ("58 jaar" / "58,5 jaar").
      return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} jaar`
    case 'custom':
      return customUnit ? `${value.toLocaleString('nl-NL')} ${customUnit}` : value.toLocaleString('nl-NL')
    default:
      return value.toLocaleString('nl-NL')
  }
}

/**
 * Get form labels for target/current fields based on goal type.
 */
export function goalValueLabels(goalType: GoalType): { target: string; current: string } {
  switch (goalType) {
    case 'savings':
    case 'net_worth':
    case 'invested_assets':
    case 'salary':
      return { target: 'Doelbedrag (€)', current: 'Huidige waarde (€)' }
    case 'debt_payoff':
      return { target: 'Totale schuld (€)', current: 'Afgelost (€)' }
    case 'passive_income':
      return { target: 'Doel (€/mnd)', current: 'Huidig (€/mnd)' }
    case 'freedom_days':
      return { target: 'Doeldagen', current: 'Huidige dagen' }
    case 'savings_rate':
      return { target: 'Doelpercentage (%)', current: 'Huidige spaarquote (%)' }
    case 'emergency_fund':
      return { target: 'Doelmaanden', current: 'Huidige maanden' }
    case 'expected_return':
      return { target: 'Doelrendement (%)', current: 'Huidig rendement (%)' }
    case 'fire_age':
      return { target: 'Doel-vrijheidsleeftijd', current: 'Huidige vrijheidsleeftijd' }
    case 'custom':
      return { target: 'Doelwaarde', current: 'Huidige waarde' }
    default:
      return { target: 'Doelwaarde', current: 'Huidige waarde' }
  }
}

export const GOAL_COLORS = [
  { value: 'teal', label: 'Teal', class: 'bg-wil-500' },
  { value: 'amber', label: 'Amber', class: 'bg-kern-500' },
  { value: 'purple', label: 'Paars', class: 'bg-horizon-500' },
  { value: 'emerald', label: 'Groen', class: 'bg-emerald-500' },
  { value: 'red', label: 'Rood', class: 'bg-red-500' },
  { value: 'blue', label: 'Blauw', class: 'bg-blue-500' },
]

/**
 * Absolute speling (in de eenheid van het doel) waarbinnen een `down`-doel nog
 * als "op koers" geldt. Bewust ABSOLUUT, niet relatief: 'down' geldt momenteel
 * alleen voor `fire_age` (jaar), waar ~3 maanden vaste marge zinvol is — een
 * relatieve marge op een leeftijd (bv. 1% van 58 ≈ 0,6 jr) zou meebewegen met
 * de leeftijd en dat is hier onlogisch.
 */
const DOWN_GOAL_ONTRACK_TOLERANCE = 0.25

/**
 * Compute goal progress.
 * For debt_payoff, progress = how much has been paid off.
 * For freedom_days, current value is free days per year.
 *
 * Richting-bewust: bij `direction: 'down'` (lager-is-beter, bv. `fire_age`) is
 * het doel een LAGERE waarde dan de huidige; voortgang = target / current. Alle
 * bestaande types zijn 'up' (default) en behouden exact hun gedrag.
 */
export function computeGoalProgress(goal: Goal): {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
} {
  const current = Number(goal.current_value)
  const target = Number(goal.target_value)

  const direction = GOAL_TYPE_META[goal.goal_type]?.direction ?? 'up'

  if (direction === 'down') {
    // Lager-is-beter. Ongeldig doel of nog geen (positieve) huidige waarde →
    // 0% en niet op koers (geen stale/misleidende voortgang).
    if (target <= 0 || !Number.isFinite(current) || current <= 0) {
      return { current, target, pct: 0, onTrack: false, eta: null }
    }
    const pct = Math.max(0, Math.min(Math.round((target / current) * 100), 100))
    const onTrack = current <= target + DOWN_GOAL_ONTRACK_TOLERANCE
    // target_date-tijdlijnlogica is alleen zinvol voor 'up'-doelen.
    return { current, target, pct, onTrack, eta: null }
  }

  if (target <= 0) return { current, target, pct: 0, onTrack: false, eta: null }

  const pct = Math.min(Math.round((current / target) * 100), 100)

  // Estimate ETA based on target_date
  let onTrack = true
  let eta: string | null = null

  if (goal.target_date) {
    const targetDate = new Date(goal.target_date)
    const now = new Date()
    const daysLeft = Math.max(0, (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    const totalDays = (targetDate.getTime() - new Date(goal.created_at).getTime()) / (1000 * 60 * 60 * 24)

    if (totalDays > 0 && daysLeft > 0) {
      const expectedPct = ((totalDays - daysLeft) / totalDays) * 100
      onTrack = pct >= expectedPct * 0.9 // 10% tolerance
    }

    eta = targetDate.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' })
  }

  return { current, target, pct, onTrack, eta }
}

/**
 * Get the color classes for a goal color string.
 */
export function getGoalColorClasses(color: string): {
  bg: string
  bgLight: string
  text: string
  border: string
  bar: string
} {
  switch (color) {
    case 'amber':
      return { bg: 'bg-kern-500', bgLight: 'bg-kern-50', text: 'text-kern-600', border: 'border-kern-200', bar: 'bg-kern-500' }
    case 'purple':
      return { bg: 'bg-horizon-500', bgLight: 'bg-horizon-50', text: 'text-horizon-600', border: 'border-horizon-200', bar: 'bg-horizon-500' }
    case 'emerald':
      return { bg: 'bg-emerald-500', bgLight: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', bar: 'bg-emerald-500' }
    case 'red':
      return { bg: 'bg-red-500', bgLight: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', bar: 'bg-red-500' }
    case 'blue':
      return { bg: 'bg-blue-500', bgLight: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', bar: 'bg-blue-500' }
    case 'teal':
    default:
      return { bg: 'bg-wil-500', bgLight: 'bg-wil-50', text: 'text-wil-600', border: 'border-wil-200', bar: 'bg-wil-500' }
  }
}
