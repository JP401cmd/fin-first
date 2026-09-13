import { describe, expect, it } from 'vitest'
import type { RegelProjection } from '@/lib/future/regel-sim'
import { fireFooterEffect, fireFooterSleutel } from './shared'

/**
 * Live footer in drie treden (TPR-15, restpunt): bij een account dat al kan stoppen (Tessa)
 * blijft de vrijheidsdatum bij elke keuze gelijk; de footer zei dan "geen verschil" terwijl het
 * eindbedrag wel verschoof. Gepind: maanden → reikt tot → over aan het einde (euro's van
 * vandaag, één keer gedeflateerd per eindrij, afgerond op duizenden) → geen.
 */

function proj(p: Partial<RegelProjection>): RegelProjection {
  return { rows: [{ age: 42 } as RegelProjection['rows'][number]], fireAgeFractional: 42, ...p }
}
const gedekt = { kind: 'gedekt', endAge: 90 } as const
const einde = (nominaal: number, inflationFactor = 2) => ({ leeftijd: 89, nominaal, inflationFactor })

describe('fireFooterEffect', () => {
  it('trede 1: de vrijheidsdatum schuift → maanden', () => {
    expect(fireFooterEffect(proj({ fireAgeFractional: 50 }), proj({ fireAgeFractional: 49.5 }))).toEqual({
      kind: 'maanden',
      maanden: -6,
    })
  })

  it('zonder vrijheidsleeftijd in één van beide: onbekend', () => {
    expect(fireFooterEffect(proj({ fireAgeFractional: null }), proj({}))).toEqual({ kind: 'onbekend' })
  })

  it('trede 2: datum gelijk, geld reikt minder ver', () => {
    const e = fireFooterEffect(proj({ reach: gedekt }), proj({ reach: { kind: 'reikt-tot', age: 84.6, endAge: 90 } }))
    expect(e).toEqual({ kind: 'reikt', totLeeftijd: 84, eerder: true })
  })

  it('trede 2: datum gelijk, geld reikt nu tot het einde', () => {
    const e = fireFooterEffect(proj({ reach: { kind: 'reikt-tot', age: 80, endAge: 90 } }), proj({ reach: gedekt }))
    expect(e).toEqual({ kind: 'reikt', totLeeftijd: null, eerder: false })
  })

  it('trede 3: beide tot het einde → verschil aan het einde in euro\'s van vandaag, afgerond', () => {
    // Nominaal 1.000.000 vs 1.030.000 bij factor 2 → 500.000 vs 515.000 vandaag → +15.000.
    const e = fireFooterEffect(
      proj({ reach: gedekt, eindeLiquide: einde(1_000_000) }),
      proj({ reach: gedekt, eindeLiquide: einde(1_030_000) }),
    )
    expect(e).toEqual({ kind: 'einde', euro: 15_000 })
  })

  it('trede 3: elk bedrag met de factor van zijn eigen eindrij (niet twee keer, niet met één factor)', () => {
    const e = fireFooterEffect(
      proj({ reach: gedekt, eindeLiquide: einde(1_000_000, 2) }),
      proj({ reach: gedekt, eindeLiquide: einde(1_000_000, 2.5) }),
    )
    expect(e).toEqual({ kind: 'einde', euro: -100_000 })
  })

  it('verschil onder de afronding → geen verschil', () => {
    const e = fireFooterEffect(
      proj({ reach: gedekt, eindeLiquide: einde(1_000_000) }),
      proj({ reach: gedekt, eindeLiquide: einde(1_000_800) }),
    )
    expect(e).toEqual({ kind: 'geen' })
  })

  it('de sleutel verandert mee met trede 3, ook als de maanden gelijk blijven', () => {
    const basis = proj({ reach: gedekt, eindeLiquide: einde(1_000_000) })
    const a = fireFooterSleutel(basis, proj({ reach: gedekt, eindeLiquide: einde(1_030_000) }))
    const b = fireFooterSleutel(basis, proj({ reach: gedekt, eindeLiquide: einde(1_060_000) }))
    expect(a).not.toBe(b)
  })
})
