import { describe, it, expect } from 'vitest'
import { buildVooruitblikItems } from './vooruitblik'
import type { VasteLastenItem } from '@/lib/vaste-lasten-summary'

function item(over: Partial<VasteLastenItem> & { name: string; monthlyAmount: number }): VasteLastenItem {
  return {
    id: over.name,
    averageAmount: over.monthlyAmount,
    frequency: 'monthly',
    nextDate: null,
    confidence: 'high',
    isVariableAmount: false,
    occurrences: null,
    alreadyConfirmed: true,
    category: 'other_expense',
    categoryLabel: 'Overige uitgave',
    categoryOverride: null,
    ...over,
  }
}

describe('buildVooruitblikItems', () => {
  // De vooruitblik toont de VASTE lasten, niet de losse aankopen van vorige
  // maand. De grootste post hoort bovenaan te staan.
  it('sorteert op bedrag, grootste eerst', () => {
    const out = buildVooruitblikItems({
      vasteKosten: [item({ name: 'Hypotheek', monthlyAmount: 1200 }), item({ name: 'Water', monthlyAmount: 18 })],
      subscriptions: [item({ name: 'Netflix', monthlyAmount: 14 }), item({ name: 'Zorgverzekering', monthlyAmount: 145 })],
    }, 'september')
    expect(out.map(i => i.name)).toEqual(['Hypotheek', 'Zorgverzekering', 'Water', 'Netflix'])
  })

  it('geeft uitgaven als negatief bedrag met de komende maand als label', () => {
    const out = buildVooruitblikItems({
      vasteKosten: [item({ name: 'Hypotheek', monthlyAmount: 1200.4 })],
      subscriptions: [],
    }, 'september')
    expect(out[0]).toEqual({ name: 'Hypotheek', amount: -1200, date: 'september' })
  })

  // Een kwartaal-/jaarpost draagt zijn frequentie in het label, zodat het
  // getoonde bedrag herkenbaar een maandgemiddelde is en geen incasso.
  it('markeert kwartaal- en jaarposten als maandgemiddelde', () => {
    const out = buildVooruitblikItems({
      vasteKosten: [
        item({ name: 'Gemeentebelasting', monthlyAmount: 40, frequency: 'yearly' }),
        item({ name: 'Waterschap', monthlyAmount: 25, frequency: 'quarterly' }),
      ],
      subscriptions: [],
    }, 'september')
    expect(out[0].date).toBe('september · jaarlijks (maandgemiddelde)')
    expect(out[1].date).toBe('september · per kwartaal (maandgemiddelde)')
  })

  it('laat posten weg die naar € 0 afronden', () => {
    const out = buildVooruitblikItems({
      vasteKosten: [item({ name: 'Ruis', monthlyAmount: 0.2 })],
      subscriptions: [],
    }, 'september')
    expect(out).toEqual([])
  })

  it('kapt af op de limiet', () => {
    const many = Array.from({ length: 15 }, (_, n) =>
      item({ name: `Post ${n}`, monthlyAmount: 100 + n }))
    const out = buildVooruitblikItems({ vasteKosten: many, subscriptions: [] }, 'september', 10)
    expect(out).toHaveLength(10)
    expect(out[0].name).toBe('Post 14')
  })
})
