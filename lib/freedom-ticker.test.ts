import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_HOUSING_MODE,
  computeFreedomTicker,
  computeMonthlyFreedomBuildup,
  freedomTickerBasis,
  intakeDailyExpenseRate,
  type FreedomTickerAsset,
} from './freedom-ticker'
import { dailyExpenseRate } from './format'
import { HOUSING_CHOICE_FALLBACK, housingChoiceToConfig } from './housing-choice'

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

  /**
   * Sinds ADR 0133 vraagt de onboarding de woonstrategie zélf uit, dus de
   * grondslag komt uit de KEUZE (`housingChoiceToConfig(keuze).mode`) en niet
   * meer uit een gespiegelde constante. Wat deze test vastlegt:
   *
   *   1. `ONBOARDING_HOUSING_MODE` is niet langer een tweede literal naast de
   *      bron, maar de terugval-keuze — voor wie de vraag nooit kreeg.
   *   2. Het GETAL verandert niet door de nieuwe vraag: beide antwoorden landen
   *      op dezelfde `fire_pot_excl_home`-grondslag, dus de teller kan tijdens
   *      de intake nog steeds niet dalen (de monotonie-invariant hieronder).
   */
  it('de terugval-mode is afgeleid van de woning-keuze, niet apart gespiegeld', () => {
    expect(ONBOARDING_HOUSING_MODE).toBe(housingChoiceToConfig(HOUSING_CHOICE_FALLBACK).mode)
    expect(freedomTickerBasis(ONBOARDING_HOUSING_MODE)).toBe('fire_pot_excl_home')
  })

  it('beide antwoorden op de woning-vraag geven dezelfde tellergrondslag', () => {
    for (const choice of ['sell', 'exclude'] as const) {
      expect(freedomTickerBasis(housingChoiceToConfig(choice).mode)).toBe('fire_pot_excl_home')
    }
    // Zelfde invoer, ander antwoord → hetzelfde getal. Dit is de belofte van de
    // nieuwe vraag: hij verandert wát de app straks doorrekent, niet wat de
    // gebruiker tijdens het invullen ziet.
    const bezittingen = [BETAALREKENING, SPAARGELD, EIGEN_HUIS]
    const verkoopt = ticker(bezittingen, 0, freedomTickerBasis(housingChoiceToConfig('sell').mode))
    const teltNietMee = ticker(
      bezittingen,
      0,
      freedomTickerBasis(housingChoiceToConfig('exclude').mode),
    )
    expect(verkoopt?.label).toBe(teltNietMee?.label)
    expect(verkoopt?.amount).toBe(teltNietMee?.amount)
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

/**
 * De OPBOUW-variant (UR3-05). Bestaat omdat `computeFreedomTicker` een VERMOGEN
 * deelt en dus null geeft voor wie geen bezittingen invulde — precies de
 * gebruiker die anders zonder één tijdgetal de onboarding verlaat.
 */
describe('computeMonthlyFreedomBuildup', () => {
  it('vertaalt een maandoverschot naar hele dagen vrijheid op het intake-dagtarief', () => {
    // Cohort 25-35: €3.075 inkomen, €2.800 uitgaven → €92,05/dag; overschot
    // €275 = 2,99 dagen. `calculateFreedomTime` levert `totalDays` op één
    // decimaal (3,0), waarvan we hele dagen nemen → 3 per maand.
    const uit = computeMonthlyFreedomBuildup(3075, 2800)
    expect(uit).not.toBeNull()
    expect(uit!.monthlySurplus).toBe(275)
    expect(uit!.dailyRate).toBeCloseTo((2800 * 12) / 365, 6)
    expect(uit!.daysPerMonth).toBe(3)
  })

  it('werkt ZONDER bezittingen — dat is de hele reden dat hij bestaat', () => {
    // Geen enkele asset in het spel: de teller zou hier null geven.
    expect(computeFreedomTicker({
      monthlyIncome: 3075,
      monthlyExpenses: 2800,
      assets: [],
      basis: 'fire_pot_excl_home',
    })).toBeNull()
    expect(computeMonthlyFreedomBuildup(3075, 2800)).not.toBeNull()
  })

  it('geeft null bij een tekort of precies quitte — je bouwt dan geen vrijheid op', () => {
    expect(computeMonthlyFreedomBuildup(2000, 2500)).toBeNull()
    expect(computeMonthlyFreedomBuildup(2500, 2500)).toBeNull()
  })

  it('geeft null zonder inkomen of zonder uitgaven (het "Later invullen"-pad)', () => {
    expect(computeMonthlyFreedomBuildup(0, 2500)).toBeNull()
    expect(computeMonthlyFreedomBuildup(3000, 0)).toBeNull()
  })

  it('geeft null onder één hele dag per maand — "0 dagen" is geen aanmoediging', () => {
    // Overschot €10 op €3.000/mnd uitgaven (€98,63/dag) = 0,1 dag.
    expect(computeMonthlyFreedomBuildup(3010, 3000)).toBeNull()
  })
})
