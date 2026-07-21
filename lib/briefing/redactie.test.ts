import { describe, it, expect } from 'vitest'
import {
  extractNumericTokens,
  sanitizeRedactedText,
  applyRedactie,
  buildEngineMetrics,
  buildDirectivesBlock,
} from './redactie'
import type { BriefingEntry } from '@/lib/types/briefing'
import type { BriefingEngineInput } from './engine'
import type { BriefingDirective, FunctionalDirective } from './directives'

/**
 * Tests voor de pure delen van de redactie-laag: de nummer-guard die
 * hallucinatie van cijfers structureel onmogelijk maakt, de metrics-
 * afleiding voor functionele directives en het directives-promptblok.
 * De AI-call zelf (redactBriefing) is een dunne wrapper met try/catch
 * en wordt bewust niet tegen een echte provider getest.
 */

function entry(id: string, text: string): BriefingEntry {
  return { id, category: 'observation', text }
}

describe('extractNumericTokens', () => {
  it('haalt bedragen, percentages en aantallen op', () => {
    expect(extractNumericTokens('Je spaart 25% — € 1.234,56 erbij, 3 acties open')).toEqual([
      '25', '1.234,56', '3',
    ])
  })

  it('lege tekst → lege lijst', () => {
    expect(extractNumericTokens('geen cijfers hier')).toEqual([])
  })
})

describe('sanitizeRedactedText — nummer-guard', () => {
  const original = 'Je vermogen groeide met € 3.000 — 30 dagen vrijheid erbij.'

  it('accepteert een herschrijving waarin alle bron-getallen terugkomen', () => {
    const out = sanitizeRedactedText(
      'Mooi: € 3.000 erbij sinds je vorige meetpunt — dat zijn 30 dagen vrijheid.',
      original,
    )
    expect(out).toContain('3.000')
    expect(out).toContain('30 dagen')
  })

  it('wijst af wanneer een bron-getal ontbreekt', () => {
    expect(
      sanitizeRedactedText('Je vermogen groeide flink — 30 dagen vrijheid erbij.', original),
    ).toBeNull()
  })

  it('wijst af wanneer het model een nieuw getal verzint', () => {
    expect(
      sanitizeRedactedText(
        'Je vermogen groeide met € 3.000 (wel 12% meer!) — 30 dagen vrijheid erbij.',
        original,
      ),
    ).toBeNull()
  })

  it('wijst lege en te lange output af', () => {
    expect(sanitizeRedactedText('', original)).toBeNull()
    expect(sanitizeRedactedText(null, original)).toBeNull()
    expect(sanitizeRedactedText('€ 3.000 30 ' + 'x'.repeat(300), original)).toBeNull()
  })

  it('strip omringende aanhalingstekens en vouwt witruimte samen', () => {
    const out = sanitizeRedactedText(
      '"€ 3.000  erbij —\n 30 dagen vrijheid gewonnen."',
      original,
    )
    expect(out).toBe('€ 3.000 erbij — 30 dagen vrijheid gewonnen.')
  })

  it('tekst zonder bron-getallen mag vrij herschreven worden (geen nieuwe getallen)', () => {
    const noNumbers = 'Je staat er goed voor.'
    expect(sanitizeRedactedText('Het gaat de goede kant op.', noNumbers)).toBe(
      'Het gaat de goede kant op.',
    )
    expect(sanitizeRedactedText('Het gaat 100% de goede kant op.', noNumbers)).toBeNull()
  })
})

describe('applyRedactie', () => {
  it('vervangt alleen goedgekeurde teksten, immutable', () => {
    const entries = [entry('a', 'Origineel A'), entry('b', 'Origineel B')]
    const out = applyRedactie(entries, new Map([['b', 'Herschreven B']]))
    expect(out[0].text).toBe('Origineel A')
    expect(out[1].text).toBe('Herschreven B')
    expect(entries[1].text).toBe('Origineel B')
  })

  it('lege map → zelfde array terug', () => {
    const entries = [entry('a', 'A')]
    expect(applyRedactie(entries, new Map())).toBe(entries)
  })
})

describe('buildEngineMetrics', () => {
  function input(finance: BriefingEngineInput['finance']): BriefingEngineInput {
    return { recommendations: [], events: [], health: null, goalNames: [], goalProgresses: [], finance }
  }

  it('leidt delta, groeimaanden, spaarquote, budget-pct en freedomPct af', () => {
    const m = buildEngineMetrics(
      input({
        netWorthHistory: [
          { month: '2026-07', value: 90000 },
          { month: '2026-08', value: 95000 },
          { month: '2026-09', value: 98000 },
        ],
        monthlyIncome: 4000,
        monthlyExpenses: 3000,
        budgetExpense: { spent: 1800, limit: 2000 },
        freedomPct: 41.6,
      }),
    )
    expect(m.netWorthDelta).toBe(3000)
    expect(m.consecutiveGrowthMonths).toBe(2)
    expect(m.savingsRate).toBe(25)
    expect(m.budgetExpensePct).toBe(90)
    expect(m.freedomPct).toBe(42)
  })

  it('zonder finance → lege metrics; income-0 levert geen spaarquote', () => {
    expect(buildEngineMetrics(input(undefined))).toEqual({})
    const m = buildEngineMetrics(input({ monthlyIncome: 0, monthlyExpenses: 3000 }))
    expect(m.savingsRate).toBeUndefined()
  })
})

describe('buildDirectivesBlock', () => {
  const temporal: BriefingDirective[] = [
    {
      id: 't1', title: 'December', instruction: 'Jaaroverzicht-toon.',
      priority: 'high', months: [12], enabled: true,
    },
  ]
  const functional: FunctionalDirective[] = [
    {
      id: 'f1', title: 'Budget over', metric: 'budget', condition: 'over',
      instruction: 'Benoem de overschrijding.', priority: 'high', enabled: true,
    },
  ]

  it('combineert actieve temporele + functionele richtlijnen', () => {
    const block = buildDirectivesBlock(
      { temporal, functional },
      new Date('2026-12-10T12:00:00Z'),
      { budgetExpensePct: 110 },
    )
    expect(block).toContain('== REDACTIONELE RICHTLIJNEN ==')
    expect(block).toContain('Jaaroverzicht-toon.')
    expect(block).toContain('== FUNCTIONELE RICHTLIJNEN ==')
    expect(block).toContain('[ACTIEF]')
  })

  it('buiten het datumvenster valt de temporele richtlijn weg', () => {
    const block = buildDirectivesBlock(
      { temporal, functional: [] },
      new Date('2026-06-10T12:00:00Z'),
      null,
    )
    expect(block).toBe('')
  })
})
