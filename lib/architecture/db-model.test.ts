import { describe, expect, it } from 'vitest'
import archData from '@/docs/architecture/architecture.json'
import { selectInsights } from './facts'
import { buildDatabaseModel, getDbNeighbours, getDbRelationsFor } from './db-model'

const insights = selectInsights(archData)
const model = buildDatabaseModel(insights)

describe('db-model — layout', () => {
  it('plaatst elke tabel uit tablesByDomain', () => {
    const total = insights.tablesByDomain.reduce((s, g) => s + g.tables.length, 0)
    expect(model.tables.length).toBe(total)
    expect(total).toBeGreaterThan(30)
  })

  it('elke tabel valt binnen de viewBox', () => {
    for (const t of model.tables) {
      expect(t.x + t.w).toBeLessThanOrEqual(model.width)
      expect(t.y + t.h).toBeLessThanOrEqual(model.height)
    }
  })

  it('tabellen binnen één domein delen dezelfde x (kolom)', () => {
    for (const col of model.columns) {
      const inCol = model.tables.filter((t) => t.domain === col.domain)
      for (const t of inCol) expect(t.x).toBe(col.x)
    }
  })

  it('edges verwijzen alleen naar geplaatste tabellen', () => {
    const names = new Set(model.tables.map((t) => t.name))
    for (const e of model.edges) {
      expect(names.has(e.from)).toBe(true)
      expect(names.has(e.to)).toBe(true)
    }
  })
})

describe('db-model — relaties', () => {
  it('kent de holdings-keten (holding_prices → holdings)', () => {
    const out = getDbRelationsFor(model, 'holding_prices').out
    expect(out.some((r) => r.table === 'holdings')).toBe(true)
  })

  it('getDbNeighbours is symmetrisch voor een FK', () => {
    const e = model.edges[0]
    expect(getDbNeighbours(model, e.from).has(e.to)).toBe(true)
    expect(getDbNeighbours(model, e.to).has(e.from)).toBe(true)
  })

  it('households is een hub met meerdere inkomende verwijzingen', () => {
    const inn = getDbRelationsFor(model, 'households').in
    expect(inn.length).toBeGreaterThan(2)
  })

  it('eigenaarschap/RLS is afgeleid uit de migraties', () => {
    const tx = model.tables.find((t) => t.name === 'transactions')
    expect(tx?.user).toBe(true)
    expect(tx?.rls).toBe(true)
  })
})
