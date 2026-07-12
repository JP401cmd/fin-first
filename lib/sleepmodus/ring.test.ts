import { describe, it, expect } from 'vitest'
import { RING_SLOTS, MAX_RING_BUDGETS, assignRingSlots, childClusterFor, childPreviewFor, isInsideCluster } from './ring'

type P = {
  id: string
  budget_type: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
  sort_order: number
}

function parent(id: string, sort_order: number, budget_type: P['budget_type'] = 'expense'): P {
  return { id, budget_type, sort_order }
}

describe('RING_SLOTS', () => {
  it('definieert 9 unieke posities binnen het speelveld', () => {
    expect(RING_SLOTS).toHaveLength(9)
    const keys = new Set(RING_SLOTS.map((s) => `${s.x},${s.y}`))
    expect(keys.size).toBe(9)
    for (const s of RING_SLOTS) {
      expect(s.x).toBeGreaterThanOrEqual(8)
      expect(s.x).toBeLessThanOrEqual(92)
      expect(s.y).toBeGreaterThanOrEqual(8)
      expect(s.y).toBeLessThanOrEqual(92)
    }
  })

  it('houdt het centrum (50%,50%) vrij voor de transactie-bol', () => {
    for (const s of RING_SLOTS) {
      const dist = Math.hypot(s.x - 50, s.y - 50)
      expect(dist).toBeGreaterThan(20)
    }
  })
})

describe('assignRingSlots', () => {
  it('sluit archive-parents (eigen rekening) uit van de ring', () => {
    const parents = [parent('a', 0), parent('eigen', 99, 'archive'), parent('b', 1)]
    const { slotted, overflow } = assignRingSlots(parents, new Map())
    expect(slotted.map((s) => s.budget.id)).toEqual(['a', 'b'])
    expect(overflow).toHaveLength(0)
  })

  it('plaatst ≤9 parents allemaal, in sort_order-volgorde', () => {
    const parents = [parent('c', 2), parent('a', 0), parent('b', 1)]
    const { slotted, overflow } = assignRingSlots(parents, new Map())
    expect(slotted.map((s) => s.budget.id)).toEqual(['a', 'b', 'c'])
    expect(slotted.map((s) => s.slot)).toEqual([0, 1, 2])
    expect(overflow).toHaveLength(0)
  })

  it('bij >9 parents: top-8 op gebruik op slots 0-7, rest naar overflow (slot 8 = Meer-bol)', () => {
    const parents = Array.from({ length: 12 }, (_, i) => parent(`p${i}`, i))
    const usage = new Map<string, number>(parents.map((p, i) => [p.id, i])) // p11 meest gebruikt
    const { slotted, overflow } = assignRingSlots(parents, usage)
    expect(slotted).toHaveLength(8)
    expect(overflow).toHaveLength(4)
    // top-8 op gebruik: p4..p11; overflow: p0..p3
    expect(new Set(slotted.map((s) => s.budget.id))).toEqual(new Set(['p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']))
    expect(overflow.map((b) => b.id)).toEqual(['p0', 'p1', 'p2', 'p3'])
    // slots 0-7, en de geselecteerde parents staan op sort_order-volgorde (spiergeheugen)
    expect(slotted.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(slotted.map((s) => s.budget.id)).toEqual(['p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'])
  })

  it('is deterministisch bij gelijk gebruik (tiebreak op sort_order)', () => {
    const parents = Array.from({ length: 10 }, (_, i) => parent(`p${i}`, i))
    const a = assignRingSlots(parents, new Map())
    const b = assignRingSlots(parents, new Map())
    expect(a).toEqual(b)
    // zonder usage wint de laagste sort_order
    expect(a.overflow.map((x) => x.id)).toEqual(['p8', 'p9'])
  })
})

describe('childClusterFor', () => {
  it('groepeert children als waaier rond de parent-positie, niet op de ringslots', () => {
    const cluster = childClusterFor(1, 4) // parent-slot 1 = boven-midden
    expect(cluster).toHaveLength(4)
    const parent = RING_SLOTS[1]
    for (const pos of cluster) {
      const dist = Math.hypot(pos.x - parent.x, pos.y - parent.y)
      // dicht bij de parent (cluster), maar niet eróp
      expect(dist).toBeGreaterThanOrEqual(10)
      expect(dist).toBeLessThanOrEqual(30)
      // niet samenvallend met een ander ringslot (zou andere hoofdbudgetten afdekken)
      for (let s = 0; s < RING_SLOTS.length; s++) {
        if (s === 1) continue
        expect(Math.hypot(pos.x - RING_SLOTS[s].x, pos.y - RING_SLOTS[s].y)).toBeGreaterThan(8)
      }
    }
  })

  it('blijft binnen de veldgrenzen, ook vanaf rand-slots', () => {
    for (let slot = 0; slot < RING_SLOTS.length; slot++) {
      for (const pos of childClusterFor(slot, 6)) {
        expect(pos.x).toBeGreaterThanOrEqual(6)
        expect(pos.x).toBeLessThanOrEqual(94)
        expect(pos.y).toBeGreaterThanOrEqual(6)
        expect(pos.y).toBeLessThanOrEqual(94)
      }
    }
  })

  it('waaiert richting het veldmidden (gemiddelde ligt dichter bij het centrum dan de parent)', () => {
    for (const slot of [0, 3, 6, 8]) {
      const cluster = childClusterFor(slot, 4)
      const avg = cluster.reduce((a, p) => ({ x: a.x + p.x / cluster.length, y: a.y + p.y / cluster.length }), { x: 0, y: 0 })
      const parent = RING_SLOTS[slot]
      const dAvg = Math.hypot(avg.x - 50, avg.y - 50)
      const dParent = Math.hypot(parent.x - 50, parent.y - 50)
      expect(dAvg).toBeLessThan(dParent)
    }
  })

  it('posities zijn onderling uniek en gespreid', () => {
    const cluster = childClusterFor(4, 5)
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        expect(Math.hypot(cluster[i].x - cluster[j].x, cluster[i].y - cluster[j].y)).toBeGreaterThan(10)
      }
    }
  })
})

describe('childPreviewFor', () => {
  it('miniaturen liggen op dezelfde stralen als het cluster, maar dichter bij de parent', () => {
    const slot = 1
    const parent = RING_SLOTS[slot]
    const cluster = childClusterFor(slot, 4)
    const preview = childPreviewFor(slot, 4)
    expect(preview).toHaveLength(4)
    preview.forEach((mini, i) => {
      const dMini = Math.hypot(mini.x - parent.x, mini.y - parent.y)
      const dCluster = Math.hypot(cluster[i].x - parent.x, cluster[i].y - parent.y)
      expect(dMini).toBeGreaterThan(3)
      expect(dMini).toBeLessThan(dCluster)
      // zelfde richting: hoekverschil verwaarloosbaar
      const aMini = Math.atan2(mini.y - parent.y, mini.x - parent.x)
      const aCluster = Math.atan2(cluster[i].y - parent.y, cluster[i].x - parent.x)
      expect(Math.abs(aMini - aCluster)).toBeLessThan(0.2)
    })
  })
})

describe('isInsideCluster', () => {
  it('binnen de deelbudget-ring → true, erbuiten → false', () => {
    const slot = 1
    const parent = RING_SLOTS[slot]
    expect(isInsideCluster({ x: parent.x, y: parent.y }, slot)).toBe(true)
    const cluster = childClusterFor(slot, 3)
    expect(isInsideCluster(cluster[0], slot)).toBe(true)
    // ver buiten het cluster (veldcentrum onderin)
    expect(isInsideCluster({ x: 50, y: 90 }, slot)).toBe(false)
    expect(isInsideCluster({ x: 6, y: 90 }, slot)).toBe(false)
  })

  // Regressie: bij >6 deelbudgetten waaieren de children over een 2e ring. Die
  // buitenste rij MOET binnen de sluitgrens vallen met marge — anders sluit de
  // waaier precies op de 2e-rij-bollen en zijn ze met slepen onbereikbaar
  // (de oorspronkelijke bug: CLUSTER_RADIUS_OUTER === sluitgrens, nul marge).
  it('houdt óók de 2e-rij-deelbudgetten (count > 6) ruim binnen de sluitgrens', () => {
    for (const count of [7, 8, 10, 12]) {
      for (let slot = 0; slot < RING_SLOTS.length; slot++) {
        const parent = RING_SLOTS[slot]
        const cluster = childClusterFor(slot, count)
        cluster.forEach((pos, i) => {
          const label = `child ${i} (count ${count}, slot ${slot})`
          // elke child (incl. de buitenste ring) valt binnen de sluitgrens …
          expect(isInsideCluster(pos, slot), `${label} valt buiten de sluitgrens`).toBe(true)
          // … én met een reële marge: een punt 4% veld verder dan de child valt
          // nog steeds binnen de sluitgrens, zodat een kleine overshoot of
          // floating-point-afronding de waaier niet meteen dichtklapt.
          const dist = Math.hypot(pos.x - parent.x, pos.y - parent.y)
          expect(
            isInsideCluster({ x: parent.x + dist + 4, y: parent.y }, slot),
            `${label} heeft <4% sluitmarge`,
          ).toBe(true)
        })
      }
    }
  })
})

describe('MAX_RING_BUDGETS', () => {
  it('is gelijk aan het aantal ringslots', () => {
    expect(MAX_RING_BUDGETS).toBe(RING_SLOTS.length)
  })
})
