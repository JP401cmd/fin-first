/**
 * Budget rollover calculations.
 * Activates the rollover_type field on budgets:
 * - reset: carry = 0 each month
 * - carry-over: leftover rolls into next month
 * - invest-sweep: leftover goes to investment, carry = 0
 */

export type BudgetRollover = {
  id: string
  user_id: string
  budget_id: string
  period: string // 'YYYY-MM'
  carried_amount: number
  rollover_type: string
  created_at: string
}

/**
 * Compute rollover result for a budget period.
 * @param limit - base budget limit
 * @param spent - total spent in that period
 * @param previousCarry - carried amount from previous period
 * @param rolloverType - 'reset' | 'carry-over' | 'invest-sweep'
 */
export function computeRollover(
  limit: number,
  spent: number,
  previousCarry: number,
  rolloverType: string,
): { carry: number; swept: number } {
  // KLEM OP 0 — hier, niet bij de aanroeper. Sinds de norm van 30 aug 2026 kan
  // een bestedingssom NEGATIEF zijn (meer inkomsten dan uitgaven op een
  // uitgaven-budget). Met spent = −6.735 en limiet 1.642 zou `remaining`
  // 8.377 worden en die carry landt PERMANENT in budget_rollovers (UNIQUE op
  // budget_id+period: de rij wordt per periode maar één keer aangemaakt), zodat
  // het budget van volgende maand stil opgeblazen blijft.
  // De WEERGAVE mag negatief zijn, de carry-grondslag niet — en die grens hoort
  // in deze functie te zitten, niet bij de ene aanroeper: verdwijnt de klem
  // daar, dan is er niets dat het tegenhoudt.
  const spentForCarry = Math.max(0, spent)
  const effectiveLimit = limit + previousCarry
  const remaining = Math.max(0, effectiveLimit - spentForCarry)

  switch (rolloverType) {
    case 'carry-over':
      return { carry: remaining, swept: 0 }
    case 'invest-sweep':
      return { carry: 0, swept: remaining }
    case 'reset':
    default:
      return { carry: 0, swept: 0 }
  }
}

/**
 * Get the effective budget limit for a given period (base + carry-over).
 */
export function getEffectiveLimit(
  defaultLimit: number,
  rollovers: BudgetRollover[],
  period: string,
): number {
  const rollover = rollovers.find((r) => r.period === period)
  return defaultLimit + (rollover ? Number(rollover.carried_amount) : 0)
}

/**
 * Get the carried amount for a specific period.
 */
export function getCarriedAmount(
  rollovers: BudgetRollover[],
  period: string,
): number {
  const rollover = rollovers.find((r) => r.period === period)
  return rollover ? Number(rollover.carried_amount) : 0
}

/** Een periode-specifieke limiet-override uit `budget_amounts`. */
export type BudgetAmountOverride = {
  budget_id: string
  effective_from: string // 'YYYY-MM-DD'
  amount: number
}

/**
 * Canonieke effectieve-limiet — de ENE bron van waarheid voor "wat is het
 * budget deze periode", die zowel de budgetten-pagina (`budgets-client`) als
 * het dashboard (`dashboard-data-loader` → heatmap-widget) consumeren, zodat
 * "beschikbaar" nooit tussen twee schermen uiteenloopt (consume, don't recompute).
 *
 * Samenstelling van de limiet:
 * - `base`   = meest recente periode-override uit `budget_amounts`
 *              (`effective_from <= displayDate`), of anders `defaultLimit`.
 * - single   = `(base + carry) * fraction` — `carry` = rollover-overschot dat
 *              vanuit de vorige periode is meegenomen (`carry-over`-budgetten).
 * - multi    = `base * monthCount * fraction` — over meerdere periodes telt een
 *              rollover niet mee (die geldt per maand).
 *
 * `shareFraction` is het pro-rata huishoud-aandeel waarmee een gedeeld budget
 * WORDT WEERGEGEVEN (1 = eigen budget / geen deling). Laat 'm op 1 wanneer de
 * bijbehorende besteding óók ongeschaald is (bv. de personal-perspective
 * dashboard-loader), anders lopen limiet en besteding uiteen.
 */
export function computeEffectiveLimit(params: {
  defaultLimit: number
  rollovers: BudgetRollover[]
  amountOverrides: BudgetAmountOverride[]
  period: string // 'YYYY-MM'
  displayDate: string // 'YYYY-MM-DD'
  periodMonthCount?: number
  shareFraction?: number
}): number {
  const {
    defaultLimit,
    rollovers,
    amountOverrides,
    period,
    displayDate,
    periodMonthCount = 1,
    shareFraction = 1,
  } = params

  const carry = getCarriedAmount(rollovers, period)

  const applicable = amountOverrides
    .filter((a) => a.effective_from <= displayDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  const baseLimit = applicable.length > 0 ? Number(applicable[0].amount) : Number(defaultLimit)

  if (periodMonthCount > 1) {
    return baseLimit * periodMonthCount * shareFraction
  }

  return (baseLimit + carry) * shareFraction
}

/**
 * De rijen die een effectieve-limiet-berekening voor ÉÉN periode nodig heeft,
 * ongeïndexeerd zoals ze uit de database komen.
 *
 * `period` en `displayDate` horen bij elkaar: `displayDate` is de 1e van diezelfde
 * maand (`'YYYY-MM-01'`). Beide meegeven i.p.v. de een uit de ander afleiden,
 * zodat de aanroeper dezelfde maandgrens gebruikt als zijn eigen queries — een
 * loader die zijn maand vóór de fetches bemonstert mag daar niet stil van
 * afwijken.
 */
export interface EffectiveLimitContext {
  /** Rollover-rijen; alleen die van `period` tellen mee (`getCarriedAmount`). */
  rollovers: BudgetRollover[]
  /** Periode-overrides; de meest recente met `effective_from <= displayDate` wint. */
  amountOverrides: BudgetAmountOverride[]
  /** `'YYYY-MM'` van de getoonde periode. */
  period: string
  /** `'YYYY-MM-DD'` — de 1e van diezelfde maand. */
  displayDate: string
}

/**
 * Bouwt één opzoeker `budget → effectieve limiet deze maand` uit een
 * `EffectiveLimitContext`, met de rijen vooraf per budget geïndexeerd (O(1) per
 * budget i.p.v. een filter over álle rijen per budget — dezelfde reden waarom
 * `budgets-client` zijn `budgetAmountsIndex`/`rolloversIndex` memoïseert).
 *
 * ELKE consument die "de limiet van dit budget déze maand" nodig heeft consumeert
 * `computeEffectiveLimit` — via deze opzoeker of rechtstreeks. Een tweede
 * limiet-formule (kale `default_limit`) laat kaart en pagina uiteenlopen: dat was
 * precies de melding van 31 aug 2026, waar de Budget-KPI op /overzicht(/cashflow)
 * de periode-override en de carry niet meenam en de budgetten-pagina wél.
 *
 * TWEE VASTE KEUZES, en ze horen bij elkaar:
 *  · `periodMonthCount = 1` — deze opzoeker beschrijft ÉÉN kalendermaand. De
 *    meermaands-tak van `computeEffectiveLimit` (YTD/12m-blik op de budgetten-
 *    pagina) laat de carry bewust vallen; wie die blik nodig heeft roept
 *    `computeEffectiveLimit` rechtstreeks aan.
 *  · `shareFraction = 1` — ONGESCHAALD, geen huishoud-aandeel. Correct zolang de
 *    bijbehorende BESTEDING óók ongeschaald is (de persoonlijke dashboard-/
 *    KPI-grondslag); zou de limiet hier pro-rata worden en de besteding niet,
 *    dan lopen teller en noemer uiteen.
 */
export function createEffectiveLimitLookup(
  ctx: EffectiveLimitContext,
): (budget: { id: string; default_limit: number | string | null }) => number {
  const rolloversById = new Map<string, BudgetRollover[]>()
  for (const r of ctx.rollovers) {
    const list = rolloversById.get(r.budget_id)
    if (list) list.push(r)
    else rolloversById.set(r.budget_id, [r])
  }

  const overridesById = new Map<string, BudgetAmountOverride[]>()
  for (const a of ctx.amountOverrides) {
    const list = overridesById.get(a.budget_id)
    if (list) list.push(a)
    else overridesById.set(a.budget_id, [a])
  }

  return (budget) =>
    computeEffectiveLimit({
      defaultLimit: Number(budget.default_limit),
      rollovers: rolloversById.get(budget.id) ?? [],
      amountOverrides: overridesById.get(budget.id) ?? [],
      period: ctx.period,
      displayDate: ctx.displayDate,
    })
}

/**
 * Format a period string from a Date.
 */
export function formatPeriod(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Get the previous period string.
 */
export function getPreviousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const date = new Date(y, m - 2, 1) // m-1 is current month (0-based), m-2 is previous
  return formatPeriod(date)
}
