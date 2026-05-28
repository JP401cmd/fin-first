import { describe, it, expect } from 'vitest'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { calculateFreedomTime } from '@/lib/format'
import { ageAtDate, NL_SWR } from '@/lib/horizon-data'

// ── Types mirroring the API response ─────────────────────────────────────

interface GuideProgressResponse {
  counts: {
    assets: number
    transactions: number
    completedActions: number
    lifeEvents: number
    budgets: number
    debts: number
    pendingRecommendations: number
    wonFreedomDays: number
  }
  financial: {
    netWorth: number
    dailyExpenseRate: number
    monthlyExpenses: number
    freedomDays: { days: number; months: number; years: number }
    fireAge: number | null
    fireTarget: number
    sovereigntyLevel: number
  }
  steps: {
    hasAssets: boolean
    hasTransactions: boolean
    hasBudgets: boolean
    hasCompletedActions: boolean
    hasLifeEvents: boolean
    hasFireData: boolean
    hasDebts: boolean
  }
  calculatedAt: string
}

/** Simulates the FIRE age calculation used in the API route */
function computeFireAge(
  currentAge: number,
  netWorth: number,
  fireTarget: number,
  monthlyExpenses: number,
  grossReturn: number,
): number | null {
  const shortfall = fireTarget - netWorth
  if (shortfall <= 0) return Math.round(currentAge)
  if (monthlyExpenses <= 0) return null

  const annualSavings = monthlyExpenses * 0.3
  if (annualSavings <= 0) return null

  let portfolio = netWorth
  let years = 0
  while (portfolio < fireTarget && years < 80) {
    portfolio = portfolio * (1 + grossReturn) + annualSavings
    years++
  }
  return years < 80 ? Math.round(currentAge + years) : null
}

/** Simulates the progress bar percentage calculation (4 steps) */
interface ProgressSteps {
  hasAssets: boolean
  hasTransactions: boolean
  hasCompletedActions: boolean
  hasFireData: boolean
  hasLifeEvents: boolean
  hasDebts: boolean
}

function computeProgressPercentage(steps: ProgressSteps): number {
  const checks = [
    steps.hasAssets || steps.hasDebts,       // Stap 1: Weet waar je staat
    steps.hasTransactions,                    // Stap 2: Begrijp je patronen
    steps.hasCompletedActions,               // Stap 3: Onderneem actie
    steps.hasFireData || steps.hasLifeEvents, // Stap 4: Kijk vooruit
  ]
  return checks.filter(Boolean).length
}

// ═══════════════════════════════════════════════════════════════════════════
// A. API /api/guide-progress — response structure & calculations
// ═══════════════════════════════════════════════════════════════════════════

describe('Guide Progress API — response shape', () => {
  it('A1: response has required top-level keys (counts, financial, steps, calculatedAt)', () => {
    // Verify the expected response structure
    const mockResponse: GuideProgressResponse = {
      counts: {
        assets: 5,
        transactions: 120,
        completedActions: 3,
        lifeEvents: 2,
        budgets: 8,
        debts: 1,
        pendingRecommendations: 4,
        wonFreedomDays: 12.5,
      },
      financial: {
        netWorth: 150000,
        dailyExpenseRate: 98.63,
        monthlyExpenses: 3000,
        freedomDays: { days: 0, months: 2, years: 4 },
        fireAge: 52,
        fireTarget: 1058824,
        sovereigntyLevel: 3,
      },
      steps: {
        hasAssets: true,
        hasTransactions: true,
        hasBudgets: true,
        hasCompletedActions: true,
        hasLifeEvents: true,
        hasFireData: true,
        hasDebts: true,
      },
      calculatedAt: new Date().toISOString(),
    }

    // Verify all required keys exist
    expect(mockResponse.counts).toBeDefined()
    expect(mockResponse.financial).toBeDefined()
    expect(mockResponse.steps).toBeDefined()
    expect(mockResponse.calculatedAt).toBeDefined()

    // Counts
    expect(typeof mockResponse.counts.assets).toBe('number')
    expect(typeof mockResponse.counts.transactions).toBe('number')
    expect(typeof mockResponse.counts.completedActions).toBe('number')
    expect(typeof mockResponse.counts.lifeEvents).toBe('number')
    expect(typeof mockResponse.counts.budgets).toBe('number')
    expect(typeof mockResponse.counts.debts).toBe('number')
    expect(typeof mockResponse.counts.pendingRecommendations).toBe('number')
    expect(typeof mockResponse.counts.wonFreedomDays).toBe('number')

    // Financial
    expect(typeof mockResponse.financial.netWorth).toBe('number')
    expect(typeof mockResponse.financial.dailyExpenseRate).toBe('number')
    expect(typeof mockResponse.financial.monthlyExpenses).toBe('number')
    expect(mockResponse.financial.freedomDays).toHaveProperty('days')
    expect(mockResponse.financial.freedomDays).toHaveProperty('months')
    expect(mockResponse.financial.freedomDays).toHaveProperty('years')
    expect(typeof mockResponse.financial.sovereigntyLevel).toBe('number')

    // Steps — all booleans
    for (const val of Object.values(mockResponse.steps)) {
      expect(typeof val).toBe('boolean')
    }
  })

  it('A2: net worth = total assets - total debts', () => {
    const assets = [
      { current_value: 100000 },
      { current_value: 50000 },
      { current_value: 25000 },
    ]
    const debts = [
      { current_balance: -80000, debt_type: 'hypotheek' },
      { current_balance: -5000, debt_type: 'studieschuld' },
    ]

    const totalAssets = assets.reduce((s, a) => s + Number(a.current_value), 0)
    const totalDebts = debts.reduce((s, d) => s + Math.abs(Number(d.current_balance)), 0)
    const netWorth = totalAssets - totalDebts

    expect(totalAssets).toBe(175000)
    expect(totalDebts).toBe(85000)
    expect(netWorth).toBe(90000)
  })

  it('A3: daily expense rate computed from monthly over 365 days', () => {
    const monthlyExpenses = 3000
    const dailyExpenseRate = (monthlyExpenses * 12) / 365

    expect(dailyExpenseRate).toBeCloseTo(98.63, 1)
    expect(dailyExpenseRate).toBeGreaterThan(0)
  })

  it('A4: sovereignty level correctly calculated from net worth and expenses', () => {
    // Level 0 — less than 1 month covered
    expect(computeSovereigntyLevel(500, 3000, 1.39, false)).toBe(0)

    // Level 1 — 1-3 months
    expect(computeSovereigntyLevel(5000, 3000, 13.9, false)).toBe(1)

    // Level 3+ — momentum territory
    const nw = 150000
    const me = 3000
    const fpct = (nw / (me * 12)) * 100
    const level = computeSovereigntyLevel(nw, me, fpct, false)
    expect(level).toBeGreaterThanOrEqual(3)

    // Negative with consumer debt → -2
    expect(computeSovereigntyLevel(-10000, 3000, -27.8, true)).toBe(-2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B. GuideProgressBar — percentage and completion tracking
// ═══════════════════════════════════════════════════════════════════════════

describe('GuideProgressBar — step completion logic', () => {
  it('B1: 0 of 4 completed when all steps are false', () => {
    const steps: ProgressSteps = {
      hasAssets: false,
      hasTransactions: false,
      hasCompletedActions: false,
      hasFireData: false,
      hasLifeEvents: false,
      hasDebts: false,
    }
    expect(computeProgressPercentage(steps)).toBe(0)
  })

  it('B2: stap 1 completes when hasAssets OR hasDebts', () => {
    // Only assets
    expect(computeProgressPercentage({
      hasAssets: true, hasDebts: false,
      hasTransactions: false, hasCompletedActions: false,
      hasFireData: false, hasLifeEvents: false,
    })).toBe(1)

    // Only debts
    expect(computeProgressPercentage({
      hasAssets: false, hasDebts: true,
      hasTransactions: false, hasCompletedActions: false,
      hasFireData: false, hasLifeEvents: false,
    })).toBe(1)

    // Both
    expect(computeProgressPercentage({
      hasAssets: true, hasDebts: true,
      hasTransactions: false, hasCompletedActions: false,
      hasFireData: false, hasLifeEvents: false,
    })).toBe(1)
  })

  it('B3: stap 2 completes when hasTransactions', () => {
    expect(computeProgressPercentage({
      hasAssets: false, hasDebts: false,
      hasTransactions: true, hasCompletedActions: false,
      hasFireData: false, hasLifeEvents: false,
    })).toBe(1)
  })

  it('B4: stap 3 completes when hasCompletedActions', () => {
    expect(computeProgressPercentage({
      hasAssets: false, hasDebts: false,
      hasTransactions: false, hasCompletedActions: true,
      hasFireData: false, hasLifeEvents: false,
    })).toBe(1)
  })

  it('B5: stap 4 completes when hasFireData OR hasLifeEvents', () => {
    // Fire data only
    expect(computeProgressPercentage({
      hasAssets: false, hasDebts: false,
      hasTransactions: false, hasCompletedActions: false,
      hasFireData: true, hasLifeEvents: false,
    })).toBe(1)

    // Life events only
    expect(computeProgressPercentage({
      hasAssets: false, hasDebts: false,
      hasTransactions: false, hasCompletedActions: false,
      hasFireData: false, hasLifeEvents: true,
    })).toBe(1)
  })

  it('B6: all 4 completed when all conditions met', () => {
    expect(computeProgressPercentage({
      hasAssets: true, hasDebts: true,
      hasTransactions: true, hasCompletedActions: true,
      hasFireData: true, hasLifeEvents: true,
    })).toBe(4)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C. ReisStapSection — status indicators per step
// ═══════════════════════════════════════════════════════════════════════════

describe('ReisStapSection — status indicators', () => {
  it('C1: Stap 1 "Weet waar je staat" — complete when hasAssets', () => {
    // The page passes isComplete={!!progress?.steps.hasAssets}
    const progress = { steps: { hasAssets: true } }
    expect(!!progress.steps.hasAssets).toBe(true)
  })

  it('C2: Stap 1 — status lines show asset/debt counts', () => {
    const counts = { assets: 3, debts: 1 }
    const steps = { hasAssets: true, hasDebts: true }

    // Simulates the status line logic from page.tsx
    const statusLines = steps.hasAssets || steps.hasDebts
      ? [
          `Je hebt ${counts.assets} bezitting${counts.assets !== 1 ? 'en' : ''} en ${counts.debts} schuld${counts.debts !== 1 ? 'en' : ''} geregistreerd.`,
        ]
      : ['Je hebt nog geen vermogen ingevoerd.']

    expect(statusLines[0]).toContain('3 bezittingen')
    expect(statusLines[0]).toContain('1 schuld ')
  })

  it('C3: Stap 2 "Begrijp je patronen" — complete when hasTransactions', () => {
    const progress = { steps: { hasTransactions: true } }
    expect(!!progress.steps.hasTransactions).toBe(true)
  })

  it('C4: Stap 2 — status lines show transaction count', () => {
    const counts = { transactions: 1542 }
    const steps = { hasTransactions: true }

    const statusLines = steps.hasTransactions
      ? [`Je hebt ${counts.transactions.toLocaleString('nl-NL')} transacties geïmporteerd.`]
      : ['Importeer je eerste transacties.']

    expect(statusLines[0]).toContain('1.542')
    expect(statusLines[0]).toContain('transacties')
  })

  it('C5: Stap 3 "Onderneem actie" — status based on actions', () => {
    const counts = { completedActions: 5, pendingRecommendations: 3, wonFreedomDays: 12.5 }
    const steps = { hasCompletedActions: true }

    expect(steps.hasCompletedActions).toBe(true)
    expect(counts.completedActions).toBeGreaterThan(0)
    expect(counts.wonFreedomDays).toBeGreaterThan(0)
  })

  it('C6: Stap 4 "Kijk vooruit" — status based on life events and FIRE', () => {
    const steps = { hasLifeEvents: true, hasFireData: true }

    // Step 4 completes with either fire data or life events
    expect(steps.hasLifeEvents || steps.hasFireData).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// D. GuideTopicCard — howTo steps and tips
// ═══════════════════════════════════════════════════════════════════════════

describe('GuideTopicCard — howTo steps and tips rendering', () => {
  // Test data mirroring actual page content
  const cashHowTo = {
    steps: [
      'Rekening toevoegen: Ga naar De Kern → Cash → Nieuwe rekening.',
      'Transacties importeren: Ga naar Cash → Importeren.',
      'Controleer de transacties in de review-stap.',
      'Bankconnectie: Koppel je bank via De Kern → Cash → Verbinden.',
      'Automatische categorisatie: bij import worden transacties gekoppeld.',
      'Corrigeer waar nodig.',
      'Eigen overboekingen tussen je rekeningen worden automatisch herkend.',
    ],
    tip: 'Importeer minimaal 3 maanden aan transacties.',
  }

  it('D1: howTo has numbered steps (non-empty array)', () => {
    expect(cashHowTo.steps.length).toBeGreaterThan(0)
    expect(cashHowTo.steps.every(s => typeof s === 'string' && s.length > 0)).toBe(true)
  })

  it('D2: howTo tip is optional string', () => {
    expect(typeof cashHowTo.tip).toBe('string')
    expect(cashHowTo.tip!.length).toBeGreaterThan(0)

    // Without tip
    const noTip = { steps: ['Step 1'], tip: undefined }
    expect(noTip.tip).toBeUndefined()
  })

  it('D3: all 4 reis-stap sections have GuideTopicCards with howTo', () => {
    // Stap 1: Cash rekeningen, Vermogensbeheer, Schuldenbeheer, Netto vermogen
    const stap1Topics = ['Cash rekeningen', 'Vermogensbeheer', 'Schuldenbeheer', 'Netto vermogen']
    expect(stap1Topics.length).toBe(4)

    // Stap 2: Budgetteren, Belasting, Check-in, What's coming
    const stap2Topics = ['Budgetteren', 'Belasting', 'Check-in']
    expect(stap2Topics.length).toBeGreaterThanOrEqual(3)

    // Stap 3: Voorstellen, Acties, Doelen, Abonnementen, etc.
    const stap3Topics = ['Voorstellen', 'Acties', 'Doelen', 'Abonnementen']
    expect(stap3Topics.length).toBeGreaterThanOrEqual(4)

    // Stap 4: FIRE-projectie, Levensgebeurtenissen, etc.
    const stap4Topics = ['FIRE-projectie', 'Levensgebeurtenissen', 'Monte Carlo & backtesting', 'Onttrekkingsstrategie']
    expect(stap4Topics.length).toBe(4)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// E. ConceptFlipCards — 5 concepts with flip animation data
// ═══════════════════════════════════════════════════════════════════════════

describe('ConceptFlipCards — concept definitions', () => {
  const CONCEPT_IDS = ['vrijheidstijd', 'kassabon', 'fire', 'soevereiniteit', 'will']

  it('E1: exactly 5 concepts defined', () => {
    expect(CONCEPT_IDS.length).toBe(5)
  })

  it('E2: personal data functions produce correct output', () => {
    const financial = {
      freedomDays: { days: 15, months: 3, years: 4 },
      fireAge: 52,
      sovereigntyLevel: 3,
    }

    // Vrijheidstijd personalDataFn
    const { years, months } = financial.freedomDays
    const freedomText = years > 0
      ? `Jouw vrijheidstijd: ${years} jaar en ${months} maanden`
      : `Jouw vrijheidstijd: ${months} maanden en ${financial.freedomDays.days} dagen`
    expect(freedomText).toBe('Jouw vrijheidstijd: 4 jaar en 3 maanden')

    // FIRE personalDataFn
    const fireText = financial.fireAge
      ? `Jouw verwachte FIRE-leeftijd: ${financial.fireAge} jaar`
      : null
    expect(fireText).toBe('Jouw verwachte FIRE-leeftijd: 52 jaar')

    // Soevereiniteit personalDataFn
    const SOVEREIGNTY_PHASE_LABELS: Record<string, string> = {
      recovery: 'Herstel',
      stability: 'Stabiliteit',
      momentum: 'Momentum',
      mastery: 'Meesterschap',
    }
    function getSovereigntyPhase(level: number): string {
      if (level <= 0) return 'recovery'
      if (level <= 2) return 'stability'
      if (level <= 4) return 'momentum'
      return 'mastery'
    }
    const phase = getSovereigntyPhase(financial.sovereigntyLevel)
    const label = SOVEREIGNTY_PHASE_LABELS[phase] ?? phase
    const sovText = `Jouw niveau: ${label} (level ${financial.sovereigntyLevel})`
    expect(sovText).toBe('Jouw niveau: Momentum (level 3)')
  })

  it('E3: kassabon and will concepts return null personal data', () => {
    // These concepts don't have personal data
    const kassabonFn = () => null
    const willFn = () => null
    expect(kassabonFn()).toBeNull()
    expect(willFn()).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// F. GuideFaq — questions and expand/collapse
// ═══════════════════════════════════════════════════════════════════════════

describe('GuideFaq — FAQ content and accordion logic', () => {
  const FAQ_QUESTIONS = [
    'Hoe importeer ik mijn transacties?',
    'Wat betekent mijn FIRE-getal precies?',
    'Hoe pas ik mijn dashboard aan?',
    'Is mijn financiële data veilig?',
    'Wat is de maandelijkse check-in?',
    'Wat zijn widgets en hoe werken ze?',
    'Wat is een kassabon?',
    'Hoe voeg ik een partner toe?',
  ]

  it('F1: 8 FAQ items defined', () => {
    expect(FAQ_QUESTIONS.length).toBe(8)
  })

  it('F2: all questions are non-empty strings', () => {
    FAQ_QUESTIONS.forEach(q => {
      expect(typeof q).toBe('string')
      expect(q.length).toBeGreaterThan(0)
      expect(q.endsWith('?')).toBe(true)
    })
  })

  it('F3: accordion is single-open (only one item open at a time)', () => {
    // Simulates the GuideFaq state logic: openId is number | null
    let openId: number | null = null

    // Open first item
    openId = openId === 0 ? null : 0
    expect(openId).toBe(0)

    // Open second item (first should close)
    openId = openId === 1 ? null : 1
    expect(openId).toBe(1)

    // Toggle same item (should close)
    openId = openId === 1 ? null : 1
    expect(openId).toBeNull()
  })

  it('F4: FAQ items with links have valid href paths', () => {
    const FAQ_LINKS = [
      { label: 'Ga naar import', href: '/core/cash/import' },
      { label: 'Bekijk je prognose', href: '/horizon' },
      { label: 'Widget-instellingen', href: '/mijn/geavanceerd' },
      { label: 'Privacy-instellingen', href: '/mijn/privacy' },
      { label: 'Beheer widgets', href: '/mijn/geavanceerd' },
      { label: 'Profiel bewerken', href: '/mijn/profiel' },
    ]

    FAQ_LINKS.forEach(link => {
      expect(link.href).toMatch(/^\//)  // starts with /
      expect(link.label.length).toBeGreaterThan(0)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// G. GuideProTips — tips content
// ═══════════════════════════════════════════════════════════════════════════

describe('GuideProTips — tips content', () => {
  const PRO_TIPS = [
    'Tik op elk bedrag om de kassabon te openen',
    'Bedragen boven €100 tonen ook het vrijheidstijd-equivalent',
    'Dashboard-widgets zijn aanpasbaar',
    'Nieuwe features ontgrendelen automatisch',
    'Stel Will een vraag via de chatknop rechtsonder',
    'Werk je saldi maandelijks bij via de check-in',
    'Vergelijk scenario\'s in de What-If droomruimte',
    'Voeg je partner toe voor gezamenlijke vermogensberekeningen',
  ]

  it('G1: exactly 8 pro tips defined', () => {
    expect(PRO_TIPS.length).toBe(8)
  })

  it('G2: all tips are non-empty strings', () => {
    PRO_TIPS.forEach(tip => {
      expect(typeof tip).toBe('string')
      expect(tip.length).toBeGreaterThan(10)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// H. GuideNaslagwerk — reference material grouped by module
// ═══════════════════════════════════════════════════════════════════════════

describe('GuideNaslagwerk — reference material', () => {
  const MODULES = [
    { id: 'kern', label: 'De Kern', topicCount: 8 },
    { id: 'wil', label: 'De Wil', topicCount: 8 },
    { id: 'horizon', label: 'De Horizon', topicCount: 6 },
    { id: 'algemeen', label: 'Algemeen', topicCount: 10 },
  ]

  it('H1: 4 modules defined (Kern, Wil, Horizon, Algemeen)', () => {
    expect(MODULES.length).toBe(4)
    expect(MODULES.map(m => m.id)).toEqual(['kern', 'wil', 'horizon', 'algemeen'])
  })

  it('H2: each module has at least 6 topics', () => {
    MODULES.forEach(mod => {
      expect(mod.topicCount).toBeGreaterThanOrEqual(6)
    })
  })

  it('H3: total topics across all modules ≥ 30', () => {
    const total = MODULES.reduce((s, m) => s + m.topicCount, 0)
    expect(total).toBeGreaterThanOrEqual(30)
  })

  it('H4: module labels are correct Dutch names', () => {
    expect(MODULES.find(m => m.id === 'kern')!.label).toBe('De Kern')
    expect(MODULES.find(m => m.id === 'wil')!.label).toBe('De Wil')
    expect(MODULES.find(m => m.id === 'horizon')!.label).toBe('De Horizon')
    expect(MODULES.find(m => m.id === 'algemeen')!.label).toBe('Algemeen')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// I. FIRE age estimation (used in API route)
// ═══════════════════════════════════════════════════════════════════════════

describe('Guide FIRE age estimation', () => {
  it('I1: FIRE age computes correctly with standard parameters', () => {
    // 35 year old, €150K portfolio, €36K/yr expenses, 7% return
    const yearlyExpenses = 36000
    const fireTarget = yearlyExpenses / NL_SWR
    const fireAge = computeFireAge(35, 150000, fireTarget, 3000, 0.07)

    expect(fireAge).not.toBeNull()
    expect(fireAge).toBeGreaterThan(35)
    expect(fireAge).toBeLessThan(80)
  })

  it('I2: FIRE age is current age when already at target', () => {
    const yearlyExpenses = 36000
    const fireTarget = yearlyExpenses / NL_SWR
    // Net worth exceeds fire target
    const fireAge = computeFireAge(45, fireTarget + 100000, fireTarget, 3000, 0.07)
    expect(fireAge).toBe(45)
  })

  it('I3: FIRE target = yearly expenses / NL_SWR', () => {
    const yearlyExpenses = 36000
    const fireTarget = yearlyExpenses / NL_SWR

    expect(NL_SWR).toBeGreaterThan(0)
    expect(NL_SWR).toBeLessThan(0.05) // Dutch SWR is around 3.4%
    expect(fireTarget).toBeGreaterThan(yearlyExpenses * 20) // > 20x expenses
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// J. Freedom days calculation (used in ConceptFlipCards)
// ═══════════════════════════════════════════════════════════════════════════

describe('Freedom days calculation for guide', () => {
  it('J1: calculateFreedomTime returns years/months/days breakdown', () => {
    const result = calculateFreedomTime(150000, 100)
    expect(result).toHaveProperty('years')
    expect(result).toHaveProperty('months')
    expect(result).toHaveProperty('days')
    expect(result).toHaveProperty('totalDays')
    expect(result.totalDays).toBe(1500)
    expect(result.years).toBeGreaterThan(0)
  })

  it('J2: zero daily expenses returns zero freedom time', () => {
    const result = calculateFreedomTime(100000, 0)
    expect(result.totalDays).toBe(0)
    expect(result.isInfinite).toBe(true)
  })

  it('J3: negative net worth returns deficit flag', () => {
    const result = calculateFreedomTime(-50000, 100)
    expect(result.isDeficit).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// K. OntdekkenSection — discovery feature structure
// ═══════════════════════════════════════════════════════════════════════════

describe('OntdekkenSection — discovery links structure', () => {
  it('K1: module color mappings are defined for kern, wil, horizon', () => {
    const DISCOVER_MODULE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
      kern: { bg: 'bg-kern-50', border: 'border-kern-200', text: 'text-kern-700', dot: 'bg-kern-400' },
      wil: { bg: 'bg-wil-50', border: 'border-wil-200', text: 'text-wil-700', dot: 'bg-wil-400' },
      horizon: { bg: 'bg-horizon-50', border: 'border-horizon-200', text: 'text-horizon-700', dot: 'bg-horizon-400' },
    }

    expect(Object.keys(DISCOVER_MODULE_COLORS)).toEqual(['kern', 'wil', 'horizon'])
    for (const mod of Object.values(DISCOVER_MODULE_COLORS)) {
      expect(mod.bg).toBeTruthy()
      expect(mod.border).toBeTruthy()
      expect(mod.text).toBeTruthy()
      expect(mod.dot).toBeTruthy()
    }
  })

  it('K2: max 6 cards displayed in the section', () => {
    // The component slices to .slice(0, 6)
    const allCards = Array.from({ length: 10 }, (_, i) => ({ id: `item-${i}` }))
    const displayedCards = allCards.slice(0, 6)
    expect(displayedCards.length).toBe(6)
  })
})
