import { describe, it, expect } from 'vitest'
import {
  BUDGETDISCIPLINE_GRONDSLAG_BREUK,
  detectGrondslagBreuk,
  deriveHealthVerloop,
  detectEngineBronTransition,
  detectScoreVersionTransition,
  formatTransitionDate,
  healthScoreSinceLastMonth,
  verloopMetNu,
  vorigeMaandStand,
  type HealthVerloopPunt,
} from './health-verloop'
import { computeHealthScoreFromInputs, HEALTH_SCORE_VERSION, type HealthScoreInput } from '@/lib/financial-health'
import { computeFreedomPctForPlan, type FreedomProgressBasisInput } from '@/lib/core-metrics'

const NOW = new Date(2026, 8, 26, 12, 0, 0) // 26 sep 2026, lokale tijd

function punt(snapshot_date: string, resilience_score: number | null, score_version: number | null = HEALTH_SCORE_VERSION): HealthVerloopPunt {
  return { snapshot_date, resilience_score, score_version, fire_age: null, engine_bron: null }
}

describe('deriveHealthVerloop', () => {
  it('Given rauwe maandstanden met numeric-strings, When afgeleid, Then getallen of null en geen bedragen', () => {
    const [p] = deriveHealthVerloop([
      { snapshot_date: '2026-08-31', resilience_score: '61', score_version: 2, fire_age: '52.4', engine_bron: 'kernel' },
    ])
    expect(p).toEqual({ snapshot_date: '2026-08-31', resilience_score: 61, score_version: 2, fire_age: 52.4, engine_bron: 'kernel' })
    expect(p).not.toHaveProperty('net_worth')
  })

  it('Given ontbrekende kolommen, When afgeleid, Then null', () => {
    expect(deriveHealthVerloop([{ snapshot_date: '2026-08-31' }])[0]).toEqual({
      snapshot_date: '2026-08-31', resilience_score: null, score_version: null, fire_age: null, engine_bron: null,
    })
  })
})

describe('detectScoreVersionTransition', () => {
  it('Given één versie, Then null', () => {
    expect(detectScoreVersionTransition([punt('2026-05-31', 50), punt('2026-06-30', 52)])).toBeNull()
  })

  it('Given een wisseling 1 → 2, Then de datum van het eerste punt in de nieuwe versie', () => {
    expect(
      detectScoreVersionTransition([punt('2026-05-31', 50, 1), punt('2026-06-30', 58, 2), punt('2026-07-31', 59, 2)]),
    ).toBe('2026-06-30')
  })

  it('Given punten zonder score of versie tussendoor, Then die tellen niet mee', () => {
    expect(
      detectScoreVersionTransition([punt('2026-05-31', 50, 1), punt('2026-06-30', null, 2), punt('2026-07-31', 59, null), punt('2026-08-31', 60, 1)]),
    ).toBeNull()
  })

  it('Given een reeks zonder versies (oudere select), Then null', () => {
    expect(detectScoreVersionTransition([punt('2026-05-31', 50, null), punt('2026-06-30', 58, null)])).toBeNull()
  })
})

describe('detectEngineBronTransition (V15)', () => {
  const snap = (snapshot_date: string, engine_bron: string | null) => ({ snapshot_date, engine_bron })

  it('geen overgang (één rekenwijze) → null', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', 'v2'), snap('2026-06-01', 'v2')])).toBeNull()
    expect(detectEngineBronTransition([snap('2026-05-01', 'kernel'), snap('2026-06-01', 'kernel')])).toBeNull()
  })

  it('null → kernel = overgang → de datum van het kernel-punt (null telt als v2)', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', null), snap('2026-06-01', 'kernel')])).toBe('2026-06-01')
  })

  it('kernel → v2 = ook een overgang → de datum van het v2-punt', () => {
    expect(detectEngineBronTransition([snap('2026-05-01', 'kernel'), snap('2026-06-01', 'v2')])).toBe('2026-06-01')
  })

  it('alles-null (allemaal v2) → null', () => {
    expect(
      detectEngineBronTransition([snap('2026-05-01', null), snap('2026-06-01', null), snap('2026-07-01', null)]),
    ).toBeNull()
  })
})

describe('formatTransitionDate', () => {
  it('maakt van een YYYY-MM-DD een korte NL-maand met jaar, zonder tijdzone', () => {
    expect(formatTransitionDate('2026-07-01')).toBe('jul 2026')
    expect(formatTransitionDate('2026-01-31')).toBe('jan 2026')
  })

  it('laat een onleesbare datum ongemoeid', () => {
    expect(formatTransitionDate('onbekend')).toBe('onbekend')
  })
})

describe('detectGrondslagBreuk — de telling van de budgetdiscipline veranderde op 30 aug 2026', () => {
  it('Given de constante, Then is het de datum van het eigenaarsbesluit', () => {
    expect(BUDGETDISCIPLINE_GRONDSLAG_BREUK).toBe('2026-08-30')
  })

  it('Given scores vóór én op/na de breuk, When gedetecteerd, Then de breukdatum', () => {
    expect(detectGrondslagBreuk([punt('2026-07-31', 58), punt('2026-08-29', 60), punt('2026-09-26', 61)])).toBe('2026-08-30')
    expect(detectGrondslagBreuk([punt('2026-08-29', 60), punt('2026-08-30', 61)])).toBe('2026-08-30')
  })

  it('Given alleen scores na de breuk, Then null', () => {
    expect(detectGrondslagBreuk([punt('2026-08-31', 60), punt('2026-09-26', 61)])).toBeNull()
  })

  it('Given alleen scores vóór de breuk, Then null', () => {
    expect(detectGrondslagBreuk([punt('2026-06-30', 60), punt('2026-07-31', 61)])).toBeNull()
  })

  it('Given punten zonder score aan één kant, Then telt die kant niet', () => {
    expect(detectGrondslagBreuk([punt('2026-07-31', null), punt('2026-09-26', 61)])).toBeNull()
  })
})

// ── "Sinds vorige maand": dezelfde canonieke berekening op vorige-maand-invoer ──
//
// Eindreview R1 (27 sep 2026): de vorige versie legde het live getal naast de
// OPGESLAGEN score van vorige maand. Die is door de writers anders berekend
// (vrijheidspijler als kapitaalratio + scalar-leeftijd, geen stop-anker), dus
// onder een vast anker ±9–13 punten verschil per maand zonder dat er iets
// veranderde. Nu rekent de delta de vorige maand met DEZELFDE functie op
// vorige-maand-invoer (net_worth en savings_rate uit de maandstand = data).

const BASIS: FreedomProgressBasisInput = {
  homeExcludedFromFire: false,
  netWorthInclHome: 250_000,
  fireEligibleNetWorth: 180_000,
  requiredNetWorthInclHome: 1_000_000,
  requiredPortfolioExclHome: 900_000,
}

function liveInput(over: Partial<HealthScoreInput> = {}, basis: FreedomProgressBasisInput = BASIS): HealthScoreInput {
  return {
    effectiveSavingsRatePct: 22,
    totalAssets: 300_000,
    totalDebts: 50_000,
    emergencyFundMonths: 5,
    emergencyTargetMonths: 3,
    freedomPct: computeFreedomPctForPlan({ anchorFixed: false, coverage: null, basis }),
    currentAge: 42,
    fireAgeFractional: 58.4,
    fireStopAnchor: 'solved',
    netMonthlyIncome: 4000,
    debtMonthlyPayments: 400,
    largestAssetTypeShare: 0.4,
    budgetCategories: [{ limit: 500, spent: 400 }],
    incomeBasis: 'profile',
    expensesBasis: 'profile',
    ...over,
  } as HealthScoreInput
}

function args(
  input: HealthScoreInput,
  vorigeMaand: { netWorth: number; savingsRatePct: number | null } | null,
  basis: FreedomProgressBasisInput = BASIS,
) {
  return {
    health: computeHealthScoreFromInputs(input, true),
    input,
    budgetingActive: true,
    freedomBasis: basis,
    vorigeMaand,
  }
}

describe('healthScoreSinceLastMonth — pariteit met de live berekening', () => {
  it('Given solved en ongewijzigde invoer (vorige maand = nu), When vergeleken, Then 0 en dus geen mijlpaal', () => {
    expect(healthScoreSinceLastMonth(args(liveInput(), { netWorth: 250_000, savingsRatePct: 22 }))).toBe(0)
  })

  it('Given een vast anker met ±100% dekking en ongewijzigde invoer, When vergeleken, Then GEEN vergelijking — geen valse stijging', () => {
    // Live: dekking 100 op de fire_progress-pijler. Een vorige-maand-dekking vergt
    // een kernel-run die we niet hebben; een kapitaalratio is een andere grootheid.
    const input = liveInput({ freedomPct: 100, fireStopAnchor: 'age' })
    expect(healthScoreSinceLastMonth(args(input, { netWorth: 250_000, savingsRatePct: 22 }))).toBeNull()
  })

  it('Given een vast anker waarvan de dekking toevallig gelijk is aan de kapitaalratio, When vergeleken, Then toch geen vergelijking (het anker beslist, niet het toeval)', () => {
    const input = liveInput({ fireStopAnchor: 'age' })
    expect(healthScoreSinceLastMonth(args(input, { netWorth: 250_000, savingsRatePct: 22 }))).toBeNull()
  })

  it('Given een vast anker, When het vermogen wél veranderde, Then nog steeds geen vergelijking', () => {
    const input = liveInput({ freedomPct: 100, fireStopAnchor: 'aow' })
    expect(healthScoreSinceLastMonth(args(input, { netWorth: 150_000, savingsRatePct: 10 }))).toBeNull()
  })

  it('Given solved en een lager vermogen vorige maand, When vergeleken, Then een stijging uit dezelfde functie', () => {
    const delta = healthScoreSinceLastMonth(args(liveInput(), { netWorth: 50_000, savingsRatePct: 5 }))
    expect(delta).not.toBeNull()
    expect(delta as number).toBeGreaterThan(0)
  })

  it('Given de eigen woning buiten FIRE (excl.-grondslag), When de invoer ongewijzigd is, Then 0', () => {
    const basis = { ...BASIS, homeExcludedFromFire: true }
    expect(healthScoreSinceLastMonth(args(liveInput({}, basis), { netWorth: 250_000, savingsRatePct: 22 }, basis))).toBe(0)
  })

  it('Given een grondslag die de live freedomPct niet reproduceert, When vergeleken, Then geen vergelijking (appels met peren)', () => {
    const input = liveInput({ freedomPct: 77 })
    expect(healthScoreSinceLastMonth(args(input, { netWorth: 250_000, savingsRatePct: 22 }))).toBeNull()
  })

  it('Given geen stand vorige maand, Then geen vergelijking', () => {
    expect(healthScoreSinceLastMonth(args(liveInput(), null))).toBeNull()
  })

  it('Given een onbekend oordeel, Then geen vergelijking', () => {
    const input = liveInput({ incomeBasis: 'unknown', expensesBasis: 'unknown' })
    expect(healthScoreSinceLastMonth(args(input, { netWorth: 250_000, savingsRatePct: 22 }))).toBeNull()
  })

  it('Given een vorige maand zonder spaarquote, Then telt de huidige spaarquote (alleen het vermogen vergelijkt)', () => {
    expect(healthScoreSinceLastMonth(args(liveInput(), { netWorth: 250_000, savingsRatePct: null }))).toBe(0)
  })
})

describe('vorigeMaandStand — de stand van de vorige kalendermaand', () => {
  const rij = (snapshot_date: string, net_worth: number | string, savings_rate: number | null = 20) => ({
    snapshot_date,
    net_worth,
    savings_rate,
  })

  it('Given maandstanden, Then de stand van de vorige kalendermaand', () => {
    expect(vorigeMaandStand([rij('2026-07-31', 1), rij('2026-08-29', '2500.5', 18), rij('2026-09-26', 3)], NOW)).toEqual({
      netWorth: 2500.5,
      savingsRatePct: 18,
    })
  })

  it('Given geen stand in de vorige maand, Then null', () => {
    expect(vorigeMaandStand([rij('2026-07-31', 1), rij('2026-09-26', 3)], NOW)).toBeNull()
  })

  it('Given januari, Then december van het vorige jaar', () => {
    expect(vorigeMaandStand([rij('2026-12-30', 7, null)], new Date(2027, 0, 10, 12))).toEqual({
      netWorth: 7,
      savingsRatePct: null,
    })
  })
})

describe('verloopMetNu — de opgeslagen lijn stopt vóór de lopende maand; "nu" staat los', () => {
  it('Given een opgeslagen stand deze maand, When samengesteld, Then telt zijn score niet in de lijn (vrijheidsleeftijd blijft) en is "nu" het live getal van vandaag', () => {
    const verloop: HealthVerloopPunt[] = [
      punt('2026-08-29', 56),
      { snapshot_date: '2026-09-03', resilience_score: 69, score_version: 2, fire_age: 51.9, engine_bron: 'v2' },
    ]
    const { punten, nu } = verloopMetNu(verloop, { liveTotal: 56.4, now: NOW })
    expect(punten).toEqual([
      punt('2026-08-29', 56),
      { snapshot_date: '2026-09-03', resilience_score: null, score_version: 2, fire_age: 51.9, engine_bron: 'v2' },
    ])
    expect(nu).toEqual({ snapshot_date: '2026-09-26', score: 56 })
    // De invoer blijft onaangeroerd.
    expect(verloop[1].resilience_score).toBe(69)
  })

  it('Given geen stand deze maand, When samengesteld, Then de lijn ongewijzigd en "nu" apart', () => {
    const { punten, nu } = verloopMetNu([punt('2026-08-29', 56)], { liveTotal: 61, now: NOW })
    expect(punten).toEqual([punt('2026-08-29', 56)])
    expect(nu).toEqual({ snapshot_date: '2026-09-26', score: 61 })
  })
})
