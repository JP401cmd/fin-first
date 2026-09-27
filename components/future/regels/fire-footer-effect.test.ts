import { describe, expect, it } from 'vitest'
import type { RegelProjection } from '@/lib/future/regel-sim'
import { fireFooterEffect, fireFooterSleutel, piekInWeergave } from './shared'

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

/**
 * Plan zonder vrijheidsleeftijd (UX-onderzoek 27 sep 2026, besluit eigenaar "haalbaar op X,
 * anders het tekort"): de footer zei "Geen vergelijking" precies bij de gebruiker die de
 * terugkoppeling het hardst nodig heeft. Beide uitkomsten komen uit dezelfde twee runs:
 * `kernelStatus` (P!B93) en `maandHint` (P!B96, €/mnd), pure doorgifte uit runRegelProjection.
 */
describe('fireFooterEffect — plan zonder vrijheidsleeftijd', () => {
  const nietHaalbaar = (maandHint = 1_900) =>
    proj({ fireAgeFractional: null, kernelStatus: 'unreachable_within_horizon', maandHint })
  const lening = (piek: number, inflationFactor = 1) => ({ piek, leeftijd: 60, inflationFactor })
  const haalbaar = (leeftijd: number) => proj({ fireAgeFractional: leeftijd, kernelStatus: 'reached_at', maandHint: -250 })

  it('basis niet haalbaar, concept wel → wordt haalbaar met de vrijheidsleeftijd van het concept', () => {
    expect(fireFooterEffect(nietHaalbaar(), haalbaar(58.4166))).toEqual({ kind: 'wordt-haalbaar', leeftijd: 58.4166 })
  })

  it('wordt haalbaar geldt ook voor "reached_now" (concept kan meteen stoppen)', () => {
    const nu = proj({ fireAgeFractional: 42, kernelStatus: 'reached_now', maandHint: -900 })
    expect(fireFooterEffect(nietHaalbaar(), nu)).toEqual({ kind: 'wordt-haalbaar', leeftijd: 42 })
  })

  it('concept onder een vast anker mét tekort is NIET haalbaar (leeftijd = stopmoment) → tekort A → B', () => {
    for (const kernelStatus of ['anchor_shortfall', 'pension_shortfall', 'stop_now_shortfall'] as const) {
      const aowAnker = proj({ fireAgeFractional: 67.25, kernelStatus, maandHint: 1_400 })
      expect(fireFooterEffect(nietHaalbaar(1_900), aowAnker)).toEqual({ kind: 'tekort', van: 1_900, naar: 1_400 })
    }
  })

  it("beide niet haalbaar → tekort A → B in hele euro's per maand (afronding zoals de plan-melding)", () => {
    expect(fireFooterEffect(nietHaalbaar(1_873.4), nietHaalbaar(1_402.6))).toEqual({ kind: 'tekort', van: 1_873, naar: 1_403 })
    // Omhoog kan ook (rendement 7 → 5%).
    expect(fireFooterEffect(nietHaalbaar(1_400), nietHaalbaar(1_900))).toEqual({ kind: 'tekort', van: 1_400, naar: 1_900 })
    // Gelijk na afronding blijft een tekort-uitkomst (de tekst zegt dan "blijft").
    expect(fireFooterEffect(nietHaalbaar(1_900.2), nietHaalbaar(1_899.8))).toEqual({ kind: 'tekort', van: 1_900, naar: 1_900 })
  })

  it('basis vast anker mét tekort, concept zonder vrijheidsleeftijd → ook tekort A → B', () => {
    const basis = proj({ fireAgeFractional: 60, kernelStatus: 'anchor_shortfall', maandHint: 800 })
    expect(fireFooterEffect(basis, nietHaalbaar(1_100))).toEqual({ kind: 'tekort', van: 800, naar: 1_100 })
  })

  it('geen maatstaf → onbekend (ADR 0131: onbekend is geen nul)', () => {
    // Hint ontbreekt, is niet eindig, of is ≤ 0 (bv. V26/ADR 0149-onhaalbaarheid met gap ≥ 0).
    const zonderHint = proj({ fireAgeFractional: null, kernelStatus: 'unreachable_within_horizon' })
    expect(fireFooterEffect(zonderHint, nietHaalbaar(1_400))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(nietHaalbaar(1_900), nietHaalbaar(Number.NaN))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(nietHaalbaar(1_900), nietHaalbaar(Number.POSITIVE_INFINITY))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(nietHaalbaar(0), nietHaalbaar(1_400))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(nietHaalbaar(1_900), nietHaalbaar(-50))).toEqual({ kind: 'onbekend' })
    // 0,4 rondt af op € 0 — ook geen tekort om te tonen.
    expect(fireFooterEffect(nietHaalbaar(1_900), nietHaalbaar(0.4))).toEqual({ kind: 'onbekend' })
  })

  it('mislukte run (geen rijen) of een leeftijd zonder status → onbekend, nooit "wordt haalbaar"', () => {
    const leeg: RegelProjection = { rows: [], fireAgeFractional: null }
    expect(fireFooterEffect(leeg, haalbaar(58))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(nietHaalbaar(), leeg)).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(nietHaalbaar(), proj({ fireAgeFractional: 58 }))).toEqual({ kind: 'onbekend' })
  })

  it('basis haalbaar, concept niet → wordt niet haalbaar met het maandtekort van het concept', () => {
    expect(fireFooterEffect(haalbaar(58), nietHaalbaar(1_400.4))).toEqual({
      kind: 'wordt-niet-haalbaar',
      maat: { soort: 'maand', euro: 1_400 },
    })
  })

  it('basis haalbaar, concept niet zonder maandtekort maar mét leningpiek → wordt niet haalbaar met de piek', () => {
    const concept = { ...nietHaalbaar(-300), tekortLening: lening(42_000, 1.5) }
    expect(fireFooterEffect(haalbaar(58), concept)).toEqual({
      kind: 'wordt-niet-haalbaar',
      maat: { soort: 'lening', piek: { nominaal: 42_000, inflationFactor: 1.5 } },
    })
  })

  it('basis haalbaar, concept niet zonder enige maatstaf → onbekend', () => {
    expect(fireFooterEffect(haalbaar(58), nietHaalbaar(0))).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect(haalbaar(58), { ...nietHaalbaar(-1), tekortLening: null })).toEqual({ kind: 'onbekend' })
  })

  it('beide niet haalbaar zonder maandtekort (ADR 0149-klasse) → tekort-leningpiek vóór → ná, nominaal met eigen factor', () => {
    const b = { ...nietHaalbaar(-2_468), tekortLening: lening(42_000, 1.4) }
    const d = { ...nietHaalbaar(-2_100), tekortLening: lening(31_000, 1.3) }
    expect(fireFooterEffect(b, d)).toEqual({
      kind: 'tekort-lening',
      van: { nominaal: 42_000, inflationFactor: 1.4 },
      naar: { nominaal: 31_000, inflationFactor: 1.3 },
    })
  })

  it('maandtekort wint van de piek zodra béíde runs er een hebben; anders de piek (omslag)', () => {
    const metBeide = (h: number, piek: number) => ({ ...nietHaalbaar(h), tekortLening: lening(piek) })
    expect(fireFooterEffect(metBeide(1_900, 50_000), metBeide(1_400, 40_000)).kind).toBe('tekort')
    // Omslag: basis heeft een maandtekort, het concept alleen nog een piek → de piek van beide.
    expect(fireFooterEffect(metBeide(1_900, 50_000), metBeide(-10, 40_000))).toEqual({
      kind: 'tekort-lening',
      van: { nominaal: 50_000, inflationFactor: 1 },
      naar: { nominaal: 40_000, inflationFactor: 1 },
    })
    // En andersom.
    expect(fireFooterEffect(metBeide(-10, 50_000), metBeide(1_400, 40_000)).kind).toBe('tekort-lening')
  })

  it('beide niet haalbaar, één run zonder maandtekort én zonder piek (V26-klasse) → onbekend', () => {
    const v26 = { ...nietHaalbaar(-50), tekortLening: null }
    expect(fireFooterEffect(v26, { ...nietHaalbaar(-50), tekortLening: lening(10_000) })).toEqual({ kind: 'onbekend' })
    expect(fireFooterEffect({ ...nietHaalbaar(1_900), tekortLening: lening(10_000) }, v26)).toEqual({ kind: 'onbekend' })
  })

  it('regressie: hebben beide runs een vrijheidsleeftijd, dan telt alleen de bestaande treden-logica', () => {
    // Twee vaste ankers mét tekort: nog steeds "maanden", niet het tekort.
    const a = proj({ fireAgeFractional: 60, kernelStatus: 'anchor_shortfall', maandHint: 800 })
    const b = proj({ fireAgeFractional: 67, kernelStatus: 'anchor_shortfall', maandHint: 300 })
    expect(fireFooterEffect(a, b)).toEqual({ kind: 'maanden', maanden: 84 })
  })

  it('de sleutel verandert mee met het concept-tekort', () => {
    expect(fireFooterSleutel(nietHaalbaar(1_900), nietHaalbaar(1_400))).not.toBe(
      fireFooterSleutel(nietHaalbaar(1_900), nietHaalbaar(1_300)),
    )
  })
})

describe('afronding in hele euro’s (besluit eigenaar 27 sep 2026: hetzelfde getal als de melding)', () => {
  const nh = (maandHint: number) => proj({ fireAgeFractional: null, kernelStatus: 'unreachable_within_horizon', maandHint })

  it('maandtekort: Math.round, net als antwoordMinderUitgeven (fmtHint)', () => {
    expect(fireFooterEffect(nh(1_873.49), nh(1_402.5))).toEqual({ kind: 'tekort', van: 1_873, naar: 1_403 })
  })

  it('leningpiek: exact één keer gedeflateerd met de eigen factor, dan hele euro’s', () => {
    const p = { nominaal: 42_000, inflationFactor: 1.4 }
    expect(piekInWeergave(p, 'real')).toBe(30_000)
    expect(piekInWeergave({ nominaal: 31_001, inflationFactor: 1.3 }, 'real')).toBe(23_847) // 23.846,92…
    // Nominale weergave: ongewijzigd (geen factor), geen tweede deling.
    expect(piekInWeergave(p, 'nominal')).toBe(42_000)
    // Onbruikbare factor valt terug op het nominale bedrag, zoals deflate() dat doet.
    expect(piekInWeergave({ nominaal: 42_000, inflationFactor: 0 }, 'real')).toBe(42_000)
  })
})
