import { describe, it, expect } from 'vitest'
import { computeYearlyMustExpenses, computeRetirementExpenses, type BudgetRow, type ChildBudgetRow } from './budget-utils'
import { PERSONAS } from './test-personas'

/**
 * Regressie-slot voor de FIRE-pensioenuitgave-12×-bug (Notion: "custom_amount
 * als jaarbedrag i.p.v. maandbedrag"). `retirement_expense_custom_amount` is
 * OVERAL in de codebase een JAARBEDRAG — `computeRetirementExpenses` geeft het
 * veld ongewijzigd terug (geen ×12/÷12), en de adapter/loader voeden het
 * rechtstreeks als `uitgaveNaPensioenPerJaar`. De persona-seed hoorde daarom
 * óók een jaarbedrag te bevatten; deed dat niet (maandbedrag), waardoor de hele
 * FIRE-projectie voor Willem/Marijke 12× te laag draaide.
 */
describe('computeRetirementExpenses — custom_amount is een JAARBEDRAG', () => {
  it('geeft het custom-bedrag ongewijzigd terug als jaaruitgave (geen ×12/÷12)', () => {
    expect(computeRetirementExpenses('custom_amount', 11400, 40800, 36000)).toBe(36000)
  })

  it('valt terug op de geschatte jaaruitgaven wanneer custom_amount ≤ 0 of ontbreekt', () => {
    expect(computeRetirementExpenses('custom_amount', 11400, 40800, 0, 30000)).toBe(30000)
    expect(computeRetirementExpenses('custom_amount', 11400, 40800, null, 30000)).toBe(30000)
    // negatief bedrag telt niet als geldige custom-waarde → fallback
    expect(computeRetirementExpenses('custom_amount', 11400, 40800, -100, 30000)).toBe(30000)
  })
})

describe('persona-seed: retirement custom_amount staat op JAARbasis (12×-regressieslot)', () => {
  it('Willem = €36.000/jaar (€3.000/mnd × 12), niet €3.000', () => {
    const willem = PERSONAS.willem
    // seedveld = 12× de maanduitgaven uit de meta (voorkomt her-introductie maandbedrag)
    expect(willem.profile.retirement_expense_custom_amount).toBe(willem.meta.expenses * 12)
    const jaar = computeRetirementExpenses(
      'custom_amount', 0, 0, willem.profile.retirement_expense_custom_amount,
    )
    expect(jaar).toBe(36000)
  })

  it('Marijke = €33.600/jaar (€2.800/mnd × 12), niet €2.800', () => {
    const marijke = PERSONAS.marijke
    expect(marijke.profile.retirement_expense_custom_amount).toBe(marijke.meta.expenses * 12)
    const jaar = computeRetirementExpenses(
      'custom_amount', 0, 0, marijke.profile.retirement_expense_custom_amount,
    )
    expect(jaar).toBe(33600)
  })
})

/**
 * Cases hieronder zijn geport uit lib/regression-tests/suites/budget-berekeningen.ts
 * (secties A + B, ids budget-must-exp-* en budget-retire-*) zodat de pure
 * calc-dekking ook onder `npm run test:run` / CI draait, niet alleen via de
 * dev-only in-app suite op /beheer/regressietest. Zie ook
 * test/budget-berekeningen-suite-check.test.ts voor de suite-wrapper die de
 * volledige categorie (incl. sectie C, forecast/rollover/alerts) bewaakt.
 */

const ESSENTIAL_PARENTS: BudgetRow[] = [
  { id: 'p-wonen', name: 'Wonen', default_limit: 1200, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'p-vervoer', name: 'Vervoer', default_limit: 300, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'p-verzek', name: 'Verzekeringen', default_limit: 500, interval: 'quarterly', budget_type: 'expense', is_essential: true },
]

const ALL_CHILDREN: ChildBudgetRow[] = [
  // Wonen children — 2 essential children
  { id: 'c-huur', parent_id: 'p-wonen', name: 'Huur', default_limit: 900, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'c-energie', parent_id: 'p-wonen', name: 'Energie', default_limit: 150, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'c-deco', parent_id: 'p-wonen', name: 'Decoratie', default_limit: 50, interval: 'monthly', budget_type: 'expense', is_essential: false },
  // Vervoer children — no essential children → all counted
  { id: 'c-ov', parent_id: 'p-vervoer', name: 'OV', default_limit: 120, interval: 'monthly', budget_type: 'expense', is_essential: false },
  { id: 'c-auto', parent_id: 'p-vervoer', name: 'Auto', default_limit: 200, interval: 'monthly', budget_type: 'expense', is_essential: false },
  // Verzekeringen — 1 essential child (uses child interval)
  { id: 'c-zorg', parent_id: 'p-verzek', name: 'Zorgverzekering', default_limit: 130, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'c-auto-verz', parent_id: 'p-verzek', name: 'Autoverzekering', default_limit: 80, interval: 'quarterly', budget_type: 'expense', is_essential: false },
  // Orphan essential child (parent is not essential)
  { id: 'c-orphan', parent_id: 'p-other', name: 'Kinderopvang', default_limit: 400, interval: 'monthly', budget_type: 'expense', is_essential: true },
  // Orphan essential children with excluded budget_type → should be excluded
  { id: 'c-orphan-archive', parent_id: 'p-archive', name: 'Oud budget', default_limit: 100, interval: 'monthly', budget_type: 'archive', is_essential: true },
  { id: 'c-orphan-income', parent_id: 'p-income', name: 'Bonus', default_limit: 500, interval: 'monthly', budget_type: 'income', is_essential: true },
  { id: 'c-orphan-savings', parent_id: 'p-savings', name: 'Sparen', default_limit: 300, interval: 'monthly', budget_type: 'savings', is_essential: true },
]

describe('computeYearlyMustExpenses', () => {
  it('telt alléén essential children als die bestaan (Wonen: 2 essential + 1 non-essential)', () => {
    const wonenParent = [ESSENTIAL_PARENTS[0]]
    const wonenChildren = ALL_CHILDREN.filter(c => c.parent_id === 'p-wonen')
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(wonenParent, wonenChildren)

    // Huur 900 + Energie 150 = 1050/mnd, Decoratie (non-essential) genegeerd → 1050*12
    expect(yearlyMustExpenses).toBe(12600)
    expect(expenseItems).toHaveLength(1)
    expect(expenseItems[0].name).toBe('Wonen')
  })

  it('valt terug op alle children als de parent geen essential children heeft (Vervoer)', () => {
    const vervoerParent = [ESSENTIAL_PARENTS[1]]
    const vervoerChildren = ALL_CHILDREN.filter(c => c.parent_id === 'p-vervoer')
    const { yearlyMustExpenses } = computeYearlyMustExpenses(vervoerParent, vervoerChildren)

    // OV 120 + Auto 200 = 320/mnd * 12
    expect(yearlyMustExpenses).toBe(3840)
  })

  it('gebruikt het interval van het kind i.p.v. de parent bij exact 1 relevant kind (Verzekeringen)', () => {
    const verzekParent = [ESSENTIAL_PARENTS[2]]
    const verzekChildren = ALL_CHILDREN.filter(c => c.parent_id === 'p-verzek')
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(verzekParent, verzekChildren)

    // 1 essential child (Zorgverzekering, 130, monthly) i.p.v. parent-interval quarterly
    expect(yearlyMustExpenses).toBe(1560)
    expect(expenseItems[0].interval).toBe('monthly')
  })

  it('telt orphan essential children (essential kind van niet-essential parent) los mee', () => {
    // Isoleer de échte orphans (parent_id niet onder Wonen/Vervoer/Verzekeringen).
    // ALL_CHILDREN als geheel doorgeven zou hier ook Wonen/Verzekeringen's eigen
    // essential children (Huur, Energie, Zorgverzekering) als "orphan" meetellen,
    // want essentialParents=[] wist ook hún parent uit de essential-set — correct
    // functiegedrag (elke call is self-contained), maar niet wat dit geval test.
    const trueOrphans = ALL_CHILDREN.filter(c =>
      ['p-other', 'p-archive', 'p-income', 'p-savings'].includes(c.parent_id ?? ''),
    )
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses([], trueOrphans)

    // Alleen c-orphan (Kinderopvang, 400/mnd) kwalificeert; archive/income/savings uitgesloten
    expect(yearlyMustExpenses).toBe(4800)
    expect(expenseItems).toHaveLength(1)
    expect(expenseItems[0].name).toBe('Kinderopvang')
  })

  it('(gedocumenteerd randgeval) essentialParents=[] met ALL_CHILDREN telt óók de essential children van elders-essentiële parents mee als orphan', () => {
    // Pin dit gedrag expliciet vast: het is geen bug in computeYearlyMustExpenses,
    // maar een gevolg van self-contained calls (zie test hierboven). Zonder deze
    // pin zou een toekomstige "optimalisatie" die alsnog cross-call parent-context
    // onthoudt, stilletjes het orphan-gedrag kunnen veranderen.
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses([], ALL_CHILDREN)
    expect(yearlyMustExpenses).toBe(18960)
    expect(expenseItems).toHaveLength(4)
    expect(expenseItems.map(i => i.name).sort()).toEqual(
      ['Energie', 'Huur', 'Kinderopvang', 'Zorgverzekering'].sort(),
    )
  })

  it('sluit orphan essential children met budget_type archive/income/savings uit', () => {
    const excludedOrphans = ALL_CHILDREN.filter(c =>
      ['archive', 'income', 'savings'].includes(c.budget_type ?? ''),
    )
    expect(excludedOrphans).toHaveLength(3)

    const result = computeYearlyMustExpenses([], excludedOrphans)
    expect(result.expenseItems).toHaveLength(0)
    expect(result.yearlyMustExpenses).toBe(0)
  })

  // Regressieslot — Notion "Persoonlijk plan telt Inkomen + Sparen mee als
  // essentiële uitgave". Tak A had (anders dan tak B) geen budget_type-vangnet;
  // een call-site die vergat te filteren telde Inkomen/Sparen als must-expense.
  it('sluit essential PARENTS met budget_type archive/income/savings uit (tak A-vangnet)', () => {
    const parents: BudgetRow[] = [
      { id: 'p-inkomen', name: 'Inkomen', default_limit: 6500, interval: 'monthly', budget_type: 'income', is_essential: true },
      { id: 'p-sparen', name: 'Sparen & investeren', default_limit: 3000, interval: 'monthly', budget_type: 'savings', is_essential: true },
      { id: 'p-oud', name: 'Oud budget', default_limit: 100, interval: 'monthly', budget_type: 'archive', is_essential: true },
      { id: 'p-wonen', name: 'Vaste lasten wonen', default_limit: 455, interval: 'monthly', budget_type: 'expense', is_essential: true },
    ]
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(parents, [])

    // Alleen de expense-parent telt: 455 × 12 = 5460 (niet 6500+3000+100+455 × 12)
    expect(yearlyMustExpenses).toBe(5460)
    expect(expenseItems.map(i => i.name)).toEqual(['Vaste lasten wonen'])
  })

  it('telt children van een uitgesloten income/savings-parent evenmin mee (geen orphan-lek)', () => {
    const parents: BudgetRow[] = [
      { id: 'p-sparen', name: 'Sparen', default_limit: 3000, interval: 'monthly', budget_type: 'savings', is_essential: true },
    ]
    const children: ChildBudgetRow[] = [
      { id: 'c-spaar', parent_id: 'p-sparen', name: 'Beleggen', default_limit: 1000, interval: 'monthly', budget_type: 'savings', is_essential: true },
    ]
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(parents, children)
    expect(yearlyMustExpenses).toBe(0)
    expect(expenseItems).toHaveLength(0)
  })

  it('laat parents ZONDER budget_type ongemoeid (blocklist, geen allowlist)', () => {
    const parents: BudgetRow[] = [
      { id: 'p-geen-type', name: 'Zonder type', default_limit: 100, interval: 'monthly', is_essential: true },
    ]
    expect(computeYearlyMustExpenses(parents, []).yearlyMustExpenses).toBe(1200)
  })

  it('geeft 0 en lege expenseItems terug bij lege input', () => {
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses([], [])
    expect(yearlyMustExpenses).toBe(0)
    expect(expenseItems).toHaveLength(0)
  })

  it('telt parents + orphans correct op in de volledige combinatie', () => {
    const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(ESSENTIAL_PARENTS, ALL_CHILDREN)

    // Wonen 12600 + Vervoer 3840 + Verzekeringen 1560 + Kinderopvang 4800
    expect(yearlyMustExpenses).toBe(12600 + 3840 + 1560 + 4800)
    expect(expenseItems).toHaveLength(4)
    expect(Number.isFinite(yearlyMustExpenses)).toBe(true)
  })

  it('vermenigvuldigt monthly/quarterly/yearly intervallen correct (×12 / ×4 / ×1)', () => {
    const monthlyParent: BudgetRow[] = [
      { id: 'im', name: 'Maandelijks', default_limit: 100, interval: 'monthly', is_essential: true },
    ]
    const quarterlyParent: BudgetRow[] = [
      { id: 'iq', name: 'Kwartaal', default_limit: 100, interval: 'quarterly', is_essential: true },
    ]
    const yearlyParent: BudgetRow[] = [
      { id: 'iy', name: 'Jaarlijks', default_limit: 100, interval: 'yearly', is_essential: true },
    ]

    expect(computeYearlyMustExpenses(monthlyParent, []).yearlyMustExpenses).toBe(1200)
    expect(computeYearlyMustExpenses(quarterlyParent, []).yearlyMustExpenses).toBe(400)
    expect(computeYearlyMustExpenses(yearlyParent, []).yearlyMustExpenses).toBe(100)
  })

  it('vermenigvuldigt een quarterly parent zonder children ook correct (×4, gebruikt default_limit direct)', () => {
    const parent: BudgetRow[] = [
      { id: 'q1', name: 'Kwartaal uitgave', default_limit: 300, interval: 'quarterly', budget_type: 'expense', is_essential: true },
    ]
    const { yearlyMustExpenses } = computeYearlyMustExpenses(parent, [])
    expect(yearlyMustExpenses).toBe(1200)
  })

  // Randgeval — niet in de in-app suite: default_limit mag ook een string zijn
  // (het BudgetRow-type staat number | string toe; de functie doet Number() coercie).
  it('coerceert een string default_limit naar een getal (Number()-conversie)', () => {
    const parent: BudgetRow[] = [
      { id: 'str', name: 'String-limit', default_limit: '250', interval: 'monthly', is_essential: true },
    ]
    const { yearlyMustExpenses } = computeYearlyMustExpenses(parent, [])
    expect(yearlyMustExpenses).toBe(3000) // 250 * 12
  })

  // Randgeval — niet in de in-app suite: negatieve/0-limiet moet niet crashen
  // en telt gewoon mee als (mogelijk negatief) bedrag, geen speciale clamping.
  it('behandelt een negatieve of 0-limiet zonder te crashen (geen clamping)', () => {
    const zeroParent: BudgetRow[] = [
      { id: 'zero', name: 'Nul-limiet', default_limit: 0, interval: 'monthly', is_essential: true },
    ]
    const negativeParent: BudgetRow[] = [
      { id: 'neg', name: 'Negatieve limiet', default_limit: -50, interval: 'monthly', is_essential: true },
    ]
    expect(computeYearlyMustExpenses(zeroParent, []).yearlyMustExpenses).toBe(0)
    expect(computeYearlyMustExpenses(negativeParent, []).yearlyMustExpenses).toBe(-600)
  })
})

describe('computeRetirementExpenses — overige methodes en fallback-ketens', () => {
  it('essential_budgets: gebruikt yearlyMustExpenses', () => {
    expect(computeRetirementExpenses('essential_budgets', 24000, 60000)).toBe(24000)
  })

  it('custom_amount: gebruikt het opgegeven bedrag wanneer > 0', () => {
    expect(computeRetirementExpenses('custom_amount', 24000, 60000, 36000)).toBe(36000)
  })

  it('current_income: gebruikt yearlyIncome', () => {
    expect(computeRetirementExpenses('current_income', 24000, 60000)).toBe(60000)
  })

  it('null/undefined methode valt terug op essential_budgets-gedrag', () => {
    expect(computeRetirementExpenses(null, 24000, 60000)).toBe(24000)
    expect(computeRetirementExpenses(undefined, 24000, 60000)).toBe(24000)
  })

  it('custom_amount: fallback-keten bij 0/null → estimatedYearlyExpenses → yearlyMustExpenses', () => {
    // customAmount=0 → estimatedYearlyExpenses
    expect(computeRetirementExpenses('custom_amount', 24000, 60000, 0, 30000)).toBe(30000)
    // customAmount=null, geen estimated → yearlyMustExpenses
    expect(computeRetirementExpenses('custom_amount', 24000, 60000, null)).toBe(24000)
    // customAmount=null, mét estimated → estimated wint van must
    expect(computeRetirementExpenses('custom_amount', 24000, 60000, null, 28000)).toBe(28000)
  })

  it('current_income: fallback-keten bij 0 inkomen → estimatedYearlyExpenses → yearlyMustExpenses', () => {
    expect(computeRetirementExpenses('current_income', 24000, 0, null, 18000)).toBe(18000)
    expect(computeRetirementExpenses('current_income', 24000, 0)).toBe(24000)
  })

  it('essential_budgets: fallback bij 0 must-expenses → estimatedYearlyExpenses → 0', () => {
    expect(computeRetirementExpenses('essential_budgets', 0, 60000, null, 20000)).toBe(20000)
    expect(computeRetirementExpenses('essential_budgets', 0, 60000)).toBe(0)
  })
})
