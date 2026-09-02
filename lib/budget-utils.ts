export interface BudgetRow {
  id: string
  name?: string | null
  default_limit: number | string
  interval?: string | null
  budget_type?: string | null
  is_essential?: boolean | null
}

export interface ChildBudgetRow {
  id: string
  parent_id: string | null
  name?: string | null
  default_limit: number | string
  interval?: string | null
  budget_type?: string | null
  is_essential?: boolean | null
}

export interface MustExpenseItem {
  name: string
  monthlyAmount: number
  annualAmount: number
  interval: string
}

/**
 * Budgettypes die GEEN uitgave/consumptie vertegenwoordigen: de blocklist die
 * `computeYearlyMustExpenses` al hanteert (essentiële jaaruitgaven) en sinds ADR
 * 0126 óók de consumptie-grondslag van het canonieke dagtarief
 * (`consumptionExpenseRows` in lib/expense-rate.ts). Eén lijst, twee lezers —
 * een tweede kopie zou precies de drift zijn die de blocklist bestrijdt.
 *
 * Blocklist en niet allowlist, want `budget_type` is optioneel: rijen zónder
 * type blijven meetellen. 'debt' staat er bewust NIET in — een aflossing is een
 * uitgave (spiegelt EXPENSE_DIRECTION_BUDGET_TYPES in lib/budget-spending.ts).
 */
export const EXCLUDED_BUDGET_TYPES: readonly string[] = ['archive', 'income', 'savings']

/**
 * De ENIGE toegestane jaarconversie van een budget-limiet: monthly ×12,
 * quarterly ×4, yearly (en elk onbekend/ontbrekend interval) ×1.
 *
 * Elke call-site die essentiële budgetten optelt tot `yearlyMustExpenses` — en
 * dus tot `fireTarget` = yearlyMustExpenses / effectiveSwr — consumeert deze
 * functie en herhaalt de conversie NIET. Zes call-sites deden dat wel, met
 * `interval === 'yearly' ? limit : limit * 12`; daarmee telde een QUARTERLY
 * budget ×12 in plaats van ×4 (3× te hoog), wat het FIRE-doel opblies en het
 * vrijheids-% verlaagde. `budgets.interval` staat quarterly expliciet toe
 * (CHECK IN ('monthly','quarterly','yearly')), dus dat was bereikbaar
 * gebruikersgedrag. Regressieslot: lib/budget-utils.test.ts.
 *
 * NB de fallback is bewust ×1, niet ×12: onbekend/ontbrekend interval telt als
 * jaarbedrag (conservatief, niet-opblazend). De DB-default is 'monthly' en de
 * CHECK laat niets anders toe, dus dat pad is in de praktijk onbereikbaar.
 */
export function annualAmount(limit: number, interval: string | null | undefined): number {
  if (interval === 'monthly') return limit * 12
  if (interval === 'quarterly') return limit * 4
  return limit // yearly / eenmalig
}

/**
 * Berekent de jaarlijkse must-expenses op basis van essential parent budgetten en hun children.
 *
 * Logica:
 * A) Essential parents: als ze essential children hebben, tel alleen die;
 *    anders tel alle children (backwards compat). Gebruik child interval wanneer er exact 1 child is.
 *    archive/income/savings-parents worden uitgesloten (zie vangnet hieronder).
 * B) Orphan essential children: essential children van niet-essential parents worden
 *    individueel meegeteld (archive/income/savings uitgesloten).
 *
 * VANGNET op tak A: elke call-site hoort `essentialParents` al te filteren op
 * `budget_type === 'expense'`; toen één call-site dat vergat telden Inkomen- en
 * Sparen-budgetten mee als essentiële uitgave (Willem €127.140 i.p.v. €13.140/jr).
 * Tak B had deze blocklist al — tak A nu ook, zodat de fout-klasse structureel
 * onmogelijk is. Blocklist (niet allowlist) omdat `budget_type` optioneel is:
 * rijen zónder type blijven meetellen, precies zoals voorheen.
 */
export function computeYearlyMustExpenses(
  essentialParentsInput: BudgetRow[],
  allChildren: ChildBudgetRow[],
): { yearlyMustExpenses: number; expenseItems: MustExpenseItem[] } {
  const expenseItems: MustExpenseItem[] = []
  let total = 0
  // Vóór het opbouwen van `essentialParentIds`, zodat de orphan-detectie in tak B
  // identiek is aan een call-site die dezelfde rijen zelf al had weggefilterd.
  const essentialParents = essentialParentsInput.filter(
    b => !EXCLUDED_BUDGET_TYPES.includes(b.budget_type ?? ''),
  )
  const essentialParentIds = new Set(essentialParents.map(b => b.id))

  // A: Essential parent budgets — gebruik essential children indien aanwezig; anders alle children
  for (const b of essentialParents) {
    const children = allChildren.filter(c => c.parent_id === b.id)
    const essentialChildren = children.filter(c => c.is_essential)
    const relevantChildren = essentialChildren.length > 0 ? essentialChildren : children

    const annual = relevantChildren.length > 0
      ? relevantChildren.reduce((sum, c) => sum + annualAmount(Number(c.default_limit), c.interval ?? b.interval), 0)
      : annualAmount(Number(b.default_limit), b.interval)

    // Display interval: bij exact 1 child gebruik child interval; anders parent interval
    const interval = relevantChildren.length === 1 ? (relevantChildren[0].interval ?? b.interval) : (b.interval ?? 'monthly')

    total += annual
    expenseItems.push({
      name: b.name ?? 'Onbekend budget',
      monthlyAmount: annual / 12,
      annualAmount: annual,
      interval: interval ?? 'monthly',
    })
  }

  // B: Essential children van niet-essential parents (orphans)
  const orphans = allChildren.filter(
    c =>
      c.is_essential &&
      !essentialParentIds.has(c.parent_id ?? '') &&
      !EXCLUDED_BUDGET_TYPES.includes(c.budget_type ?? ''),
  )
  for (const child of orphans) {
    const annual = annualAmount(Number(child.default_limit), child.interval)
    total += annual
    expenseItems.push({
      name: child.name ?? 'Onbekend budget',
      monthlyAmount: annual / 12,
      annualAmount: annual,
      interval: child.interval ?? 'monthly',
    })
  }

  return { yearlyMustExpenses: total, expenseItems }
}

/**
 * Platte budgetrij zoals de meeste routes 'm uit één `.from('budgets')` halen.
 * `default_limit` mag hier expliciet null/ontbrekend zijn: verschillende
 * call-sites typen de kolom defensief als nullable.
 */
export interface FlatBudgetRow extends Omit<BudgetRow, 'default_limit'> {
  default_limit: number | string | null | undefined
  parent_id?: string | null
}

/**
 * `yearlyMustExpenses` uit ÉÉN platte budgetlijst (parents + children door
 * elkaar) — de vorm die de snapshot-, rapport- en holdings-paden uit hun
 * bestaande budgets-query krijgen.
 *
 * Waarom deze wrapper bestaat: niet alleen de FORMULE moet één huis hebben,
 * ook de RIJ-SELECTIE. Zes call-sites telden jarenlang alleen de PARENT-limieten
 * (`is_essential ∧ budget_type='expense' ∧ parent_id IS NULL`) en misten
 * daarmee de parent/child-oprol én de orphan-tak van
 * `computeYearlyMustExpenses`. Dat is precies dezelfde fout-klasse als de
 * gedupliceerde jaarconversie, één laag hoger: identieke formule, andere
 * grondslag. Deze functie herhaalt de rekenlogica NIET — ze delegeert naar
 * `computeYearlyMustExpenses` en legt alleen de twee filters vast.
 *
 * De children worden vóórgefilterd op EXCLUDED_BUDGET_TYPES, identiek aan
 * lib/dashboard-data-loader.ts en lib/horizon-data-loader.ts. Dat is bewust:
 * tak A van `computeYearlyMustExpenses` past die blocklist NIET op children toe
 * (alleen tak B doet dat), dus een archive/income/savings-kind onder een
 * essentiële uitgave-parent zou zónder vóórfilter wél meetellen. Op de huidige
 * data bestaat die combinatie niet, maar de twee vormen zijn niet identiek —
 * daarom volgen we de vorm van de dominante oppervlakken (dashboard/toekomst).
 *
 * `default_limit` wordt genormaliseerd met `Number(x) || 0`. Dat is GEEN
 * cosmetica: alle zes gemigreerde call-sites hadden die guard in hun eigen som
 * staan. `computeYearlyMustExpenses` doet kaal `Number(...)`, en dat is voor
 * null gelijk (0) maar NIET voor undefined (NaN) — één ontbrekende kolom in een
 * select zou de hele jaarsom naar NaN trekken. De guard blijft dus staan.
 */
export function yearlyMustExpensesFromBudgets(allBudgets: FlatBudgetRow[]): number {
  const normalize = (b: FlatBudgetRow) => ({ ...b, default_limit: Number(b.default_limit) || 0 })
  const essentialParents: BudgetRow[] = allBudgets
    .filter(b => b.is_essential && b.budget_type === 'expense' && (b.parent_id ?? null) === null)
    .map(normalize)
  const children: ChildBudgetRow[] = allBudgets
    .filter(
      b => (b.parent_id ?? null) !== null && !EXCLUDED_BUDGET_TYPES.includes(b.budget_type ?? ''),
    )
    .map(b => ({ ...normalize(b), parent_id: b.parent_id ?? null }))
  return computeYearlyMustExpenses(essentialParents, children).yearlyMustExpenses
}

/** Minimale rijvorm voor de type-erfregel: id, ouder en eigen type. */
export interface BudgetTypeRow {
  id: string
  parent_id: string | null
  budget_type: string
}

/**
 * Map budget_id → budget_type, voor ZOWEL parent- als child-budgetten. Een child
 * ERFT het type van zijn parent (en valt weg als die parent ontbreekt).
 *
 * Woonde tot ADR 0103 in lib/cashflow-kpis.ts. Verhuisd hierheen omdat die module
 * Supabase-fetchers importeert en `lib/budget-basis.ts` (de grondslag-motor) een
 * PURE module moet blijven; twee kopieën van deze erfregel zou precies de drift
 * opleveren die de regel bestrijdt. `lib/cashflow-kpis.ts` re-exporteert 'm zodat
 * bestaande call-sites (dashboard-data-loader) ongewijzigd blijven.
 */
export function buildBudgetTypeMap(budgets: BudgetTypeRow[]): Map<string, string> {
  const parents = budgets.filter(b => b.parent_id === null)
  const children = budgets.filter(b => b.parent_id !== null)
  const budgetTypeMap = new Map<string, string>()
  for (const b of parents) budgetTypeMap.set(b.id, b.budget_type)
  for (const c of children) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }
  return budgetTypeMap
}

export type RetirementExpenseMethod =
  | 'essential_budgets'
  | 'custom_amount'
  | 'current_income'

/**
 * Berekent de jaarlijkse uitgave na retirement op basis van de gekozen methode.
 *
 * - essential_budgets: gebruik yearlyMustExpenses (berekend uit essentiële budgetten)
 * - custom_amount: gebruik het door de gebruiker opgegeven bedrag (in huidige prijzen)
 * - current_income: gebruik het huidige jaarinkomen als uitgavenpatroon
 *
 * Valt terug op yearlyMustExpenses als de gekozen methode geen geldige waarde oplevert.
 */
export function computeRetirementExpenses(
  method: RetirementExpenseMethod | null | undefined,
  yearlyMustExpenses: number,
  yearlyIncome: number,
  customAmount?: number | null,
  estimatedYearlyExpenses?: number,
): number {
  switch (method) {
    case 'custom_amount': {
      const amt = Number(customAmount ?? 0)
      return amt > 0 ? amt : (estimatedYearlyExpenses ?? yearlyMustExpenses)
    }
    case 'current_income':
      return yearlyIncome > 0
        ? yearlyIncome
        : (estimatedYearlyExpenses ?? yearlyMustExpenses)
    case 'essential_budgets':
    default:
      return yearlyMustExpenses > 0
        ? yearlyMustExpenses
        : (estimatedYearlyExpenses ?? 0)
  }
}
