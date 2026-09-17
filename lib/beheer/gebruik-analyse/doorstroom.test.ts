import { describe, it, expect } from 'vitest'
import { GEBRUIK_K } from './onderdrukking'
import { DoorstroomRuwSchema, naarSankey, type DoorstroomRuw } from './doorstroom'

const KNOPEN = ['a', 'b', '_meerdere', '_geen'] as const
const NAAR = [...KNOPEN, '_stopt'] as const

/**
 * Bouw een ruwe doorstroom uit een 2×3-matrix voor dag 1 → 2: rijen a, b (dag 1),
 * kolommen a, b, stopt. Wie doorgaat heeft precies 2 dagen en stopt daarna.
 * Alle andere knopen zijn 0 — zo speelt de test met de echte functie.
 */
function uitMatrix(m: number[][]): DoorstroomRuw {
  const rij = m.map((r) => r.reduce((x, y) => x + y, 0))
  const t1 = rij.reduce((x, y) => x + y, 0)
  const kol = [0, 1].map((j) => m.reduce((x, r) => x + r[j], 0))
  const stopt1 = m.reduce((x, r) => x + r[2], 0)
  const t2 = t1 - stopt1
  const knopen = (waarden: number[]) => KNOPEN.map((knoop, i) => ({ knoop, gebruikers: waarden[i] ?? 0 }))
  const cellen = (vanStap: number, matrix: number[][]) =>
    KNOPEN.flatMap((van, r) => NAAR.map((naar, c) => ({ van_stap: vanStap, van, naar, gebruikers: matrix[r]?.[c] ?? 0 })))
  const m1 = [
    [m[0][0], m[0][1], 0, 0, m[0][2]],
    [m[1][0], m[1][1], 0, 0, m[1][2]],
  ]
  const m2 = [
    [0, 0, 0, 0, kol[0]],
    [0, 0, 0, 0, kol[1]],
  ]
  return {
    k: 5,
    venster_dagen: 90,
    band: { van_dagen_geleden: 30, tot_dagen_geleden: 89 },
    intern: false,
    max_stap: 4,
    actief_venster: t1,
    dagen_verdeling: [
      { aantal: 1, gebruikers: stopt1 },
      { aantal: 2, gebruikers: t2 },
      { aantal: 3, gebruikers: 0 },
      { aantal: 4, gebruikers: 0 },
      { aantal: 5, gebruikers: 0 },
    ],
    stappen: [
      { stap: 1, totaal: t1, knopen: knopen(rij) },
      { stap: 2, totaal: t2, knopen: knopen(kol) },
      { stap: 3, totaal: 0, knopen: knopen([]) },
      { stap: 4, totaal: 0, knopen: knopen([]) },
    ],
    overgangen: [...cellen(1, m1), ...cellen(2, m2), ...cellen(3, [])],
  }
}

describe('naarSankey', () => {
  it('de gebouwde invoer past op het contract', () => {
    expect(DoorstroomRuwSchema.safeParse(uitMatrix([[6, 5, 7], [5, 6, 8]])).success).toBe(true)
  })

  it('alles ≥ k: knopen, dagtotalen en overgangen zichtbaar', () => {
    const s = naarSankey(uitMatrix([[6, 5, 7], [5, 6, 8]]))
    expect(s.stappen[0].totaal).toEqual({ soort: 'waarde', n: 37 })
    expect(s.overgangen[0].zichtbaar).toBe(true)
    expect(s.overgangen[0].cellen.find((c) => c.van === 'a' && c.naar === '_stopt')?.gebruikers).toEqual({ soort: 'waarde', n: 7 })
  })

  it('één kleine overgang: die hele overgang dicht, knopen blijven', () => {
    const s = naarSankey(uitMatrix([[6, 3, 7], [5, 6, 8]]))
    expect(s.overgangen[0].zichtbaar).toBe(false)
    expect(s.overgangen[0].cellen).toEqual([])
    expect(s.stappen[0].knopen[0].gebruikers).toEqual({ soort: 'waarde', n: 16 })
  })

  it('dagenverdeling niet volledig zichtbaar: dagtotaal 2+ en alle overgangen dicht', () => {
    // 2 + 1 = 3 gebruikers met precies 2 dagen → klein → dagenverdeling dicht.
    const s = naarSankey(uitMatrix([[2, 0, 7], [0, 1, 8]]))
    expect(s.dagenVerdeling.verdeling.some((d) => d.gebruikers.soort === 'verborgen')).toBe(true)
    expect(s.stappen[1].totaal.soort).toBe('verborgen')
    expect(s.overgangen.every((o) => !o.zichtbaar)).toBe(true)
  })

  it('eigenschap: een lezer die het algoritme kent, kan geen kleine overgang exact bepalen (2×3, som ≤ 12)', () => {
    const zicht = new Map<string, number[][][]>()
    const bouw = (pre: number[], rest: number) => {
      if (pre.length === 6) {
        const m = [pre.slice(0, 3), pre.slice(3, 6)]
        const sleutel = JSON.stringify(naarSankey(uitMatrix(m)))
        zicht.set(sleutel, [...(zicht.get(sleutel) ?? []), m])
        return
      }
      for (let x = 0; x <= rest; x++) bouw([...pre, x], rest - x)
    }
    bouw([], 12)
    let getoetst = 0
    for (const groep of zicht.values()) {
      for (const echt of groep) {
        for (let r = 0; r < 2; r++)
          for (let c = 0; c < 3; c++) {
            const v = echt[r][c]
            if (v < 1 || v >= GEBRUIK_K) continue
            getoetst++
            expect(new Set(groep.map((g) => g[r][c])).size, `${JSON.stringify(echt)} [${r},${c}]`).toBeGreaterThan(1)
          }
      }
    }
    expect(getoetst).toBeGreaterThan(1000)
  })
})
