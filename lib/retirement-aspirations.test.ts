import { describe, it, expect } from 'vitest'
import {
  computeAspirationTotal,
  DEFAULT_ASPIRATIONS,
  TRAVEL_TIERS,
  CAR_TIERS,
  CARE_TIERS,
  LIFESTYLE_MULTIPLIERS,
  NURSING_TOPUP_YEARLY,
  type AspirationAnswers,
} from './retirement-aspirations'

describe('computeAspirationTotal', () => {
  it('returns minimaal-scenario binnen verwachting', () => {
    const minimal: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      travel: 'home',
      car: 'none',
      diningPerMonth: 0,
      culturePerMonth: 0,
      diningPersons: 1,
      hobbies: [],
      customDreams: [],
      care: 'basic',
      nursingTopUp: false,
      unexpectedBuffer: false,
      lifestyle: 'comfort',
    }
    const r = computeAspirationTotal(minimal)
    // home tier = 1 week × 7 dagen × €45 × 1 = €315
    // car none = €600
    // dining 0 / culture 0 = 0
    // care basic = €1.800
    // base = 315 + 600 + 0 + 0 + 1800 = 2715
    expect(r.travel).toBe(315)
    expect(r.transport).toBe(600)
    expect(r.dining).toBe(0)
    expect(r.care).toBe(1800)
    expect(r.base).toBe(2715)
    expect(r.multiplier).toBe(1.0)
    expect(r.total).toBe(2700) // afgerond op €100
  })

  it('representatief comfort-scenario eindigt binnen Nibud-bandbreedte', () => {
    const comfort: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      travelersCount: 2,
      travel: 'eu', // 2 wk × 7d × €78 × 2 personen = €2.184
      car: 'mid', // €7.200
      diningPerMonth: 2,
      culturePerMonth: 1,
      diningPersons: 2,
      hobbies: [
        { id: 'sport', yearly: 1500 },
        { id: 'koken', yearly: 1500 },
      ], // 3000
      customDreams: [],
      care: 'comfort', // 2700
      nursingTopUp: false,
      unexpectedBuffer: false,
      lifestyle: 'comfort',
    }
    const r = computeAspirationTotal(comfort)
    // dining: (2*60 + 1*45) × 12 × 2 = (120+45)*24 = 3960
    expect(r.travel).toBe(2184)
    expect(r.transport).toBe(7200)
    expect(r.dining).toBe(3960)
    expect(r.hobbies).toBe(3000)
    expect(r.care).toBe(2700)
    expect(r.base).toBe(2184 + 7200 + 3960 + 3000 + 2700)
    expect(r.multiplier).toBe(1.0)
    // Comfort-stel zit typisch tussen 18k-25k/jr na Nibud-pensioenschijf
    expect(r.total).toBeGreaterThanOrEqual(18000)
    expect(r.total).toBeLessThanOrEqual(25000)
  })

  it('lifestyle multiplier en buffer worden gestapeld toegepast', () => {
    const a: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      travel: 'home',
      car: 'none',
      diningPerMonth: 0,
      culturePerMonth: 0,
      diningPersons: 1,
      hobbies: [],
      customDreams: [],
      care: 'basic',
      nursingTopUp: false,
      unexpectedBuffer: true, // +10%
      lifestyle: 'gul', // ×1.15
    }
    const r = computeAspirationTotal(a)
    // base = 315 + 600 + 1800 = 2715
    // total = 2715 × 1.15 × 1.10 = 3434.475 → afgerond op 100 = 3400
    expect(r.base).toBe(2715)
    expect(r.multiplier).toBe(1.15)
    expect(r.total).toBe(3400)
  })

  it('lean-scenario ligt onder comfort-equivalent', () => {
    const base: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      hobbies: [{ id: 'sport', yearly: 1500 }],
    }
    const lean = computeAspirationTotal({ ...base, lifestyle: 'lean' })
    const comfort = computeAspirationTotal({ ...base, lifestyle: 'comfort' })
    const gul = computeAspirationTotal({ ...base, lifestyle: 'gul' })
    expect(lean.total).toBeLessThan(comfort.total)
    expect(gul.total).toBeGreaterThan(comfort.total)
    // Lean ≈ 0.85 × comfort, dus ratio binnen 0.84-0.86 (afronding op 100 geeft jitter)
    expect(lean.total / comfort.total).toBeGreaterThan(0.83)
    expect(lean.total / comfort.total).toBeLessThan(0.87)
  })

  it('nursingTopUp voegt vaste reservering toe aan zorgbudget', () => {
    const base: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      travel: 'home',
      car: 'none',
      diningPerMonth: 0,
      culturePerMonth: 0,
      hobbies: [],
      lifestyle: 'comfort',
      nursingTopUp: false,
    }
    const without = computeAspirationTotal(base)
    const withTopup = computeAspirationTotal({ ...base, nursingTopUp: true })
    expect(withTopup.care - without.care).toBe(NURSING_TOPUP_YEARLY)
  })

  it('travelCustomWeeks override neemt voorrang op tier-default', () => {
    const a: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      travelersCount: 1,
      travel: 'eu', // tier-default = 2 weken @ €78/dag
      travelCustomWeeks: 4, // override
      car: 'none',
      diningPerMonth: 0,
      culturePerMonth: 0,
      hobbies: [],
      care: 'basic',
      lifestyle: 'comfort',
    }
    const r = computeAspirationTotal(a)
    // 4 wk × 7d × €78 × 1 = €2.184
    expect(r.travel).toBe(2184)
  })

  it('ronde naar dichtstbijzijnde €100 voor het eindbedrag', () => {
    const a: AspirationAnswers = {
      ...DEFAULT_ASPIRATIONS,
      travel: 'home',
      car: 'small',
      diningPerMonth: 1,
      culturePerMonth: 0,
      diningPersons: 1,
      hobbies: [],
      care: 'basic',
      lifestyle: 'comfort',
    }
    const r = computeAspirationTotal(a)
    expect(r.total % 100).toBe(0)
  })

  it('fallback naar default tier bij ongeldige id', () => {
    const a = {
      ...DEFAULT_ASPIRATIONS,
      // forceer een onbekende id (zou theoretisch nooit moeten via UI)
      travel: 'unknown' as never,
      car: 'unknown' as never,
      care: 'unknown' as never,
    }
    const r = computeAspirationTotal(a as AspirationAnswers)
    // Default tiers zijn TRAVEL_TIERS[1]='eu', CAR_TIERS[1]='small', CARE_TIERS[1]='comfort'
    expect(r.transport).toBe(CAR_TIERS[1].yearly)
    expect(r.care).toBe(CARE_TIERS[1].yearly)
    // Reizen is gebaseerd op default tier 'eu' = 2 wk × 7 × €78 × 1 = 1092
    expect(r.travel).toBe(TRAVEL_TIERS[1].weeks * 7 * TRAVEL_TIERS[1].dailyPp)
  })
})

describe('LIFESTYLE_MULTIPLIERS', () => {
  it('heeft lean < comfort < gul', () => {
    expect(LIFESTYLE_MULTIPLIERS.lean).toBeLessThan(LIFESTYLE_MULTIPLIERS.comfort)
    expect(LIFESTYLE_MULTIPLIERS.comfort).toBeLessThan(LIFESTYLE_MULTIPLIERS.gul)
  })
})
