import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_HOUSING_MODE,
  computeFreedomTicker,
  freedomTickerBasis,
  intakeDailyExpenseRate,
  type FreedomTickerAsset,
} from './freedom-ticker'
import { dailyExpenseRate } from './format'

/**
 * Persona WF-START-18 "Jan de Vries" — dezelfde figuur waarop de UAT-flow van
 * de onboarding staat: €3.000 netto in, €2.100 uit, drie bezittingen en één
 * studieschuld. De verwachte tellerwaarden per scherm staan hieronder
 * LETTERLIJK: dat is de assertie die weergave-drift zichtbaar maakt (verkeerd
 * veld, verkeerde grondslag, stale mapping) — niet "er staat een getal".
 */
const MONTHLY_INCOME = 3000
const MONTHLY_EXPENSES = 2100

const BETAALREKENING: FreedomTickerAsset = { value: 2500, isHome: false }
const SPAARGELD: FreedomTickerAsset = { value: 18000, isHome: false }
const BELEGGINGEN: FreedomTickerAsset = { value: 12000, isHome: false }
const EIGEN_HUIS: FreedomTickerAsset = { value: 400000, isHome: true }

function ticker(assets: FreedomTickerAsset[], debts = 0, basis = freedomTickerBasis(ONBOARDING_HOUSING_MODE)) {
  return computeFreedomTicker({
    monthlyIncome: MONTHLY_INCOME,
    monthlyExpenses: MONTHLY_EXPENSES,
    assets,
    debts,
    basis,
  })
}

describe('freedomTickerBasis — grondslag volgt de woonstrategie', () => {
  it('telt de woning alleen mee bij "volledig meetellen"', () => {
    expect(freedomTickerBasis('include_full')).toBe('net_worth')
  })

  it('laat de woning buiten de teller bij uitsluiten, verkopen en opeethypotheek', () => {
    expect(freedomTickerBasis('exclude_from_fire')).toBe('fire_pot_excl_home')
    expect(freedomTickerBasis('downsize')).toBe('fire_pot_excl_home')
    expect(freedomTickerBasis('reverse_mortgage')).toBe('fire_pot_excl_home')
  })

  it('de onboarding schrijft "verkopen wanneer nodig" weg en draait dus excl. woning', () => {
    // Spiegel van app/api/onboarding/save-own-data/route.ts. Wijzigt die
    // default, dan moet deze constante mee — anders toont de teller tijdens de
    // flow een andere grondslag dan het profiel dat er straks uit komt.
    expect(ONBOARDING_HOUSING_MODE).toBe('downsize')
    expect(freedomTickerBasis(ONBOARDING_HOUSING_MODE)).toBe('fire_pot_excl_home')
  })
})

describe('intakeDailyExpenseRate — canonieke conversie, geen eigen deling', () => {
  it('is exact dailyExpenseRate (×12/365), niet ÷30', () => {
    expect(intakeDailyExpenseRate(MONTHLY_EXPENSES)).toBe(dailyExpenseRate(MONTHLY_EXPENSES))
    expect(intakeDailyExpenseRate(MONTHLY_EXPENSES)).toBeCloseTo(69.041, 3)
    expect(intakeDailyExpenseRate(MONTHLY_EXPENSES)).not.toBeCloseTo(MONTHLY_EXPENSES / 30, 3)
  })
})

describe('computeFreedomTicker — persona WF-START-18, scherm voor scherm', () => {
  it('na de betaalrekening: 1 maand en 6 dagen', () => {
    const t = ticker([BETAALREKENING])
    expect(t?.breakdown).toMatchObject({ years: 0, months: 1, days: 6 })
    expect(t?.label).toBe('1m')
  })

  it('na het spaargeld: 9 maanden en 27 dagen', () => {
    const t = ticker([BETAALREKENING, SPAARGELD])
    expect(t?.breakdown).toMatchObject({ years: 0, months: 9, days: 27 })
    expect(t?.label).toBe('9m')
  })

  it('na de beleggingen: 1 jaar, 3 maanden en 16 dagen', () => {
    const t = ticker([BETAALREKENING, SPAARGELD, BELEGGINGEN])
    expect(t?.breakdown).toMatchObject({ years: 1, months: 3, days: 16 })
    expect(t?.label).toBe('1j 3m')
  })

  it('blijft door de hele schulden-sectie ONVERANDERD staan', () => {
    const assets = [BETAALREKENING, SPAARGELD, BELEGGINGEN]
    const zonderSchuld = ticker(assets)?.label
    // Studieschuld + een hypotheek erbij: op de intake-grondslag gaan schulden
    // niet van de teller af. Dit is de assertie achter "monotone teller".
    expect(ticker(assets, 9000)?.label).toBe(zonderSchuld)
    expect(ticker(assets, 9000 + 350000)?.label).toBe(zonderSchuld)
  })

  it('telt de eigen woning niet mee op de intake-grondslag', () => {
    const assets = [BETAALREKENING, SPAARGELD, BELEGGINGEN]
    expect(ticker([...assets, EIGEN_HUIS])?.label).toBe(ticker(assets)?.label)
  })

  it('telt de woning WEL mee (en trekt schulden af) op de netto-vermogen-grondslag', () => {
    const netWorth = ticker([BETAALREKENING, SPAARGELD, BELEGGINGEN, EIGEN_HUIS], 350000, 'net_worth')
    const firePot = ticker([BETAALREKENING, SPAARGELD, BELEGGINGEN, EIGEN_HUIS])
    expect(netWorth?.amount).toBe(2500 + 18000 + 12000 + 400000 - 350000)
    expect(firePot?.amount).toBe(2500 + 18000 + 12000)
    expect(netWorth?.label).not.toBe(firePot?.label)
  })
})

describe('computeFreedomTicker — monotonie-invariant', () => {
  /**
   * Dé test achter de klacht "het getal springt heen en weer". Over ELKE
   * invoervolgorde van bezittingen, met schulden die onderweg oplopen, mag de
   * teller op de intake-grondslag nooit dalen.
   */
  const posten: FreedomTickerAsset[] = [BETAALREKENING, SPAARGELD, BELEGGINGEN, EIGEN_HUIS]

  function permutaties<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items]
    return items.flatMap((item, i) =>
      permutaties([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
    )
  }

  it('daalt nooit, in geen enkele invoervolgorde', () => {
    for (const volgorde of permutaties(posten)) {
      let vorige = 0
      volgorde.forEach((_, i) => {
        // Schuld loopt mee op: elke stap €10.000 erbij.
        const huidig = ticker(volgorde.slice(0, i + 1), i * 10000)?.breakdown.totalDays ?? 0
        expect(huidig).toBeGreaterThanOrEqual(vorige)
        vorige = huidig
      })
    }
  })
})

describe('computeFreedomTicker — guards: liever niets dan een verzonnen getal', () => {
  it('geen inkomen ⇒ geen teller', () => {
    expect(computeFreedomTicker({
      monthlyIncome: 0,
      monthlyExpenses: MONTHLY_EXPENSES,
      assets: [SPAARGELD],
      basis: 'fire_pot_excl_home',
    })).toBeNull()
  })

  it('geen uitgaven ⇒ geen teller (en zeker geen "∞")', () => {
    expect(computeFreedomTicker({
      monthlyIncome: MONTHLY_INCOME,
      monthlyExpenses: 0,
      assets: [SPAARGELD],
      basis: 'fire_pot_excl_home',
    })).toBeNull()
  })

  it('nog geen bezittingen ⇒ geen teller', () => {
    expect(ticker([])).toBeNull()
  })

  it('alleen een eigen woning ⇒ geen teller op de intake-grondslag', () => {
    expect(ticker([EIGEN_HUIS])).toBeNull()
  })

  it('tekort (netto-vermogen-grondslag) ⇒ geen teller, geen negatief getal', () => {
    expect(ticker([BETAALREKENING], 50000, 'net_worth')).toBeNull()
  })

  it('negeert onzinwaarden in plaats van ze door te rekenen', () => {
    const met = ticker([BETAALREKENING, { value: Number.NaN, isHome: false }, { value: -500, isHome: false }])
    expect(met?.amount).toBe(2500)
  })
})
