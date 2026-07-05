import { describe, expect, it } from 'vitest'
import { computeFlowLayout } from './flow-layout'
import { BEZIT_FLOW } from './bezit'

function parseViewBox(viewBox: string): { minX: number; minY: number; width: number; height: number } {
  const [minX, minY, width, height] = viewBox.split(' ').map(Number)
  return { minX, minY, width, height }
}

const EPS = 0.001

describe('computeFlowLayout(BEZIT_FLOW)', () => {
  const layout = computeFlowLayout(BEZIT_FLOW)

  it('plaatst één layout per flow-knoop', () => {
    expect(layout.nodes).toHaveLength(BEZIT_FLOW.nodes.length)
    const ids = new Set(layout.nodes.map((n) => n.node.id))
    expect(ids.size).toBe(BEZIT_FLOW.nodes.length)
  })

  it('produceert geen NaN in node-posities', () => {
    for (const n of layout.nodes) {
      for (const v of [n.x, n.y, n.w, n.h]) {
        expect(Number.isFinite(v)).toBe(true)
      }
    }
    expect(Number.isFinite(layout.width)).toBe(true)
    expect(Number.isFinite(layout.height)).toBe(true)
  })

  it('houdt elke knoop volledig binnen de viewBox', () => {
    const vb = parseViewBox(layout.viewBox)
    expect(vb.width).toBeCloseTo(layout.width, 1)
    expect(vb.height).toBeCloseTo(layout.height, 1)
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(vb.minX - EPS)
      expect(n.y).toBeGreaterThanOrEqual(vb.minY - EPS)
      expect(n.x + n.w).toBeLessThanOrEqual(vb.minX + vb.width + EPS)
      expect(n.y + n.h).toBeLessThanOrEqual(vb.minY + vb.height + EPS)
    }
  })

  it('plaatst geen twee knopen op exact dezelfde positie', () => {
    const seen = new Set<string>()
    for (const n of layout.nodes) {
      const key = `${n.x.toFixed(3)}|${n.y.toFixed(3)}`
      expect(seen.has(key), `dubbele positie voor knoop ${n.node.id}`).toBe(false)
      seen.add(key)
    }
  })

  it('is deterministisch (twee runs identiek)', () => {
    const again = computeFlowLayout(BEZIT_FLOW)
    expect(again).toEqual(layout)
  })

  it('legt voor elke edge een pad tussen bestaande knopen', () => {
    const laidOut = new Set(layout.nodes.map((n) => n.node.id))
    for (const e of layout.edges) {
      expect(laidOut.has(e.edge.from)).toBe(true)
      expect(laidOut.has(e.edge.to)).toBe(true)
      expect(e.points.length).toBeGreaterThanOrEqual(2)
      for (const p of e.points) {
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
      expect(e.path.startsWith('M')).toBe(true)
    }
  })

  it('rangschikt kolommen strikt links→rechts op stage', () => {
    const xByStage = new Map<number, number>()
    for (const n of layout.nodes) {
      // top-level knopen (geen insprong) bepalen de kolom-x
      if (!n.node.subOf) xByStage.set(n.node.stage, n.x)
    }
    const stages = [...xByStage.keys()].sort((a, b) => a - b)
    for (let i = 1; i < stages.length; i++) {
      expect(xByStage.get(stages[i])!).toBeGreaterThan(xByStage.get(stages[i - 1])!)
    }
  })
})
