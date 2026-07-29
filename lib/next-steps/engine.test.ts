import { describe, it, expect } from 'vitest'
import { computeNextSteps, NEXT_STEP_KEYS, type NextStepInput } from './engine'
import {
  VOLGENDE_STAP_SPAARQUOTE_MIN_PCT,
  VOLGENDE_STAP_VASTE_LASTEN_MAX_PCT,
} from '@/lib/constants'

/** Volledig ingerichte, gezonde gebruiker → geen enkele stap. */
function ingericht(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    hasBankConnection: true,
    transactionCount: 120,
    assetCount: 4,
    debtCount: 1,
    budgetCount: 8,
    goalCount: 2,
    hasDateOfBirth: true,
    netWorth: 180_000,
    emergencyMonthsCovered: 6,
    emergencyTargetMonths: 6,
    savingsRate6mPct: 32,
    monthlyIncome: 4_500,
    monthlyRecurringAmount: 1_200,
    budgetsOverLimit: 0,
    openActionCount: 0,
    freedomDaysOpen: 0,
    lifeEventCount: 3,
    fireCountdownYears: null,
    completions: new Map(),
    ...overrides,
  }
}

/** Lege, net begonnen gebruiker. */
function leeg(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return ingericht({
    hasBankConnection: false,
    transactionCount: 0,
    assetCount: 0,
    debtCount: 0,
    budgetCount: 0,
    goalCount: 0,
    hasDateOfBirth: false,
    netWorth: 0,
    emergencyMonthsCovered: 0,
    emergencyTargetMonths: 6,
    savingsRate6mPct: 0,
    monthlyIncome: 0,
    monthlyRecurringAmount: 0,
    lifeEventCount: 0,
    ...overrides,
  })
}

describe('computeNextSteps — fundament', () => {
  it('stelt de inrichtingsstappen voor bij een lege gebruiker', () => {
    const keys = computeNextSteps(leeg()).map(s => s.key)
    expect(keys).toEqual([
      'connect_bank_psd2',
      'import_transactions',
      'add_assets',
      'create_budgets',
      'set_goals',
      'set_dob',
    ])
  })

  it('markeert inrichtingsstappen als kind=fundament', () => {
    const steps = computeNextSteps(leeg())
    expect(steps.every(s => s.kind === 'fundament')).toBe(true)
  })

  it('vraagt pas om schulden bij een negatief vermogen', () => {
    expect(computeNextSteps(leeg({ netWorth: 0 })).map(s => s.key)).not.toContain('add_debts')
    expect(computeNextSteps(leeg({ netWorth: -2_500 })).map(s => s.key)).toContain('add_debts')
  })

  it('wijst elke stap naar een bestaande route (geen /will, /identity, /core/assets)', () => {
    const hrefs = [...computeNextSteps(leeg()), ...computeNextSteps(ingericht({
      emergencyMonthsCovered: 1, savingsRate6mPct: 4, budgetsOverLimit: 2,
      monthlyRecurringAmount: 4_000, openActionCount: 3, freedomDaysOpen: 12,
      lifeEventCount: 0, fireCountdownYears: 11,
    }))].map(s => s.href)
    for (const href of hrefs) {
      expect(href.startsWith('/')).toBe(true)
      expect(href).not.toMatch(/^\/will\b/)
      expect(href).not.toMatch(/^\/identity\b/)
      expect(href).not.toBe('/core/assets')
      expect(href).not.toBe('/core/debts')
      expect(href).not.toBe('/core/budgets')
    }
  })

  it('geeft elke stap een kort label, losstaand van de volzin-titel', () => {
    for (const step of computeNextSteps(leeg())) {
      expect(step.label.length).toBeGreaterThan(0)
      expect(step.label.length).toBeLessThanOrEqual(24)
      expect(step.label).not.toBe(step.title)
    }
  })
})

describe('computeNextSteps — groei (post-onboarding)', () => {
  it('geeft een volledig ingerichte, gezonde gebruiker geen stappen', () => {
    expect(computeNextSteps(ingericht())).toEqual([])
  })

  it('stelt noodfonds aanvullen voor met de gemeten dekking uit de bundel', () => {
    const step = computeNextSteps(ingericht({ emergencyMonthsCovered: 1.8, emergencyTargetMonths: 6 }))
      .find(s => s.key === 'noodfonds_aanvullen')
    expect(step).toBeDefined()
    expect(step!.kind).toBe('groei')
    expect(step!.module).toBe('kern')
    expect(step!.metric).toBe('1,8 van 6 maanden gedekt')
  })

  it('nudget op spaarquote onder de drempel, niet erboven', () => {
    const onder = computeNextSteps(ingericht({ savingsRate6mPct: VOLGENDE_STAP_SPAARQUOTE_MIN_PCT - 1 }))
    const boven = computeNextSteps(ingericht({ savingsRate6mPct: VOLGENDE_STAP_SPAARQUOTE_MIN_PCT }))
    expect(onder.map(s => s.key)).toContain('spaarquote_verhogen')
    expect(boven.map(s => s.key)).not.toContain('spaarquote_verhogen')
    expect(onder.find(s => s.key === 'spaarquote_verhogen')!.metric).toBe('spaarquote 14%')
  })

  it('nudget op vaste lasten boven de drempel', () => {
    const income = 4_000
    const boven = computeNextSteps(ingericht({
      monthlyIncome: income,
      monthlyRecurringAmount: income * ((VOLGENDE_STAP_VASTE_LASTEN_MAX_PCT + 5) / 100),
    }))
    const step = boven.find(s => s.key === 'vaste_lasten_verlagen')
    expect(step).toBeDefined()
    expect(step!.metric).toBe('65% van je inkomen ligt vast')
  })

  it('meldt overschreden budgetten met het gemeten aantal', () => {
    expect(computeNextSteps(ingericht({ budgetsOverLimit: 1 })).find(s => s.key === 'budgetten_bijsturen')!.metric)
      .toBe('1 budget over de limiet')
    expect(computeNextSteps(ingericht({ budgetsOverLimit: 3 })).find(s => s.key === 'budgetten_bijsturen')!.metric)
      .toBe('3 budgetten over de limiet')
  })

  it('draagt de canonieke vrijheidsdagen van open acties als impact', () => {
    const step = computeNextSteps(ingericht({ openActionCount: 4, freedomDaysOpen: 18.4 }))
      .find(s => s.key === 'review_actions')
    expect(step).toBeDefined()
    expect(step!.module).toBe('wil')
    expect(step!.impact).toBe(18)
    expect(step!.metric).toBe('4 acties open')
  })

  it('verzint geen impact wanneer er geen canonieke bron is', () => {
    const steps = computeNextSteps(ingericht({
      emergencyMonthsCovered: 1, savingsRate6mPct: 2, budgetsOverLimit: 2, lifeEventCount: 0,
    }))
    expect(steps.length).toBeGreaterThan(0)
    expect(steps.every(s => s.impact === null)).toBe(true)
  })

  it('koppelt de FIRE-countdown uit de bundel aan de horizon-stap', () => {
    const step = computeNextSteps(ingericht({ fireCountdownYears: 12 }))
      .find(s => s.key === 'vrijheid_versnellen')
    expect(step).toBeDefined()
    expect(step!.module).toBe('horizon')
    expect(step!.metric).toBe('nog 12 jaar tot volledige vrijheid')
  })

  it('vraagt om gebeurtenissen zodra de geboortedatum bekend is en de tijdlijn leeg', () => {
    expect(computeNextSteps(ingericht({ lifeEventCount: 0 })).map(s => s.key)).toContain('plan_gebeurtenissen')
    expect(computeNextSteps(leeg()).map(s => s.key)).not.toContain('plan_gebeurtenissen')
  })
})

describe('computeNextSteps — volgorde en afhandeling', () => {
  it('zet fundament vóór groei', () => {
    const steps = computeNextSteps(leeg({ openActionCount: 2, freedomDaysOpen: 5 }))
    const laatsteFundament = steps.map(s => s.kind).lastIndexOf('fundament')
    const eersteGroei = steps.map(s => s.kind).indexOf('groei')
    expect(eersteGroei).toBeGreaterThan(laatsteFundament)
  })

  it('laat weggeklikte stappen weg en behoudt de rest', () => {
    const steps = computeNextSteps(leeg({
      completions: new Map([['connect_bank_psd2', true], ['add_assets', false]]),
    }))
    const keys = steps.map(s => s.key)
    expect(keys).not.toContain('connect_bank_psd2')
    expect(keys).toContain('add_assets')
    expect(steps.every(s => !s.dismissed)).toBe(true)
  })

  it('geeft alleen sleutels uit die in NEXT_STEP_KEYS staan (bron voor de complete-route)', () => {
    const uitgegeven = new Set([
      ...computeNextSteps(leeg({ netWorth: -1 })).map(s => s.key),
      ...computeNextSteps(ingericht({
        emergencyMonthsCovered: 1, savingsRate6mPct: 2, budgetsOverLimit: 1,
        monthlyRecurringAmount: 4_000, openActionCount: 1, freedomDaysOpen: 4,
        lifeEventCount: 0, fireCountdownYears: 9,
      })).map(s => s.key),
    ])
    for (const key of uitgegeven) expect(NEXT_STEP_KEYS).toContain(key)
    // Andersom: geen dode sleutel in de lijst die de motor nooit uitgeeft.
    expect([...NEXT_STEP_KEYS].sort()).toEqual([...uitgegeven].sort())
  })

  it('levert unieke keys', () => {
    const keys = computeNextSteps(leeg({ netWorth: -1, openActionCount: 1, freedomDaysOpen: 3 })).map(s => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
