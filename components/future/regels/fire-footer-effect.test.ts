import { describe, expect, it } from 'vitest'
import type { RegelProjection } from '@/lib/future/regel-sim'
import { fireFooterEffect, fireFooterSleutel } from './shared'

/**
 * Live footer in drie treden (TPR-15, restpunt + eindreview M4–M6): bij een account dat al kan
 * stoppen (Tessa) blijft de vrijheidsdatum bij elke keuze gelijk; de footer zei dan "geen
 * verschil" terwijl het eindbedrag wel verschoof. Gepind: maanden → bereik (hele jaren via
 * `leeftijdJaar`, dezelfde afronding als de overzichten; "tot het einde" = de eigen
 * eindleeftijd) → over aan het einde (elk bedrag één keer gedeflateerd en apart afgerond) →
 * geen; onbekend wanneer er niets te vergelijken valt.
 */

function proj(p: Partial<RegelProjection>): RegelProjection {
  return { rows: [{ age: 42 } as RegelProjection['rows'][number]], fireAgeFractional: 42, ...p }
}
const gedekt = (endAge: number | null = 90) => ({ kind: 'gedekt', endAge }) as const
const reiktTot = (age: number) => ({ kind: 'reikt-tot', age, endAge: 90 }) as const
const einde = (nominaal: number, inflationFactor = 2) => ({ leeftijd: 89, nominaal, inflationFactor })

describe('fireFooterEffect', () => {
  it('trede 1: de vrijheidsdatum schuift → maanden', () => {
    expect(fireFooterEffect(proj({ fireAgeFractional: 50 }), proj({ fireAgeFractional: 49.5 }))).toEqual({
      kind: 'maanden',
      maanden: -6,
    })
  })

  it('zonder vrijheidsleeftijd, zonder bereik of zonder eindbedrag: onbekend (niet "geen verschil")', () => {
    expect(fireFooterEffect(proj({ fireAgeFractional: null }), proj({}))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(proj({}), proj({ reach: gedekt() }))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(proj({ reach: gedekt() }), proj({ reach: gedekt() }))).toEqual({ kind: 'onbekend' })
  })

  it('trede 2: geld reikt minder ver — afgerond zoals de overzichten (84,6 → 85)', () => {
    const e = fireFooterEffect(proj({ reach: gedekt() }), proj({ reach: reiktTot(84.6) }))
    expect(e).toEqual({ kind: 'reikt', tot: { soort: 'leeftijd', leeftijd: 85 }, verder: false })
  })

  it('trede 2: geld reikt nu tot het einde', () => {
    const e = fireFooterEffect(proj({ reach: reiktTot(80) }), proj({ reach: gedekt() }))
    expect(e).toEqual({ kind: 'reikt', tot: { soort: 'einde', eindLeeftijd: 90 }, verder: true })
  })

  it('trede 2: een later plan-einde is verder, ook als het concept daar niet helemaal komt', () => {
    // Basis gedekt tot 90; concept (eindleeftijd 95) reikt tot 92 → verder, dus niet rood.
    const e = fireFooterEffect(proj({ reach: gedekt(90) }), proj({ reach: { kind: 'reikt-tot', age: 92, endAge: 95 } }))
    expect(e).toEqual({ kind: 'reikt', tot: { soort: 'leeftijd', leeftijd: 92 }, verder: true })
  })

  it('trede 2: "nu op" is een eigen uitkomst', () => {
    const e = fireFooterEffect(proj({ reach: reiktTot(42.7) }), proj({ reach: { kind: 'nu-op' } }))
    expect(e).toEqual({ kind: 'reikt', tot: { soort: 'nu-op' }, verder: false })
  })

  it('zelfde reikt-tot-jaar: geen verschil in bereik', () => {
    expect(fireFooterEffect(proj({ reach: reiktTot(84.2) }), proj({ reach: reiktTot(83.8) }))).toEqual({
      kind: 'geen',
      waarin: 'bereik',
    })
  })

  it("trede 3: beide tot hetzelfde einde → verschil aan het einde in euro's van vandaag", () => {
    // Nominaal 1.000.000 vs 1.030.000 bij factor 2 → 500.000 vs 515.000 vandaag → +15.000.
    const e = fireFooterEffect(
      proj({ reach: gedekt(), eindeLiquide: einde(1_000_000) }),
      proj({ reach: gedekt(), eindeLiquide: einde(1_030_000) }),
    )
    expect(e).toEqual({ kind: 'einde', euro: 15_000 })
  })

  it('trede 3: elk bedrag met de factor van zijn eigen eindrij (niet twee keer, niet met één factor)', () => {
    const e = fireFooterEffect(
      proj({ reach: gedekt(), eindeLiquide: einde(1_000_000, 2) }),
      proj({ reach: gedekt(), eindeLiquide: einde(1_000_000, 2.5) }),
    )
    expect(e).toEqual({ kind: 'einde', euro: -100_000 })
  })

  it('trede 3: apart afgerond zoals de overzichten — 500.499 vs 500.501 is wél 1.000 verschil', () => {
    const e = fireFooterEffect(
      proj({ reach: gedekt(), eindeLiquide: einde(500_499, 1) }),
      proj({ reach: gedekt(), eindeLiquide: einde(500_501, 1) }),
    )
    expect(e).toEqual({ kind: 'einde', euro: 1_000 })
    expect(
      fireFooterEffect(
        proj({ reach: gedekt(), eindeLiquide: einde(500_100, 1) }),
        proj({ reach: gedekt(), eindeLiquide: einde(500_400, 1) }),
      ),
    ).toEqual({ kind: 'geen', waarin: 'eindbedrag' })
  })

  it('de sleutel verandert mee met trede 3, ook als de maanden gelijk blijven', () => {
    const basis = proj({ reach: gedekt(), eindeLiquide: einde(1_000_000) })
    const a = fireFooterSleutel(basis, proj({ reach: gedekt(), eindeLiquide: einde(1_030_000) }))
    const b = fireFooterSleutel(basis, proj({ reach: gedekt(), eindeLiquide: einde(1_060_000) }))
    expect(a).not.toBe(b)
  })
})
