import { describe, it, expect } from 'vitest'
import { resolveEffectiveIncomeExpenses, resolveAmountWithBasis, judgementBasis } from './effective-financials'

/**
 * De vijf onderstaande gevallen zijn de REGRESSIEBORG van ADR 0103: een
 * aanroeper die géén `budget`-argument meegeeft moet exact de getallen van vóór
 * dat besluit krijgen. Alleen de assertie is uitgebreid met de twee nieuwe
 * returnvelden (`incomeBasis`/`expensesBasis`); de bedragen zijn ongewijzigd.
 */
describe('resolveEffectiveIncomeExpenses', () => {
  it('auto: transacties winnen wanneer > 0', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 3000, estimated_monthly_expenses: 2000, income_source: 'auto', expenses_source: 'auto' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 4000, expenses: 2500, incomeBasis: 'transaction', expensesBasis: 'transaction' })
  })

  it('auto: profiel-fallback wanneer geen transacties', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 3000, estimated_monthly_expenses: 2000, income_source: 'auto', expenses_source: 'auto' },
      0, 0,
    )
    expect(r).toEqual({ income: 3000, expenses: 2000, incomeBasis: 'profile', expensesBasis: 'profile' })
  })

  it('manual: handmatig wint ook met transacties', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 5000, estimated_monthly_expenses: 1500, income_source: 'manual', expenses_source: 'manual' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 5000, expenses: 1500, incomeBasis: 'manual', expensesBasis: 'manual' })
  })

  it('gemengd: inkomen manual, uitgaven auto', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 5000, estimated_monthly_expenses: 1500, income_source: 'manual', expenses_source: 'auto' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 5000, expenses: 2500, incomeBasis: 'manual', expensesBasis: 'transaction' })
  })

  // WF-TOEK-10-bug1: de wat-als-baseline in horizon-client.tsx::loadData() zakte
  // naar een partiële lopende-maand-transactiesom (~€950) omdat de eigen inline
  // fallback de income_source-'manual'-override negeerde. Nu geconsumeerd → de
  // handmatige baseline (€7600) wint, ongeacht een gedeeltelijk geboekte maand.
  it('manual: partiële lopende-maand-transactiesom overschrijft handmatige baseline NIET (WF-TOEK-10-bug1)', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 7600, estimated_monthly_expenses: 3200, income_source: 'manual', expenses_source: 'manual' },
      950, 400,
    )
    expect(r).toEqual({ income: 7600, expenses: 3200, incomeBasis: 'manual', expensesBasis: 'manual' })
  })

  it('REGRESSIE: zonder budget-argument is het resultaat identiek MET een budget van 0', () => {
    const profile = {
      net_monthly_income: 3000,
      estimated_monthly_expenses: 2000,
      income_source: 'auto',
      expenses_source: 'auto',
    }
    const zonder = resolveEffectiveIncomeExpenses(profile, 4000, 2500)
    const met = resolveEffectiveIncomeExpenses(profile, 4000, 2500, { income: 0, expenses: null })
    expect(met).toEqual(zonder)
  })
})

describe('resolveEffectiveIncomeExpenses — budgetgrondslag (ADR 0103)', () => {
  const profile = {
    net_monthly_income: 3000,
    estimated_monthly_expenses: 2000,
    income_source: 'auto',
    expenses_source: 'auto',
  }

  it('auto: budgetten winnen over transacties zodra ze er zijn', () => {
    const r = resolveEffectiveIncomeExpenses(profile, 4000, 2500, { income: 5200, expenses: 1800 })
    expect(r).toEqual({ income: 5200, expenses: 1800, incomeBasis: 'budget', expensesBasis: 'budget' })
  })

  it('auto: een LEGE budgetgrondslag (alles uitgesloten) valt terug op transacties', () => {
    const r = resolveEffectiveIncomeExpenses(profile, 4000, 2500, { income: 0, expenses: 0 })
    expect(r.incomeBasis).toBe('transaction')
    expect(r.income).toBe(4000)
  })

  it("expliciet 'transaction' laat zich NIET door budgetten wegduwen", () => {
    const r = resolveEffectiveIncomeExpenses(
      { ...profile, income_source: 'transaction', expenses_source: 'transaction' },
      4000, 2500,
      { income: 5200, expenses: 1800 },
    )
    expect(r).toEqual({ income: 4000, expenses: 2500, incomeBasis: 'transaction', expensesBasis: 'transaction' })
  })

  it("expliciet 'budget' zonder bruikbare budgetten valt terug op transacties, dan op het profiel", () => {
    const bron = { ...profile, income_source: 'budget', expenses_source: 'budget' }
    expect(resolveEffectiveIncomeExpenses(bron, 4000, 2500, { income: 0, expenses: 0 })).toEqual({
      income: 4000, expenses: 2500, incomeBasis: 'transaction', expensesBasis: 'transaction',
    })
    expect(resolveEffectiveIncomeExpenses(bron, 0, 0, { income: 0, expenses: 0 })).toEqual({
      income: 3000, expenses: 2000, incomeBasis: 'profile', expensesBasis: 'profile',
    })
  })

  it("'manual' wint over budgetten én transacties", () => {
    const r = resolveEffectiveIncomeExpenses(
      { ...profile, income_source: 'manual', expenses_source: 'manual' },
      4000, 2500,
      { income: 5200, expenses: 1800 },
    )
    expect(r).toEqual({ income: 3000, expenses: 2000, incomeBasis: 'manual', expensesBasis: 'manual' })
  })

  it('de twee kanten zijn onafhankelijk: budget-inkomen naast handmatige uitgaven', () => {
    const r = resolveEffectiveIncomeExpenses(
      { ...profile, income_source: 'budget', expenses_source: 'manual' },
      4000, 2500,
      { income: 5200, expenses: 1800 },
    )
    expect(r).toEqual({ income: 5200, expenses: 2000, incomeBasis: 'budget', expensesBasis: 'manual' })
  })
})

describe('resolveAmountWithBasis — precedentie, schaalvrij', () => {
  it("de uitkomst is NOOIT 'auto' — dat is een strategie, geen grondslag", () => {
    for (const source of ['auto', 'budget', 'transaction', 'manual', 'estimate', '', null, undefined, 'rommel']) {
      const r = resolveAmountWithBasis(source, 100, 200, 300)
      expect(['budget', 'transaction', 'manual', 'profile', 'estimate', 'unknown']).toContain(r.basis)
    }
  })

  it('onbekende/lege bronwaarde gedraagt zich als auto', () => {
    expect(resolveAmountWithBasis('rommel', 100, 200, 300)).toEqual({ amount: 300, basis: 'budget' })
    expect(resolveAmountWithBasis(null, 100, 200, 0)).toEqual({ amount: 200, basis: 'transaction' })
    expect(resolveAmountWithBasis(undefined, 100, 0, 0)).toEqual({ amount: 100, basis: 'profile' })
  })

  it("'manual' met een bedrag van 0 blijft 'manual' (de gebruiker koos dat)", () => {
    expect(resolveAmountWithBasis('manual', 0, 4000, 5000)).toEqual({ amount: 0, basis: 'manual' })
  })

  it('negatieve of niet-eindige budgetwaarden worden genegeerd', () => {
    expect(resolveAmountWithBasis('auto', 100, 200, -50).basis).toBe('transaction')
    expect(resolveAmountWithBasis('auto', 100, 200, Number.NaN).basis).toBe('transaction')
  })

  it('schaalvrij: dezelfde precedentie op jaarbedragen', () => {
    const maand = resolveAmountWithBasis('auto', 3000, 4000, 5200)
    const jaar = resolveAmountWithBasis('auto', 36000, 48000, 62400)
    expect(jaar.basis).toBe(maand.basis)
    expect(jaar.amount).toBe(maand.amount * 12)
  })
})

describe('resolveAmountWithBasis — onbekend is geen nul (ADR 0131, UR3-01)', () => {
  // Given: "Later invullen" in de onboarding → net_monthly_income staat op de
  //   DB-default 0, income_source is leeg, er zijn geen budgetten en geen
  //   transacties.
  // When: de grondslag wordt bepaald.
  // Then: de grondslag is 'unknown' — niet 'profile' met een nul die elke
  //   consument als meting leest. De invariant: unknown ⇒ amount 0.
  it("profiel-terugval zonder profielbedrag → 'unknown' met bedrag 0", () => {
    for (const source of ['auto', null, undefined, '', 'budget', 'transaction', 'estimate']) {
      const r = resolveAmountWithBasis(source, 0, 0, 0)
      expect(r).toEqual({ amount: 0, basis: 'unknown' })
    }
  })

  it('een niet-eindig of negatief profielbedrag is óók onbekend', () => {
    expect(resolveAmountWithBasis('auto', Number.NaN, 0, null).basis).toBe('unknown')
    expect(resolveAmountWithBasis('auto', -10, 0, null).basis).toBe('unknown')
  })

  it("'manual' met 0 blijft 'manual' — de gebruiker koos die nul (geverifieerde nul)", () => {
    expect(resolveAmountWithBasis('manual', 0, 0, 0)).toEqual({ amount: 0, basis: 'manual' })
  })

  it("een profielbedrag > 0 zonder bron blijft 'profile' — gedrag ongewijzigd (AC4)", () => {
    expect(resolveAmountWithBasis(null, 3000, 0, 0)).toEqual({ amount: 3000, basis: 'profile' })
  })

  it('echte data verdringt de onbekendheid: transacties of budgetten winnen gewoon', () => {
    expect(resolveAmountWithBasis('auto', 0, 4000, 0)).toEqual({ amount: 4000, basis: 'transaction' })
    expect(resolveAmountWithBasis('auto', 0, 0, 5200)).toEqual({ amount: 5200, basis: 'budget' })
  })

  it('resolveEffectiveIncomeExpenses geeft de onbekendheid per kant door', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 0, estimated_monthly_expenses: null, income_source: null, expenses_source: null },
      0, 0,
    )
    expect(r).toEqual({ income: 0, expenses: 0, incomeBasis: 'unknown', expensesBasis: 'unknown' })
  })
})

describe("resolveAmountWithBasis — 'estimate' is een placeholder, geen keuze (ADR 0131, UR3-05)", () => {
  it("wint het profiel, dan heet de grondslag 'estimate' (label reist mee)", () => {
    expect(resolveAmountWithBasis('estimate', 3075, 0, 0)).toEqual({ amount: 3075, basis: 'estimate' })
  })

  it("gedraagt zich verder als 'auto': budget en transacties verdringen de gok", () => {
    expect(resolveAmountWithBasis('estimate', 3075, 0, 5200)).toEqual({ amount: 5200, basis: 'budget' })
    expect(resolveAmountWithBasis('estimate', 3075, 4000, 0)).toEqual({ amount: 4000, basis: 'transaction' })
  })

  it("'manual' wint over alles — dat is het verschil tussen een keuze en een placeholder", () => {
    expect(resolveAmountWithBasis('manual', 2500, 4000, 5200)).toEqual({ amount: 2500, basis: 'manual' })
  })
})

describe('judgementBasis — een lege lopende maand maakt een transactiegebruiker niet onbekend', () => {
  it("'unknown' met een 6-maands meting > 0 → 'transaction'", () => {
    expect(judgementBasis('unknown', 24_000)).toBe('transaction')
  })

  it("'unknown' zonder meting blijft 'unknown'", () => {
    expect(judgementBasis('unknown', 0)).toBe('unknown')
    expect(judgementBasis('unknown', Number.NaN)).toBe('unknown')
  })

  it('een bekende grondslag wordt nooit overschreven', () => {
    expect(judgementBasis('manual', 24_000)).toBe('manual')
    expect(judgementBasis('profile', 0)).toBe('profile')
  })
})
