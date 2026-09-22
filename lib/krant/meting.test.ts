import { describe, expect, it } from 'vitest'
import { METING_K, onderdrukPerProfieltype, telProfieltype } from './meting'

describe('meting — lege edities per profieltype, onderdrukt (ADR 0146/0153)', () => {
  it('k is het huis-k', () => {
    expect(METING_K).toBe(5)
  })

  it('cellen onder k worden klein, en zodra er één klein is gaan de andere niet-nul cellen dicht (aanvullend)', () => {
    const uit = onderdrukPerProfieltype(
      { a: { edities: 7, leeg: 0 }, b: { edities: 2, leeg: 1 }, c: { edities: 0, leeg: 0 } },
      { edities: 9, leeg: 1 },
    )
    // Zodra één cel klein is, gaat élke niet-nul cel dicht (het patroon mag
    // niet verraden welke cel de kleine was): a én b 'verborgen'.
    expect(uit.b.edities).toBe('verborgen')
    expect(uit.a.edities).toBe('verborgen') // anders: 9 − 7 = 2
    expect(uit.c.edities).toBe(0) // nullen blijven zichtbaar (totaal > aantal cellen)
    // leeg: totaal 1 < k → alles klein
    expect(uit.a.leeg).toBe('klein')
    expect(uit.b.leeg).toBe('klein')
  })

  it('alle cellen op of boven k blijven zichtbaar', () => {
    const uit = onderdrukPerProfieltype({ a: { edities: 6, leeg: 5 }, b: { edities: 8, leeg: 0 } }, { edities: 14, leeg: 5 })
    expect(uit).toEqual({ a: { edities: 6, leeg: 5 }, b: { edities: 8, leeg: 0 } })
  })

  it('een lege verdeling blijft leeg; typen komen gesorteerd terug', () => {
    expect(onderdrukPerProfieltype({}, { edities: 0, leeg: 0 })).toEqual({})
    expect(Object.keys(onderdrukPerProfieltype({ z: { edities: 5, leeg: 0 }, a: { edities: 5, leeg: 0 } }, { edities: 10, leeg: 0 }))).toEqual(['a', 'z'])
  })

  it('telProfieltype telt edities en lege edities op', () => {
    const per: Record<string, { edities: number; leeg: number }> = {}
    telProfieltype(per, 'x', true)
    telProfieltype(per, 'x', false)
    telProfieltype(per, 'y', false)
    expect(per).toEqual({ x: { edities: 2, leeg: 1 }, y: { edities: 1, leeg: 0 } })
  })
})
