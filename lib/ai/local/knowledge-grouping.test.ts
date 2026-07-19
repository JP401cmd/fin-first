import { describe, it, expect } from 'vitest'
import {
  groupItemsByCategory,
  freshnessMeta,
  summarizeFreshness,
  FRESHNESS_DOT,
} from './knowledge-grouping'
import { KNOWLEDGE_CATEGORIES } from './knowledge-starter-set'
import type { LocalKnowledgeItem } from './knowledge-context'

function item(overrides: Partial<LocalKnowledgeItem> = {}): LocalKnowledgeItem {
  return {
    id: crypto.randomUUID(),
    titel: 'Titel',
    tekst: 'Uitleg',
    tags: [],
    actief: true,
    volgorde: 0,
    bijgewerkt: '2026-01-01T00:00:00.000Z',
    categorie: 'Belastingen',
    laatstGecontroleerd: '2026-01-01T00:00:00.000Z',
    controleerVoor: null,
    ...overrides,
  }
}

describe('groupItemsByCategory', () => {
  it('groepeert per categorie en behoudt de originele flat-index', () => {
    const items = [
      item({ categorie: 'Pensioen', titel: 'A' }),
      item({ categorie: 'Belastingen', titel: 'B' }),
      item({ categorie: 'Pensioen', titel: 'C' }),
    ]
    const groups = groupItemsByCategory(items, KNOWLEDGE_CATEGORIES)

    const belastingen = groups.find((g) => g.categorie === 'Belastingen')!
    const pensioen = groups.find((g) => g.categorie === 'Pensioen')!

    expect(belastingen.entries).toHaveLength(1)
    expect(belastingen.entries[0].index).toBe(1) // B stond op flat-index 1
    expect(pensioen.entries.map((e) => e.index)).toEqual([0, 2]) // A, C
  })

  it('ordent bekende categorieën op KNOWLEDGE_CATEGORIES-volgorde', () => {
    const items = [
      item({ categorie: 'Pensioen' }),
      item({ categorie: 'Belastingen' }),
    ]
    const groups = groupItemsByCategory(items, KNOWLEDGE_CATEGORIES)
    // Belastingen staat vóór Pensioen in KNOWLEDGE_CATEGORIES
    expect(groups.map((g) => g.categorie)).toEqual(['Belastingen', 'Pensioen'])
  })

  it('zet legacy/onbekende categorieën alfabetisch achteraan', () => {
    const items = [
      item({ categorie: 'Zeldzaam' }),
      item({ categorie: 'Algemeen' }),
      item({ categorie: 'Belastingen' }),
    ]
    const groups = groupItemsByCategory(items, KNOWLEDGE_CATEGORIES)
    expect(groups.map((g) => g.categorie)).toEqual(['Belastingen', 'Algemeen', 'Zeldzaam'])
  })

  it('telt totaal en actief per groep', () => {
    const items = [
      item({ categorie: 'Belastingen', actief: true }),
      item({ categorie: 'Belastingen', actief: false }),
      item({ categorie: 'Belastingen', actief: true }),
    ]
    const [groep] = groupItemsByCategory(items, KNOWLEDGE_CATEGORIES)
    expect(groep.total).toBe(3)
    expect(groep.active).toBe(2)
  })

  it('valt terug op "Algemeen" bij een lege categorie', () => {
    const groups = groupItemsByCategory([item({ categorie: '  ' })], KNOWLEDGE_CATEGORIES)
    expect(groups[0].categorie).toBe('Algemeen')
  })
})

describe('freshnessMeta', () => {
  const now = new Date('2026-07-19T00:00:00.000Z')

  it('evergreen (geen controleerVoor) → neutrale stip, geen datum', () => {
    const meta = freshnessMeta(item({ controleerVoor: null }), now)
    expect(meta.freshness).toBe('evergreen')
    expect(meta.dotClass).toBe(FRESHNESS_DOT.evergreen)
    expect(meta.label).toMatch(/evergreen/i)
  })

  it('verlopen → rood, label noemt verstreken datum', () => {
    const meta = freshnessMeta(item({ controleerVoor: '2026-01-01' }), now)
    expect(meta.freshness).toBe('verlopen')
    expect(meta.dotClass).toBe(FRESHNESS_DOT.verlopen)
    expect(meta.label).toMatch(/verstreken/i)
    expect(meta.label).toMatch(/1 januari 2026/)
  })

  it('binnenkort → amber met leesbare datum', () => {
    // Binnen 60 dagen na now.
    const meta = freshnessMeta(item({ controleerVoor: '2026-08-01' }), now)
    expect(meta.freshness).toBe('binnenkort')
    expect(meta.dotClass).toBe(FRESHNESS_DOT.binnenkort)
    expect(meta.label).toMatch(/1 augustus 2026/)
  })

  it('ok → groen met "Controleer vóór"-datum', () => {
    const meta = freshnessMeta(item({ controleerVoor: '2027-10-01' }), now)
    expect(meta.freshness).toBe('ok')
    expect(meta.dotClass).toBe(FRESHNESS_DOT.ok)
    expect(meta.label).toMatch(/Controleer vóór 1 oktober 2027/)
  })
})

describe('summarizeFreshness', () => {
  const now = new Date('2026-07-19T00:00:00.000Z')

  it('telt verlopen en binnenkort, negeert ok en evergreen', () => {
    const items = [
      item({ controleerVoor: '2026-01-01' }), // verlopen
      item({ controleerVoor: '2026-08-01' }), // binnenkort
      item({ controleerVoor: '2027-10-01' }), // ok
      item({ controleerVoor: null }), // evergreen
    ]
    expect(summarizeFreshness(items, now)).toEqual({ verlopen: 1, binnenkort: 1 })
  })
})
