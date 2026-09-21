import { describe, it, expect } from 'vitest'
import { buildDiffVlakken, vlakKleurVoor, type ChartPunt } from './scenario-diff-vlakken'

/**
 * Het verschilvlak tussen de basislijn en de wat-als-lijn. De inzet van deze tests is de
 * KRUISING: waar de twee lijnen elkaar snijden moet het vlak op precies dat punt van kleur
 * wisselen, niet op het eerstvolgende meetpunt — anders steekt er een rood vlak boven de
 * basislijn uit en zegt de kleur iets anders dan de lijnen.
 */

const basis: ChartPunt[] = [
  [40, 100],
  [41, 110],
  [42, 120],
  [43, 130],
]

describe('buildDiffVlakken — één kant', () => {
  it('wat-als volledig boven de basis geeft één groen vlak', () => {
    const watAls: ChartPunt[] = basis.map(([a, v]) => [a, v + 20])
    const vlakken = buildDiffVlakken(basis, watAls)
    expect(vlakken).toHaveLength(1)
    expect(vlakken[0].kant).toBe('boven')
    // Heen over de wat-als (4 punten), terug over de basis (4 punten) = een gesloten omtrek.
    expect(vlakken[0].punten).toHaveLength(8)
    expect(vlakken[0].punten[0]).toEqual([40, 120])
    expect(vlakken[0].punten.at(-1)).toEqual([40, 100])
  })

  it('wat-als volledig onder de basis geeft één rood vlak', () => {
    const watAls: ChartPunt[] = basis.map(([a, v]) => [a, v - 15])
    const vlakken = buildDiffVlakken(basis, watAls)
    expect(vlakken).toHaveLength(1)
    expect(vlakken[0].kant).toBe('onder')
  })

  it('twee identieke lijnen geven geen vlak (niets te arceren)', () => {
    expect(buildDiffVlakken(basis, basis)).toEqual([])
  })
})

describe('buildDiffVlakken — de kruising', () => {
  it('splitst op het geïnterpoleerde snijpunt, niet op het meetpunt erna', () => {
    // Start 20 boven, eindigt 20 onder; het snijpunt ligt exact halverwege 41 en 42.
    const watAls: ChartPunt[] = [
      [40, 120],
      [41, 120],
      [42, 100],
      [43, 110],
    ]
    const vlakken = buildDiffVlakken(basis, watAls)
    expect(vlakken.map((v) => v.kant)).toEqual(['boven', 'onder'])

    // Op 41 is het verschil +10, op 42 is het −20 ⇒ t = 10/30 ⇒ leeftijd 41,333…
    const kruisVanBoven = vlakken[0].punten.find(([a]) => a > 41 && a < 42)!
    expect(kruisVanBoven[0]).toBeCloseTo(41 + 1 / 3, 6)
    // De waarde op het snijpunt ligt op de BASISlijn (daar raken ze elkaar): 110 + ⅓·10.
    expect(kruisVanBoven[1]).toBeCloseTo(110 + 10 / 3, 6)

    // Beide vlakken delen dat punt exact — geen gat en geen overlap.
    const kruisVanOnder = vlakken[1].punten.find(([a]) => a > 41 && a < 42)!
    expect(kruisVanOnder[0]).toBeCloseTo(kruisVanBoven[0], 9)
    expect(kruisVanOnder[1]).toBeCloseTo(kruisVanBoven[1], 9)
  })

  it('twee kruisingen geven drie vlakken in de goede volgorde', () => {
    const watAls: ChartPunt[] = [
      [40, 120], // boven
      [41, 100], // onder
      [42, 140], // boven
      [43, 150], // boven
    ]
    expect(buildDiffVlakken(basis, watAls).map((v) => v.kant)).toEqual(['boven', 'onder', 'boven'])
  })
})

describe('buildDiffVlakken — randgevallen', () => {
  it('gebruikt alleen leeftijden die in BEIDE reeksen zitten', () => {
    // De wat-als loopt een jaar langer door (bv. een ander plan-einde): dat jaar heeft
    // geen tweede rand en hoort dus niet in het vlak.
    const watAls: ChartPunt[] = [...basis.map(([a, v]): ChartPunt => [a, v + 10]), [44, 200]]
    const vlakken = buildDiffVlakken(basis, watAls)
    expect(vlakken).toHaveLength(1)
    expect(vlakken[0].punten.every(([a]) => a <= 43)).toBe(true)
  })

  it('minder dan twee gedeelde leeftijden geeft geen vlak', () => {
    expect(buildDiffVlakken(basis, [[40, 200]])).toEqual([])
    expect(buildDiffVlakken([], [])).toEqual([])
  })

  it('negeert niet-eindige waarden in plaats van een NaN-pad te maken', () => {
    const watAls: ChartPunt[] = [
      [40, 120],
      [41, Number.NaN],
      [42, 140],
      [43, 150],
    ]
    const vlakken = buildDiffVlakken(basis, watAls)
    expect(vlakken.flatMap((v) => v.punten).every(([a, w]) => Number.isFinite(a) && Number.isFinite(w))).toBe(true)
  })

  it('de drempel laat een haarfijne sliver weg', () => {
    // Een verschil van 1 op een schaal van 100: met drempel 5 is dat "gelijk".
    const watAls: ChartPunt[] = basis.map(([a, v]) => [a, v + 1])
    expect(buildDiffVlakken(basis, watAls, 5)).toEqual([])
    expect(buildDiffVlakken(basis, watAls, 0)).toHaveLength(1)
  })
})

/**
 * De KLEURREGEL van het vlak (eigenaarsbesluit 20 sep 2026). Puur getest omdat precies hier
 * de tegenspraak zat die de eigenaar meldde: het vlak schreeuwde rood terwijl de zone
 * "ruim gedekt" zei. Alle vier de takken, aan beide uiteinden.
 */
describe('vlakKleurVoor — rood is alleen alarm als het plan niet reikt', () => {
  it('boven de basislijn blijft altijd groen, wat de zone ook zegt', () => {
    for (const zone of ['rood', 'oranje', 'groen', null] as const) {
      expect(vlakKleurVoor('boven', zone)).toBe('var(--positive)')
    }
  })

  it('onder de basislijn met een gedekt plan is neutraal, niet rood', () => {
    expect(vlakKleurVoor('onder', 'groen')).toBe('var(--ink-3)')
    expect(vlakKleurVoor('onder', 'oranje')).toBe('var(--ink-3)')
  })

  it('onder de basislijn met een plan dat niet reikt blijft rood', () => {
    expect(vlakKleurVoor('onder', 'rood')).toBe('var(--negative)')
  })

  it('zonder oordeel (nog aan het rekenen) neutraal, geen alarm dat de kernel niet gaf', () => {
    expect(vlakKleurVoor('onder', null)).toBe('var(--ink-3)')
  })

  it('gebruikt alleen semantische tokens, nooit een instelbaar module-accent', () => {
    const kleuren = (['boven', 'onder'] as const).flatMap((kant) =>
      (['rood', 'oranje', 'groen', null] as const).map((z) => vlakKleurVoor(kant, z)),
    )
    expect(kleuren.every((k) => /^var\(--(positive|negative|ink-3)\)$/.test(k))).toBe(true)
  })
})
