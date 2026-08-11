import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { annualAmount, computeYearlyMustExpenses, computeRetirementExpenses, yearlyMustExpensesFromBudgets, type BudgetRow, type ChildBudgetRow, type FlatBudgetRow } from './budget-utils'
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

/**
 * `annualAmount` is de ENIGE toegestane jaarconversie van een budget-limiet:
 * monthly ×12, quarterly ×4, yearly ×1.
 *
 * De bug die dit slot vergrendelt: zes call-sites die `yearlyMustExpenses`
 * (→ `fireTarget` = yearlyMustExpenses / effectiveSwr) zelf uitrekenden deden
 * `interval === 'yearly' ? limit : limit * 12`. Daarmee telde een QUARTERLY
 * budget ×12 in plaats van ×4 — 3× te hoog, wat het FIRE-doel opblies en het
 * vrijheids-% verlaagde. De `budgets.interval`-kolom staat quarterly expliciet
 * toe (CHECK IN ('monthly','quarterly','yearly')), dus dit is bereikbaar
 * gebruikersgedrag, geen theoretisch geval.
 */
describe('annualAmount — de canonieke jaarconversie van een budget-limiet', () => {
  it('quarterly telt ×4 (€100/kwartaal = €400/jaar)', () => {
    expect(annualAmount(100, 'quarterly')).toBe(400)
  })

  it('monthly telt ×12 en yearly ×1', () => {
    expect(annualAmount(100, 'monthly')).toBe(1200)
    expect(annualAmount(100, 'yearly')).toBe(100)
  })

  it('een onbekend/ontbrekend interval telt als jaarbedrag (×1)', () => {
    // Gepind gedrag, geen toevalligheid: de DB-default is 'monthly' en de CHECK
    // laat alleen monthly/quarterly/yearly toe, dus dit pad is in de praktijk
    // onbereikbaar. Zou het ooit bereikbaar worden, dan is ×1 de conservatieve
    // (niet-opblazende) keuze én identiek aan wat computeYearlyMustExpenses en
    // /api/household/fire-projections al deden.
    expect(annualAmount(100, null)).toBe(100)
    expect(annualAmount(100, undefined)).toBe(100)
    expect(annualAmount(100, 'eenmalig')).toBe(100)
  })

  it('rekent lineair door op 0 en negatieve limieten (geen clamping)', () => {
    expect(annualAmount(0, 'quarterly')).toBe(0)
    expect(annualAmount(-50, 'quarterly')).toBe(-200)
  })
})

/**
 * `yearlyMustExpensesFromBudgets` — de canonieke rij-selectie voor call-sites
 * die één platte budgetlijst hebben. Delegeert naar computeYearlyMustExpenses;
 * deze tests pinnen het VERSCHIL met de parents-only-som die de zes call-sites
 * tot 11 aug 2026 hanteerden.
 */
describe('yearlyMustExpensesFromBudgets — canonieke rij-selectie uit één platte lijst', () => {
  const parentsOnly = (rows: FlatBudgetRow[]) =>
    rows
      .filter(b => b.is_essential && b.budget_type === 'expense' && (b.parent_id ?? null) === null)
      .reduce((s, b) => s + annualAmount(Number(b.default_limit) || 0, b.interval), 0)

  it('rolt essentiële children op i.p.v. de parent-limiet te tellen', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'p', parent_id: null, name: 'Wonen', default_limit: 1000, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c1', parent_id: 'p', name: 'Huur', default_limit: 700, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c2', parent_id: 'p', name: 'Deco', default_limit: 100, interval: 'monthly', budget_type: 'expense', is_essential: false },
    ]
    // Parents-only zou €12.000 tellen; de canonieke motor telt alleen het
    // essentiële kind: €8.400. Dít is de grondslagwijziging van de migratie.
    expect(parentsOnly(rows)).toBe(12000)
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(8400)
  })

  it('valt terug op de parent-limiet wanneer die geen children heeft', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'p', parent_id: null, default_limit: 250, interval: 'monthly', budget_type: 'expense', is_essential: true },
    ]
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(3000)
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(parentsOnly(rows))
  })

  it('telt een orphan (essentieel kind van een niet-essentiële parent) apart mee', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'p', parent_id: null, default_limit: 100, interval: 'monthly', budget_type: 'expense', is_essential: false },
      { id: 'c', parent_id: 'p', default_limit: 300, interval: 'monthly', budget_type: 'expense', is_essential: true },
    ]
    // Parents-only ziet hier NIETS (parent is niet essentieel); canoniek €3.600.
    expect(parentsOnly(rows)).toBe(0)
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(3600)
  })

  it('weert archive/income/savings-children uit beide takken', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'p', parent_id: null, default_limit: 500, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c-arch', parent_id: 'p', default_limit: 999, interval: 'monthly', budget_type: 'archive', is_essential: true },
      { id: 'p2', parent_id: null, default_limit: 0, interval: 'monthly', budget_type: 'savings', is_essential: true },
      { id: 'c-spaar', parent_id: 'p2', default_limit: 999, interval: 'monthly', budget_type: 'savings', is_essential: true },
    ]
    // Het archive-kind wordt vóórgefilterd, dus de parent valt terug op z'n
    // eigen limiet (€6.000); het savings-kind telt in geen enkele tak mee.
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(6000)
  })

  /**
   * GEPIND, NIET GEREPAREERD — asymmetrie in de canonieke motor.
   *
   * Tak A weert schuld-budgetten doordat de call-site op budget_type='expense'
   * filtert. Tak B (orphans) gebruikt alleen de blocklist
   * ['archive','income','savings'] — 'debt' zit daar NIET in. Een essentieel
   * schuld-KIND van een essentiële schuld-parent telt daardoor wél mee als
   * essentiële jaaruitgave, terwijl de parent zelf is uitgesloten.
   *
   * Dit is GEEN gedrag dat deze migratie introduceert: dashboard, /toekomst en
   * year-in-review consumeren computeYearlyMustExpenses al en tellen deze rijen
   * dus vandaag al mee. Op de live data gaat het om 16 rijen / €16.536 per jaar
   * verdeeld over 8 gebruikers. Repareren betekent de canonieke motor wijzigen
   * en daarmee het FIRE-doel op de hoofdoppervlakken — een eigenaar-besluit,
   * buiten de scope van deze migratiekaart. Deze test legt het gedrag vast
   * zodat een toekomstige wijziging bewust gebeurt en niet stil.
   */
  it('PINT: een essentieel schuld-kind telt via de orphan-tak wél mee (asymmetrie)', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'p-debt', parent_id: null, default_limit: 400, interval: 'monthly', budget_type: 'debt', is_essential: true },
      { id: 'c-debt', parent_id: 'p-debt', default_limit: 250, interval: 'monthly', budget_type: 'debt', is_essential: true },
    ]
    // De schuld-PARENT telt niet (allowlist expense); het schuld-KIND wel.
    expect(parentsOnly(rows)).toBe(0)
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(3000)
  })

  it('delegeert aantoonbaar naar computeYearlyMustExpenses (geen tweede implementatie)', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'p', parent_id: null, default_limit: 1000, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'c1', parent_id: 'p', default_limit: 700, interval: 'quarterly', budget_type: 'expense', is_essential: true },
      { id: 'orphan', parent_id: 'x', default_limit: 120, interval: 'yearly', budget_type: 'expense', is_essential: true },
    ]
    const direct = computeYearlyMustExpenses(
      rows.filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null) as BudgetRow[],
      rows.filter(b => b.parent_id !== null) as ChildBudgetRow[],
    ).yearlyMustExpenses
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(direct)
    expect(yearlyMustExpensesFromBudgets(rows)).toBe(2800 + 120)
  })

  it('is leeg-veilig en negeert een lege lijst', () => {
    expect(yearlyMustExpensesFromBudgets([])).toBe(0)
  })

  /**
   * BIJT-PROEF op de `Number(x) || 0`-guard. Alle zes gemigreerde call-sites
   * hadden die guard in hun eigen som; `computeYearlyMustExpenses` doet kaal
   * `Number(...)`. Zonder de guard in de wrapper zou één ontbrekend/onleesbaar
   * `default_limit` de hele jaarsom naar NaN trekken — precies het soort stille
   * gedragsverandering dat een "pure de-duplicatie" hoort te vermijden.
   */
  it('houdt null/undefined/onleesbare limieten op 0 in plaats van NaN', () => {
    const rows: FlatBudgetRow[] = [
      { id: 'ok', parent_id: null, default_limit: 100, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'nul', parent_id: null, default_limit: null, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'undef', parent_id: null, default_limit: undefined, interval: 'monthly', budget_type: 'expense', is_essential: true },
      { id: 'rommel', parent_id: null, default_limit: 'n.v.t.', interval: 'monthly', budget_type: 'expense', is_essential: true },
    ]
    const totaal = yearlyMustExpensesFromBudgets(rows)
    expect(Number.isNaN(totaal)).toBe(false)
    expect(totaal).toBe(1200)
  })
})

/**
 * Anti-drift-grendel — géén tweede jaarconversie buiten `annualAmount`.
 *
 * Deze zes bestanden bouwen `yearlyMustExpenses` op uit essentiële budgetten en
 * delen dat door de effectieve SWR tot een `fireTarget`; drie ervan SCHRIJVEN de
 * uitkomst als `freedom_percentage` naar de database. Ze consumeren daarom de
 * canonieke conversie in plaats van 'm te herhalen (CLAUDE.md "consume, don't
 * recompute"). Een copy-paste-terugkeer van de foutvorm maakt deze test rood.
 *
 * WAAROM TWEE PATRONEN (2026-08-11). De oorspronkelijke grendel matchte alleen
 * de letterlijke one-liner `interval === 'yearly' ? limit : limit * 12`. Daar
 * glipte de zustersom `yearlyMustExpensesHorizon` in app/api/report/route.ts
 * dwars doorheen: díe schreef dezelfde conversie als meerregelige if-keten, en
 * omdat het bestand elders (voor de eerste som) al `annualAmount` importeerde,
 * gaf de import-assertie bovendien een vals-groen dekkingssignaal. Het tweede,
 * vormvrije patroon vangt de klasse i.p.v. de exacte formulering: een tak op
 * `interval === '<waarde>'` die binnen dezelfde expressie met de
 * annualisatie-factor 12 of 4 vermenigvuldigt.
 *
 * Bewust NIET gematcht: de periode-schaling in app/api/report/route.ts
 * (`b.interval === 'yearly' ? limit * monthsInPeriod / 12 : …`). Die zet een
 * limiet om naar de RAPPORTPERIODE, niet naar een jaar, en voedt alleen de
 * budget-breakdown-weergave — geen yearlyMustExpenses, geen fireTarget. Ze
 * DEELT door 12/3 in plaats van te vermenigvuldigen, dus het patroon hieronder
 * laat haar met opzet ongemoeid.
 */
describe('anti-drift-grendel — call-sites consumeren annualAmount', () => {
  const CALL_SITE_FILES = [
    ['app', 'api', 'report', 'route.ts'],
    ['app', 'api', 'snapshots', 'route.ts'],
    ['app', 'api', 'snapshots', 'cron', 'route.ts'],
    ['app', 'api', 'snapshots', 'auto', 'route.ts'],
    ['app', 'api', 'household', 'fire-projections', 'route.ts'],
    ['lib', 'holdings-data-loader.ts'],
  ]

  it.each(CALL_SITE_FILES.map(parts => [parts.join('/'), parts] as const))(
    '%s bevat geen eigen jaarconversie meer',
    (_label, parts) => {
      const src = readFileSync(join(process.cwd(), ...parts), 'utf8')
      // 1. De letterlijke foutvorm: alles wat niet 'yearly' is ×12 → quarterly 3× te hoog.
      expect(src).not.toMatch(/interval === 'yearly'\s*\?\s*limit\s*:\s*limit \* 12/)
      // 2. Vormvrij: elke tak op een interval-waarde die ×12 of ×4 rekent.
      expect(src).not.toMatch(
        /interval\s*===\s*'(?:monthly|quarterly|yearly)'[\s\S]{0,200}?\*\s*(?:12|4)\b/,
      )
      // 3. Consumeert een canonieke bron uit lib/budget-utils.ts.
      expect(src).toMatch(/\b(?:annualAmount|yearlyMustExpensesFromBudgets)\b/)
    },
  )
})

/**
 * Anti-drift-grendel, laag 2 — de RIJ-SELECTIE, niet alleen de formule.
 *
 * Zes call-sites telden `yearlyMustExpenses` jarenlang als een som over ALLEEN
 * de parent-budgetten. Dezelfde formule als de canonieke motor, maar een andere
 * grondslag: geen parent/child-oprol en geen orphan-tak. Daardoor toonden het
 * PDF-rapport, de drie snapshot-schrijfpaden en het holdings-FIRE-deck een
 * ander FIRE-doel dan /toekomst, het dashboard en year-in-review — die
 * `computeYearlyMustExpenses` al consumeerden.
 *
 * De foutvorm hieronder is de parents-only-som: een filter op `parent_id`
 * gevolgd door een eigen `.reduce(`. Ze mag in deze bestanden niet terugkeren;
 * de rij-selectie hoort in `yearlyMustExpensesFromBudgets` te leven.
 */
describe('anti-drift-grendel — rij-selectie leeft in de motor, niet in de call-site', () => {
  const MUST_EXPENSE_CONSUMERS = [
    ['app', 'api', 'report', 'route.ts'],
    ['app', 'api', 'snapshots', 'route.ts'],
    ['app', 'api', 'snapshots', 'cron', 'route.ts'],
    ['app', 'api', 'snapshots', 'auto', 'route.ts'],
    ['lib', 'holdings-data-loader.ts'],
  ]

  it.each(MUST_EXPENSE_CONSUMERS.map(parts => [parts.join('/'), parts] as const))(
    '%s bouwt geen eigen parents-only must-som meer',
    (_label, parts) => {
      const src = readFileSync(join(process.cwd(), ...parts), 'utf8')
      // De foutvorm: is_essential-filter met een parent_id-clausule, gevolgd
      // door een eigen reduce — vormvrij, dus ook als meerregelige keten.
      expect(src).not.toMatch(/is_essential[\s\S]{0,160}?parent_id[\s\S]{0,160}?\.reduce\(/)
      expect(src).toMatch(/\byearlyMustExpensesFromBudgets\b/)
    },
  )
})

/**
 * Bijt-proef voor de gedeelde-budget-split in
 * app/api/household/fire-projections/route.ts. Die route deelt een `shared`
 * budget eerst op het eigen aandeel (`limit × shareFraction`) en converteert
 * daarna pas naar een jaarbedrag. Dat mag alleen omdat `annualAmount` LINEAIR
 * is: delen-vóór en delen-ná converteren geven hetzelfde bedrag. Zou er ooit
 * een clamp, floor of afronding in `annualAmount` komen, dan verschuift het
 * huishoud-aandeel stilletjes — deze test wordt dan rood.
 */
describe('annualAmount is lineair (grondslag onder de huishoud-split)', () => {
  it.each(['monthly', 'quarterly', 'yearly'] as const)(
    'delen vóór converteren == converteren vóór delen (%s)',
    interval => {
      for (const fraction of [0.5, 0.35, 0.65, 1]) {
        expect(annualAmount(1234.56 * fraction, interval)).toBeCloseTo(
          annualAmount(1234.56, interval) * fraction,
          10,
        )
      }
    },
  )
})
