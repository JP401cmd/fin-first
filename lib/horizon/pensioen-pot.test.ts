/**
 * `pensioenPortfolio` — de resterende pensioenpot per projectierij.
 *
 * De claim die deze suite bewaakt: de grondslag is de KERN-categorie 'Pensioen'
 * (`ASSET_TYPE_TO_CATEGORIE`), niet het app-type `retirement`. Twee app-typen mappen
 * daarop — `retirement` en `levensverzekering` — en de onttrekkings-lever van de
 * fiscale optimizer stuurt op die categorie, niet op het type. Een implementatie met
 * een eigen lijstje zou de pot onderschatten met precies het deel dat de lever
 * meeverschuift.
 *
 * Tolerantie-keuze: alle vergelijkingen zijn EXACT (`toBe`). Het gaat om een
 * optelling van dezelfde floats, niet om een meting — een tolerantie zou hier de ene
 * foutklasse verbergen die telt (een ontbrekende of te veel getelde term).
 */

import { describe, expect, it } from 'vitest'
import type { UnifiedProjectionRow } from '../unified-projection'
import { ASSET_TYPE_TO_CATEGORIE } from '../horizon-kernel/adapter/potten'
import { PENSIOEN_CATEGORIE, pensioenPortfolio } from './pensioen-pot'

/** Minimale synthetische rij — alleen het veld dat deze functie leest. */
function mkRow(buckets: Record<string, { endValue?: number } | undefined>): UnifiedProjectionRow {
  return { assetBuckets: buckets } as unknown as UnifiedProjectionRow
}

describe('pensioenPortfolio', () => {
  it('telt BEIDE app-typen van de kern-categorie Pensioen', () => {
    const row = mkRow({
      retirement: { endValue: 300_000 },
      levensverzekering: { endValue: 28_000 },
    })
    expect(pensioenPortfolio(row)).toBe(328_000)
  })

  it('BIJT-PROEF — een retirement-only implementatie zou hier zakken', () => {
    const row = mkRow({ levensverzekering: { endValue: 28_000 } })
    expect(pensioenPortfolio(row)).toBe(28_000)
  })

  it('slaat alles buiten de categorie Pensioen over', () => {
    const row = mkRow({
      cash: { endValue: 30_000 },
      savings: { endValue: 45_000 },
      investment: { endValue: 300_000 },
      crypto: { endValue: 20_000 },
      eigen_huis: { endValue: 560_000 },
      real_estate: { endValue: 185_000 },
      vehicle: { endValue: 28_000 },
      physical: { endValue: 14_000 },
      deelneming: { endValue: 180_000 },
      vordering: { endValue: 35_000 },
      other: { endValue: 6_000 },
    })
    expect(pensioenPortfolio(row)).toBe(0)
  })

  it('geen pensioenbezit → 0, niet null (een lege pot is een echte nulstand)', () => {
    expect(pensioenPortfolio(mkRow({}))).toBe(0)
    expect(pensioenPortfolio({} as UnifiedProjectionRow)).toBe(0)
  })

  it('een bucket zonder endValue telt als 0 en laat de rest staan', () => {
    const row = mkRow({ retirement: {}, levensverzekering: { endValue: 1_000 } })
    expect(pensioenPortfolio(row)).toBe(1_000)
    expect(pensioenPortfolio(mkRow({ retirement: undefined }))).toBe(0)
  })

  it('een onbekende bucket-sleutel valt op Overig terug en telt niet mee', () => {
    // Spiegelt de `?? 'Overig'`-terugval van de adapter: een nieuw of onbekend
    // app-type mag nooit stil als pensioen meetellen.
    expect(pensioenPortfolio(mkRow({ nog_niet_bestaand: { endValue: 99_000 } }))).toBe(0)
  })

  it('negatieve waarden worden niet geklemd — een ondertekende pot hoort zichtbaar te zijn', () => {
    // Spiegelt de keuze in `spendablePortfolio`: de kern levert per constructie
    // ≥ 0 (Math.max(0, …) in bez.ts). Zou dat ooit breken, dan is dát de bug —
    // deze functie maakt hem zichtbaar in plaats van hem weg te clampen.
    expect(pensioenPortfolio(mkRow({ retirement: { endValue: -5 } }))).toBe(-5)
  })

  it('de canonieke mapping is de bron: beide typen wijzen naar dezelfde categorie', () => {
    // Geen tweede lijst: verschuift iemand `levensverzekering` naar een andere
    // kern-categorie, dan is dat een BESLUIT dat hier zichtbaar wordt.
    expect(ASSET_TYPE_TO_CATEGORIE.retirement).toBe(PENSIOEN_CATEGORIE)
    expect(ASSET_TYPE_TO_CATEGORIE.levensverzekering).toBe(PENSIOEN_CATEGORIE)
  })
})
