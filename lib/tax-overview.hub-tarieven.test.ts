/**
 * REGRESSIESLOT — "één grondslag per tarief" op de belasting-hub
 * (bevindingen C9 + M4, 26-08-2026).
 *
 * DE FOUT was géén rekenfout in een motor. Op /overzicht/belasting stonden twee
 * percentages naast elkaar die uit twee ANDERE bronnen kwamen dan de Box
 * 1-subpagina:
 *
 *  (a) "Marginaal 35,8%" kwam uit `fireParams.marginaalTarief` →
 *      `deriveMarginaalTarief()`, de FIRE-vuistregel die per constructie altijd
 *      één van twee vaste schijftarieven teruggeeft. De subpagina toont
 *      `computeBox1Tax().marginalRate` (56,0% bij dit inkomen, incl.
 *      heffingskorting-afbouw). 20,2 procentpunt verschil over hetzelfde
 *      inkomen — en de vuistregel KAN dat getal niet eens produceren.
 *
 *  (b) "Effectief 36,6%" kwam uit `total / grossYearlyIncome`, waarbij `total`
 *      óók de Box 3-VERMOGENSheffing bevatte terwijl de noemer uitsluitend het
 *      Box 1-INKOMEN was. Een teller/noemer-mismatch die met het vermogen
 *      meegroeit — en dus boven élk marginaal tarief uit kan komen. Effectief
 *      bóven marginaal kan in een progressief stelsel niet bestaan.
 *
 *  (c) M4: bij een ONBEKEND inkomen bleef (a) gewoon een getal tonen (de
 *      fallback-tak van de vuistregel), pal naast een Box 1-kaart die op
 *      hetzelfde scherm "Inkomen onbekend" meldde.
 *
 * DRIE LAGEN, want een unittest op `buildTaxOverview` alleen had dit nooit
 * gevangen (die functie klopte op zichzelf — hij kreeg de verkeerde invoer):
 *  1. de motor-invariant: effectief ≤ marginaal over het hele inkomensbereik;
 *  2. de aggregator: tarieven zijn pass-through, `total` beïnvloedt ze niet;
 *  3. een BRON-GRENDEL op de hub + de kansen-loader.
 *
 * TOLERANTIES — bewuste keuze:
 *  · De invariant (laag 1) vergelijkt twee FRACTIES in [0, 1]. Tolerantie is
 *    daarom ABSOLUUT in tariefpunten (1e-9), niet relatief: rond de
 *    inkomens waar beide tarieven ≈ 0 zijn (heffingskortingen > heffing) zou
 *    een relatieve marge oneindig oprekken, terwijl 1e-9 absoluut ruim onder
 *    élk fiscaal betekenisvol verschil ligt en alleen float-ruis van de
 *    numerieke afgeleide opvangt.
 *  · De A=B-vergelijkingen (laag 2/3) draaien op dezelfde deterministische
 *    functie met dezelfde invoer: EXACTE gelijkheid, geen tolerantie.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { buildTaxOverview } from './tax-overview'
import { computeBox1Tax, deriveMarginaalTarief, BOX1_PARAMS } from './box1-tax'
import { readSourceLF } from '@/lib/test-utils/read-source'

const YEAR = 2026 as const

/** Absolute ruisband op een tariefVERGELIJKING (fracties), zie kop. */
const TARIEF_RUIS = 1e-9

// ── 1. De motor-invariant: effectief ≤ marginaal ───────────────────────────

describe('invariant — het effectieve tarief ligt nooit boven het marginale', () => {
  it('geldt over het hele inkomensbereik (€0 – €400.000)', () => {
    const overtredingen: string[] = []
    for (let gross = 1_000; gross <= 400_000; gross += 1_000) {
      const r = computeBox1Tax({ grossYearlyIncome: gross, year: YEAR })
      if (r.effectiveRate > r.marginalRate + TARIEF_RUIS) {
        overtredingen.push(
          `€${gross}: effectief ${(r.effectiveRate * 100).toFixed(3)}% > marginaal ${(
            r.marginalRate * 100
          ).toFixed(3)}%`,
        )
      }
    }
    expect(overtredingen).toEqual([])
  })

  it('geldt ook met een eigen woning in de invoer (aftrekpost én bijtelling)', () => {
    for (const woning of [
      { wozValue: 400_000, hypotheekRente: 12_000 }, // netto aftrekpost
      { wozValue: 400_000, hypotheekRente: 0 }, // netto bijtelling (Wet Hillen)
    ]) {
      for (const gross of [30_000, 60_000, 93_369, 160_658, 300_000]) {
        const r = computeBox1Tax({ grossYearlyIncome: gross, year: YEAR, ...woning })
        expect(r.effectiveRate).toBeLessThanOrEqual(r.marginalRate + TARIEF_RUIS)
      }
    }
  })
})

// ── 2. Component (a): de vuistregel KAN het motortarief niet weergeven ─────

describe('C9 (a) — marginaal tarief: vuistregel vs. motor', () => {
  const GROSS = 93_369 // het inkomen uit de bevinding

  it('de motor kent de heffingskorting-afbouw, de vuistregel niet', () => {
    const motor = computeBox1Tax({ grossYearlyIncome: GROSS, year: YEAR }).marginalRate
    const schijven = BOX1_PARAMS[YEAR].schijven
    const laag = schijven[0].tarief
    const hoog = schijven[schijven.length - 1].tarief

    // De vuistregel retourneert ALTIJD exact één van deze twee — beide branches.
    expect(deriveMarginaalTarief({ year: YEAR })).toBe(laag)
    expect(deriveMarginaalTarief({ year: YEAR, netMonthlyIncome: 5_000 })).toBe(hoog)

    // Het motortarief ligt boven het toptarief (afbouw arbeidskorting) en is
    // dus met geen enkele branch van de vuistregel te benaderen.
    expect(motor).toBeGreaterThan(hoog)
    expect(motor - laag).toBeGreaterThan(0.15) // de 20,2pp-kloof uit de bevinding
  })

  it('de hub toont hetzelfde tarief als de Box 1-subpagina (zelfde motoraanroep)', () => {
    // A=B: beide oppervlakken draaien computeBox1Tax over dezelfde canonieke
    // bruto-grondslag + eigen-woning-invoer (C8). Exacte gelijkheid.
    const subpagina = computeBox1Tax({
      grossYearlyIncome: GROSS,
      year: YEAR,
      wozValue: 540_000,
      hypotheekRente: 9_300,
    })
    const hub = buildTaxOverview({
      box1Tax: Math.round(subpagina.tax),
      box2Tax: null,
      box3Tax: 599,
      effectiveRate: subpagina.effectiveRate,
      marginalRate: subpagina.marginalRate,
    })
    expect(hub.marginalRate).toBe(subpagina.marginalRate)
    expect(hub.effectiveRate).toBe(subpagina.effectiveRate)
  })
})

// ── 3. Component (b): de teller/noemer-mismatch ────────────────────────────

describe('C9 (b) — effectief tarief: teller en noemer delen één grondslag', () => {
  const GROSS = 93_369

  it('reconstrueert het mechanisme exact met de cijfers uit de bevinding', () => {
    // ANKER — gemeten op de motor, 26-08-2026 (belastingjaar 2026):
    // De hub rekende vóór C8 zonder eigen-woning-invoer. Dat geeft precies de
    // €33.575 uit de analyse; plus de Box 3-heffing (~€599) en gedeeld door het
    // Box 1-inkomen komt daar de 36,6% uit die op het scherm stond. De Box
    // 3-euro's horen niet in die breuk: hun grondslag is vermogen, niet inkomen.
    const zonderWoning = computeBox1Tax({ grossYearlyIncome: GROSS, year: YEAR })
    expect(Math.round(zonderWoning.tax)).toBe(33_575)

    const oudEffectief = (zonderWoning.tax + 599) / GROSS
    expect(oudEffectief).toBeCloseTo(0.366, 3) // het getoonde 36,6%

    // ... naast een vuistregel-marginaal van 35,75% (afgerond 35,8%): het
    // onmogelijke beeld uit de bevinding, in één assertie.
    expect(deriveMarginaalTarief({ year: YEAR })).toBeCloseTo(0.3575, 4)
    expect(oudEffectief).toBeGreaterThan(deriveMarginaalTarief({ year: YEAR }))

    // Terwijl de motor voor hetzelfde inkomen 56,01% marginaal geeft — de 20,2
    // procentpunt kloof tussen de twee schermen.
    expect(zonderWoning.marginalRate).toBeCloseTo(0.5601, 4)
  })

  it('de oude formule kan boven ELK marginaal tarief uitkomen; de nieuwe niet', () => {
    const motor = computeBox1Tax({ grossYearlyIncome: GROSS, year: YEAR })
    // Een vermogende gebruiker met een forse Box 3-heffing. Het bedrag is niet
    // bijzonder — het punt is dat de oude breuk ONBEGRENSD meegroeit met een
    // heffing die niets met het inkomen te maken heeft.
    const box3Tax = 30_000
    const oud = (Math.round(motor.tax) + box3Tax) / GROSS
    expect(oud).toBeGreaterThan(motor.marginalRate) // het onmogelijke beeld

    const nieuw = buildTaxOverview({
      box1Tax: Math.round(motor.tax),
      box2Tax: null,
      box3Tax,
      effectiveRate: motor.effectiveRate,
      marginalRate: motor.marginalRate,
    })
    expect(nieuw.effectiveRate!).toBeLessThanOrEqual(nieuw.marginalRate! + TARIEF_RUIS)
    // Het TOTAAL blijft wél de hele rekening — één bedrag, twee grondslagen.
    expect(nieuw.total).toBe(Math.round(motor.tax) + box3Tax)
  })
})

// ── 4. Component (c) / M4: geen tarief zonder inkomen ──────────────────────

describe('M4 — bij onbekend inkomen verdwijnen BEIDE tarieven samen', () => {
  it('buildTaxOverview verzint geen tarief als de motor er geen leverde', () => {
    // Zo ziet de hub-aanroep eruit bij grossYearly === 0: de loader draait
    // computeBox1Tax dan niet, dus alle drie de velden zijn null.
    const r = buildTaxOverview({
      box1Tax: null,
      box2Tax: null,
      box3Tax: 599,
      effectiveRate: null,
      marginalRate: null,
      dailyExpenses: 100,
    })
    expect(r.effectiveRate).toBeNull()
    expect(r.marginalRate).toBeNull()
    // De Box 3-heffing blijft zichtbaar in het totaal — die is wél bekend.
    expect(r.total).toBe(599)
    expect(r.freedomDays).toBe(6)
  })
})

// ── 5. BRON-GRENDEL ────────────────────────────────────────────────────────

const HUB_PAGE = join(process.cwd(), 'app', '(app)', 'overzicht', 'belasting', 'page.tsx')
const KANSEN_LOADER = join(process.cwd(), 'lib', 'tax-opportunities-loader.ts')

/** Knipt het object-literal uit een `<naam>({ … })`-aanroep (accolade-balans). */
function callArgs(source: string, fnName: string): string[] {
  const out: string[] = []
  const needle = `${fnName}({`
  let from = 0
  for (;;) {
    const start = source.indexOf(needle, from)
    if (start === -1) break
    let depth = 0
    let i = start + needle.length - 1
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    out.push(source.slice(start, i + 1))
    from = i + 1
  }
  return out
}

describe('bron-grendel — de hub leidt geen tarief meer zelf af', () => {
  const source = readSourceLF(HUB_PAGE)

  it('gebruikt de FIRE-vuistregel niet meer als user-facing tarief', () => {
    expect(source).not.toContain('deriveMarginaalTarief')
    expect(source).not.toContain('marginaalTarief')
  })

  it('consumeert beide tarieven uit de kansen-loader', () => {
    expect(source).toContain('kansen?.box1EffectiveRate')
    expect(source).toContain('kansen?.box1MarginalRate')
  })

  it('geeft ze door aan buildTaxOverview zónder eigen noemer', () => {
    const calls = callArgs(source, 'buildTaxOverview')
    expect(calls.length).toBe(1)
    expect(calls[0]).toContain('effectiveRate:')
    expect(calls[0]).toContain('marginalRate:')
    // De verwijderde noemer: wie 'm terugzet, zet de mismatch terug.
    expect(calls[0]).not.toContain('grossYearlyIncome:')
  })

  it('gate\'t de weergave op één poort (grossYearly > 0)', () => {
    expect(source).toContain('const incomeKnown = grossYearly > 0')
    expect(source).toContain('incomeKnown={incomeKnown}')
  })
})

describe('bron-grendel — de kansen-loader levert heffing én tarieven uit ÉÉN motoraanroep', () => {
  const source = readSourceLF(KANSEN_LOADER)

  it('roept computeBox1Tax exact één keer aan', () => {
    expect(callArgs(source, 'computeBox1Tax').length).toBe(1)
  })

  it('leest tax, effectiveRate en marginalRate van hetzelfde resultaat', () => {
    expect(source).toContain('box1Result?.effectiveRate ?? null')
    expect(source).toContain('box1Result?.marginalRate ?? null')
    expect(source).toContain('box1Result != null ? Math.round(box1Result.tax) : null')
  })

  it('houdt de inkomens-poort op één plek', () => {
    expect(source).toContain('const box1Result =\n    grossYearly > 0')
  })
})
