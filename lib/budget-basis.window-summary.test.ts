/**
 * B-017 — één grondslag-regel onder de budget-kassabon, ook als de posten
 * verschillende meetvensters hebben.
 *
 * Gemeld op /overzicht/cashflow: "bovenaan staat 12 maanden gemiddeld en in de
 * budgetten staat 10 maanden of 2 maanden". De per-post-deler IS bewust
 * per-post (`resolveDenominatorMonths`: de leeftijd van het budget, ADR 0103 /
 * de over-extrapolatiefout van ADR 0050) — dus niet "alles op 12", maar de
 * weergave eerlijk maken.
 *
 * De regel eronder werd samengevat met `Math.max` over de posten. Eén post met
 * een vol jaar zette die max op 12 en liet de zin dus volledig weg, terwijl
 * ernaast een post van 2 maanden ×6 was doorgerekend. De max is precies de
 * verkeerde samenvatter voor een eerlijkheidsmelding: de zwakste post bepaalt
 * hoe hard het totaal leunt op extrapolatie, niet de sterkste.
 *
 * Given posten met uiteenlopende meetvensters
 * When  de kassabon zijn grondslag-regel samenstelt
 * Then  telt alleen wat MEEDOET (uitgevinkte posten niet), en de regel benoemt
 *       hoeveel posten korter zijn gemeten en over welke spanne.
 */

import { describe, it, expect } from 'vitest'
import {
  summarizeBasisWindow,
  extrapolationNote,
  type BudgetBasisEntry,
  type BudgetBasisResult,
} from './budget-basis'

function entry(partial: Partial<BudgetBasisEntry> & { id: string }): BudgetBasisEntry {
  return {
    name: partial.id,
    interval: 'monthly',
    annualAmount: 12000,
    excluded: false,
    source: 'realized',
    realizedMonths: 12,
    plannedAnnualAmount: 12000,
    ...partial,
  }
}

function basis(entries: BudgetBasisEntry[]): BudgetBasisResult {
  const annualTotal = entries.filter(e => !e.excluded).reduce((s, e) => s + e.annualAmount, 0)
  return {
    annualTotal,
    monthlyTotal: annualTotal / 12,
    entries,
    hasBudgets: entries.length > 0,
    allExcluded: entries.length > 0 && entries.every(e => e.excluded),
    realizedWindowMonths: 12,
    truncationSuspected: false,
  }
}

describe('summarizeBasisWindow', () => {
  it('alle posten dekken het volle venster → niets te melden', () => {
    const s = summarizeBasisWindow(basis([entry({ id: 'a' }), entry({ id: 'b' })]))
    expect(s.countedRealized).toBe(2)
    expect(s.shortCount).toBe(0)
    expect(extrapolationNote(s)).toBeNull()
  })

  it('B-017: één volle post mag een korte post niet wegdrukken', () => {
    const s = summarizeBasisWindow(
      basis([
        entry({ id: 'salaris', realizedMonths: 12 }),
        entry({ id: 'bijbaan', realizedMonths: 2 }),
      ]),
    )
    expect(s.countedRealized).toBe(2)
    expect(s.shortCount).toBe(1)
    expect(s.shortestMonths).toBe(2)
    expect(s.longestShortMonths).toBe(2)
    const note = extrapolationNote(s)
    expect(note).not.toBeNull()
    expect(note).toContain('1 van de 2')
    expect(note).toContain('2 maanden')
    expect(note).toContain('doorgerekend naar een heel jaar')
  })

  it('meerdere korte posten worden als spanne benoemd', () => {
    const s = summarizeBasisWindow(
      basis([
        entry({ id: 'salaris', realizedMonths: 12 }),
        entry({ id: 'tien', realizedMonths: 10 }),
        entry({ id: 'twee', realizedMonths: 2 }),
      ]),
    )
    expect(s.shortCount).toBe(2)
    expect(s.shortestMonths).toBe(2)
    expect(s.longestShortMonths).toBe(10)
    expect(extrapolationNote(s)).toContain('2–10 maanden')
  })

  it('is elke post even kort, dan blijft de oude, rustige zin staan', () => {
    const s = summarizeBasisWindow(
      basis([entry({ id: 'a', realizedMonths: 5 }), entry({ id: 'b', realizedMonths: 5 })]),
    )
    expect(extrapolationNote(s)).toBe(
      'Gemeten over 5 maanden en doorgerekend naar een heel jaar.',
    )
  })

  it('UITGEVINKTE posten tellen niet mee — ze zitten ook niet in het totaal', () => {
    const rows = basis([
      entry({ id: 'salaris', realizedMonths: 12 }),
      entry({ id: 'kort', realizedMonths: 2 }),
    ])
    const s = summarizeBasisWindow(rows, new Set(['kort']))
    expect(s.countedRealized).toBe(1)
    expect(s.shortCount).toBe(0)
    expect(extrapolationNote(s)).toBeNull()
  })

  it('GEPLANDE posten dragen geen meetvenster en tellen niet mee', () => {
    const s = summarizeBasisWindow(
      basis([
        entry({ id: 'plan', source: 'planned', realizedMonths: 0 }),
        entry({ id: 'kort', realizedMonths: 3 }),
      ]),
    )
    expect(s.countedRealized).toBe(1)
    expect(s.shortCount).toBe(1)
    expect(extrapolationNote(s)).toBe(
      'Gemeten over 3 maanden en doorgerekend naar een heel jaar.',
    )
  })

  it('één maand blijft enkelvoud', () => {
    const s = summarizeBasisWindow(basis([entry({ id: 'a', realizedMonths: 1 })]))
    expect(extrapolationNote(s)).toBe(
      'Gemeten over 1 maand en doorgerekend naar een heel jaar.',
    )
  })

  it('zonder posten valt er niets te melden', () => {
    const s = summarizeBasisWindow(basis([]))
    expect(s.countedRealized).toBe(0)
    expect(extrapolationNote(s)).toBeNull()
  })
})
