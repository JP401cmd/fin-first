/**
 * `lib/tax-lifetime` — de levenslange-belastingmotor.
 *
 * Bewijst de zeven claims uit het ontwerp:
 *  1. AOW-dubbeltelling uitgesloten — alléén-AOW ⇒ `box1NietVerrekend` EXACT 0;
 *  2. marginale stapel — pensioen bovenóp AOW belast zwaarder dan vanaf nul;
 *  3. de `aow`-vlag per rij (niet blanket `true`);
 *  4. inflatie-indexering van de schijven;
 *  5. partner volledig uitgesloten;
 *  6. `cumulatiefBox3` geconsumeerd (nooit herberekend);
 *  7. degeneraties (geen pensioen, geen AOW, nul inkomen, lege reeks).
 *
 * Tolerantie-keuze: waar de claim een IDENTITEIT is (dubbeltelling-uitsluiting,
 * partner-uitsluiting, Box 3-doorgifte) wordt EXACT vergeleken (`toBe`) — een
 * tolerantie zou daar precies de foutklasse verbergen die de test moet vangen.
 * Waar de claim een RICHTING/ORDE is (marginale stapel, inflatie-effect) wordt
 * relatief vergeleken; absolute centen zijn daar betekenisloos omdat de bedragen
 * over 30 jaar met de inflatie meeschalen.
 */

import { describe, expect, it } from 'vitest'
import { computeBox1Tax, grossFromNet } from '@/lib/box1-tax'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { computeLifetimeTax, type LifetimeTaxRowInput } from './lifetime-tax'

const AOW_LEEFTIJD = 67
const YEAR = CURRENT_TAX_YEAR

/** Bouw één invoerrij; alle Box 1-stromen default 0. */
function row(p: {
  year?: number
  age: number
  inflationFactor?: number
  totalBox3?: number
  cumulativeBox3?: number
  aowNetto?: number
  pensioenUitkeringBruto?: number
  pensioenOnttrekkingBruto?: number
  partnerBatenNetto?: number
  geenStreams?: boolean
}): LifetimeTaxRowInput {
  const streams = {
    aowNetto: p.aowNetto ?? 0,
    pensioenUitkeringBruto: p.pensioenUitkeringBruto ?? 0,
    pensioenOnttrekkingBruto: p.pensioenOnttrekkingBruto ?? 0,
    partnerBatenNetto: p.partnerBatenNetto ?? 0,
  }
  return {
    year: p.year ?? 0,
    age: p.age,
    inflationFactor: p.inflationFactor ?? 1,
    totalBox3: p.totalBox3 ?? 0,
    cumulativeBox3: p.cumulativeBox3 ?? 0,
    ...(p.geenStreams ? {} : { box1Streams: streams }),
  }
}

// ── 1. De kern van de constructie: geen AOW-dubbeltelling ────────────────────

describe('computeLifetimeTax — AOW-dubbeltelling is per constructie uitgesloten', () => {
  it('alléén AOW (geen pensioen) ⇒ box1NietVerrekend is EXACT 0', () => {
    const rows = [
      row({ age: 67, aowNetto: 1581.55 * 12 }),
      row({ year: 1, age: 68, inflationFactor: 1.02, aowNetto: 1581.55 * 12 * 1.02 }),
      row({ year: 2, age: 69, inflationFactor: 1.0404, aowNetto: 1581.55 * 12 * 1.0404 }),
    ]
    const series = computeLifetimeTax(rows, { aowLeeftijd: AOW_LEEFTIJD, year: YEAR })
    for (const r of series.rows) {
      expect(r.aowBruto).toBeGreaterThan(r.aowNetto) // bruto ≥ netto, echt geïnverteerd
      expect(r.box1AlVerrekend).toBeGreaterThan(0) // er ZAT heffing in het netto-bedrag
      expect(r.box1Totaal).toBe(r.box1AlVerrekend) // bit-identiek: zelfde grondslag
      expect(r.box1NietVerrekend).toBe(0) // ⇒ niets dubbel geteld
    }
    expect(series.cumulatiefBox1NietVerrekend).toBe(0)
  })

  it('rij zonder box1Streams ⇒ alle Box 1-velden 0, Box 3 loopt gewoon door', () => {
    const series = computeLifetimeTax(
      [row({ age: 45, geenStreams: true, totalBox3: 900, cumulativeBox3: 900 })],
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    )
    const r = series.rows[0]
    expect(r.aowNetto).toBe(0)
    expect(r.aowBruto).toBe(0)
    expect(r.box1GrondslagBruto).toBe(0)
    expect(r.box1AlVerrekend).toBe(0)
    expect(r.box1Totaal).toBe(0)
    expect(r.box1NietVerrekend).toBe(0)
    expect(r.box3).toBe(900)
    expect(r.cumulatiefBox3).toBe(900)
    expect(r.cumulatiefTotaal).toBe(900)
  })
})

// ── 2. Marginale stapel: pensioen bovenóp AOW, niet vanaf nul ────────────────

describe('computeLifetimeTax — pensioen wordt marginaal belast (bovenóp AOW)', () => {
  const PENSIOEN = 24_000
  const AOW_NETTO = 1581.55 * 12

  it('heffing op pensioen bovenóp AOW > heffing op hetzelfde pensioen vanaf nul', () => {
    const metAow = computeLifetimeTax(
      [row({ age: 70, aowNetto: AOW_NETTO, pensioenUitkeringBruto: PENSIOEN })],
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    ).rows[0]

    // De naïeve variant die dit ontwerp juist vermijdt: pensioen vanaf €0.
    const naiefVanafNul = computeBox1Tax({
      grossYearlyIncome: PENSIOEN,
      year: YEAR,
      aow: true,
    }).tax

    expect(metAow.box1NietVerrekend).toBeGreaterThan(naiefVanafNul)
    // Substantieel, niet marginaal: de AOW vult schijf 1 en de heffingskortingen
    // zijn al (deels) opgesoupeerd ⇒ ruim boven de vlakke variant.
    expect(metAow.box1NietVerrekend / naiefVanafNul).toBeGreaterThan(1.2)
  })

  it('exacte verschil-identiteit: nietVerrekend === totaal − alVerrekend', () => {
    const r = computeLifetimeTax(
      [
        row({
          age: 70,
          aowNetto: AOW_NETTO,
          pensioenUitkeringBruto: 12_000,
          pensioenOnttrekkingBruto: 8_000,
        }),
      ],
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    ).rows[0]
    expect(r.box1NietVerrekend).toBe(r.box1Totaal - r.box1AlVerrekend)
    // en de grondslag telt de drie bruto-stromen op.
    expect(r.box1GrondslagBruto).toBe(r.aowBruto + 12_000 + 8_000)
    // handmatige controle tegen de enige tariefmotor — met dezelfde grondslag
    // die de module gebruikt: AOW en pensioen zijn geen arbeidsinkomen, dus ook
    // de netto→bruto-inversie draait op arbeidsinkomen 0.
    const brutoAow = grossFromNet(AOW_NETTO, YEAR, { aow: true, arbeidsinkomen: 0 })
    const alVerrekend = computeBox1Tax({
      grossYearlyIncome: brutoAow,
      year: YEAR,
      aow: true,
      arbeidsinkomen: 0,
    }).tax
    const totaal = computeBox1Tax({
      grossYearlyIncome: brutoAow + 20_000,
      year: YEAR,
      aow: true,
      arbeidsinkomen: 0,
    }).tax
    expect(r.box1NietVerrekend).toBeCloseTo(totaal - alVerrekend, 6)
  })

  it('uitkering en onttrekking zijn inwisselbaar in de grondslag (één stapel)', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const a = computeLifetimeTax(
      [row({ age: 70, aowNetto: AOW_NETTO, pensioenUitkeringBruto: 20_000 })],
      opts,
    ).rows[0]
    const b = computeLifetimeTax(
      [row({ age: 70, aowNetto: AOW_NETTO, pensioenOnttrekkingBruto: 20_000 })],
      opts,
    ).rows[0]
    expect(a.box1NietVerrekend).toBe(b.box1NietVerrekend)
  })

  it('monotonie: meer pensioen ⇒ nooit minder heffing, en nooit negatief', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    let vorige = -1
    for (let pensioen = 0; pensioen <= 200_000; pensioen += 2_500) {
      const r = computeLifetimeTax(
        [row({ age: 70, aowNetto: AOW_NETTO, pensioenOnttrekkingBruto: pensioen })],
        opts,
      ).rows[0]
      expect(r.box1NietVerrekend).toBeGreaterThanOrEqual(0)
      expect(r.box1NietVerrekend).toBeGreaterThanOrEqual(vorige)
      vorige = r.box1NietVerrekend
    }
  })
})

// ── 3. De aow-vlag per rij (niet blanket true) ───────────────────────────────

describe('computeLifetimeTax — aow-vlag per rij', () => {
  it('vóór de AOW-leeftijd: geen AOW-tarief ⇒ pensioen-onttrekking zwaarder belast', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const voor = computeLifetimeTax([row({ age: 60, pensioenOnttrekkingBruto: 30_000 })], opts)
      .rows[0]
    const na = computeLifetimeTax([row({ age: 70, pensioenOnttrekkingBruto: 30_000 })], opts).rows[0]

    expect(voor.aowGerechtigd).toBe(false)
    expect(na.aowGerechtigd).toBe(true)
    // Het verschil is NIET simpelweg 17,9 pp × inkomen: de AOW-tak zet zowel het
    // lagere schijf-1-tarief (17,85% i.p.v. 35,75%) als de belastingdeel-only
    // heffingskortingen aan, en die bewegen samen mee. Netto effect rond €30k:
    // ruwweg een halvering van de heffing. Vandaar een RELATIEVE assertie —
    // een absolute drempel zou hier een onjuiste modelclaim vastleggen.
    expect(voor.box1NietVerrekend).toBeGreaterThan(na.box1NietVerrekend)
    expect(voor.box1NietVerrekend / na.box1NietVerrekend).toBeGreaterThan(1.5)
  })

  it('op een hoger inkomen loopt het absolute verschil in de duizenden euro’s', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const voor = computeLifetimeTax([row({ age: 60, pensioenOnttrekkingBruto: 60_000 })], opts)
      .rows[0]
    const na = computeLifetimeTax([row({ age: 70, pensioenOnttrekkingBruto: 60_000 })], opts).rows[0]
    expect(voor.box1NietVerrekend - na.box1NietVerrekend).toBeGreaterThan(3_000)
  })

  /**
   * ARBEIDSKORTING-GRONDSLAG (was: "BEKENDE AFWIJKING", opgelost 11 aug 2026).
   *
   * Tot aug 2026 paste `computeBox1Tax` de arbeidskorting toe op het volledige
   * `grossYearlyIncome`, ook als dat pensioen/AOW was. De motor kent nu
   * `Box1Input.arbeidsinkomen`; deze module geeft er 0 mee, voor zowel de
   * tariefstap als de netto→bruto-inversie van de AOW.
   *
   * DE VERWACHTING IS BIJGESTELD OMDAT DE OUDE WAARDE FOUT WAS, niet omdat de
   * test lastig was: waar deze tests eerst de afwijking t.o.v. "heffing zonder
   * arbeidskorting" pinden (−€5.381 / −€2.687 / ±), pinnen ze nu dat er GEEN
   * afwijking meer is (exact 0) plus de gemeten sprong t.o.v. het oude gedrag.
   * De drie gevallen blijven staan, want ze dekken drie verschillende zones:
   *  (a) ná AOW zonder AOW-inkomen — de milde kant;
   *  (b) vóór de AOW — waar de volle niet-AOW-korting gold (max €5.685) en
   *      "pensioen vroeg" zijn onttrekkingen concentreert;
   *  (c) AOW + hoog pensioen — waar de oude fout van teken draaide.
   */
  /** Heffing zoals die zónder arbeidskorting hoort te zijn (de fiscale norm). */
  const juisteHeffing = (gross: number, aow: boolean): number => {
    if (!(gross > 0)) return 0
    const r = computeBox1Tax({ grossYearlyIncome: gross, year: YEAR, aow })
    const terecht = Math.min(r.algemeneHeffingskorting + r.iack, r.heffingVoorKortingen)
    return Math.max(0, r.heffingVoorKortingen - terecht)
  }
  /** Het gedrag van vóór de fix: arbeidskorting over het volledige bruto. */
  const oudeHeffing = (gross: number, aow: boolean): number =>
    gross > 0 ? computeBox1Tax({ grossYearlyIncome: gross, year: YEAR, aow }).tax : 0

  it('GRONDSLAG (a) ná AOW zonder AOW-inkomen: pensioen krijgt GEEN arbeidskorting', () => {
    const r = computeLifetimeTax([row({ age: 70, pensioenOnttrekkingBruto: 30_000 })], {
      aowLeeftijd: AOW_LEEFTIJD,
      year: YEAR,
    }).rows[0]

    // Exact de fiscale norm — geen tolerantie: dit is een IDENTITEIT, niet een orde.
    expect(r.box1NietVerrekend).toBe(juisteHeffing(30_000, true))
    // De motor kent hier zelf geen korting meer toe.
    expect(
      computeBox1Tax({ grossYearlyIncome: 30_000, year: YEAR, aow: true, arbeidsinkomen: 0 })
        .arbeidskorting,
    ).toBe(0)
    // Gemeten sprong t.o.v. het oude gedrag: de heffing gaat ± €2.687 OMHOOG.
    expect(r.box1NietVerrekend - oudeHeffing(30_000, true)).toBeCloseTo(2_687, -1)
  })

  it('GRONDSLAG (b) vóór de AOW was de fout ruim twee keer zo groot — nu óók 0', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const voor = computeLifetimeTax([row({ age: 60, pensioenOnttrekkingBruto: 30_000 })], opts)
      .rows[0]
    const na = computeLifetimeTax([row({ age: 70, pensioenOnttrekkingBruto: 30_000 })], opts).rows[0]
    expect(voor.aowGerechtigd).toBe(false)

    expect(voor.box1NietVerrekend).toBe(juisteHeffing(30_000, false))
    expect(na.box1NietVerrekend).toBe(juisteHeffing(30_000, true))

    // De correctie zelf is asymmetrisch: pre-AOW ruim twee keer zo groot, en dát
    // is de kant waar "pensioen vroeg" zijn onttrekkingen concentreert — dus de
    // fix raakt de RANGSCHIKKING van de sweep, niet alleen het niveau.
    const sprongVoor = voor.box1NietVerrekend - oudeHeffing(30_000, false)
    const sprongNa = na.box1NietVerrekend - oudeHeffing(30_000, true)
    expect(sprongVoor).toBeCloseTo(5_381, -1)
    expect(sprongNa).toBeCloseTo(2_687, -1)
    expect(sprongVoor).toBeGreaterThan(sprongNa * 1.9)
  })

  it('GRONDSLAG (c) AOW + hoog pensioen: óók het AOW-been draait op arbeidsinkomen 0', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const AOW_NETTO = 16_000
    // De inversie zelf verschuift mee: zonder arbeidskorting is er MEER bruto
    // nodig voor hetzelfde netto AOW-bedrag.
    const brutoAowOud = grossFromNet(AOW_NETTO, YEAR, { aow: true })
    const brutoAow = grossFromNet(AOW_NETTO, YEAR, { aow: true, arbeidsinkomen: 0 })
    expect(brutoAow).toBeGreaterThan(brutoAowOud)

    const bescheiden = computeLifetimeTax(
      [row({ age: 70, aowNetto: AOW_NETTO, pensioenOnttrekkingBruto: 30_000 })],
      opts,
    ).rows[0]
    const hoog = computeLifetimeTax(
      [row({ age: 70, aowNetto: AOW_NETTO, pensioenOnttrekkingBruto: 150_000 })],
      opts,
    ).rows[0]

    const juistVerschil = (pensioen: number) =>
      juisteHeffing(brutoAow + pensioen, true) - juisteHeffing(brutoAow, true)

    // Beide benen zijn nu grondslag-correct ⇒ het verschil is exact juist.
    expect(bescheiden.box1NietVerrekend).toBeCloseTo(juistVerschil(30_000), 6)
    expect(hoog.box1NietVerrekend).toBeCloseTo(juistVerschil(150_000), 6)

    // Richting van de correctie: omhoog bij een bescheiden pensioen, omlaag bij
    // een hoog pensioen (waar de oude korting op het totaal al was uitgefaseerd).
    const oudVerschil = (pensioen: number) =>
      oudeHeffing(brutoAowOud + pensioen, true) - oudeHeffing(brutoAowOud, true)
    expect(bescheiden.box1NietVerrekend - oudVerschil(30_000)).toBeCloseTo(1_990, -1)
    expect(hoog.box1NietVerrekend - oudVerschil(150_000)).toBeCloseTo(-707, -1)
  })

  it('de vlag kantelt exact op age === aowLeeftijd', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const rows = [66, 67, 68].map((age) => row({ age, pensioenOnttrekkingBruto: 30_000 }))
    const series = computeLifetimeTax(rows, opts)
    expect(series.rows.map((r) => r.aowGerechtigd)).toEqual([false, true, true])
  })

  /**
   * `row.age` is GEHEEL (bridge: `Math.round(startLeeftijd) + jaarindex`), de
   * AOW-leeftijd is dat niet (67,25 / 67,5). Met een rechtstreekse `age >=
   * aowLeeftijd` is `67 >= 67,25` onwaar en wordt het SCHARNIERJAAR als niet-AOW
   * gerekend: volle schijf 1 inclusief AOW-premie plus de grote niet-AOW-
   * arbeidskorting. Beide bestaande tests ontweken dit met een geheel getal.
   */
  it('een FRACTIONELE aowLeeftijd kantelt de vlag op hetzelfde raster als row.age', () => {
    const rijen = [66, 67, 68].map((age) => row({ age, pensioenOnttrekkingBruto: 30_000 }))
    const opts = { year: YEAR }

    // 67,25 rondt naar 67 → het jaar waarin de AOW ingaat telt als AOW-jaar.
    expect(
      computeLifetimeTax(rijen, { ...opts, aowLeeftijd: 67.25 }).rows.map((r) => r.aowGerechtigd),
    ).toEqual([false, true, true])

    // 67,5 rondt naar 68 → de kanteling schuift een jaar op, maar valt nooit
    // tússen het raster in.
    expect(
      computeLifetimeTax(rijen, { ...opts, aowLeeftijd: 67.5 }).rows.map((r) => r.aowGerechtigd),
    ).toEqual([false, false, true])

    // De onafgeronde invoer blijft herleidbaar in de uitvoer.
    expect(computeLifetimeTax(rijen, { ...opts, aowLeeftijd: 67.25 }).aowLeeftijd).toBe(67.25)
  })

  it('op de fractionele AOW-leeftijd rekent het scharnierjaar met het AOW-tarief', () => {
    const rij = [row({ age: 67, pensioenOnttrekkingBruto: 30_000 })]
    const scharnier = computeLifetimeTax(rij, { aowLeeftijd: 67.25, year: YEAR }).rows[0]
    const nietAow = computeLifetimeTax(rij, { aowLeeftijd: 70, year: YEAR }).rows[0]

    // Zonder de afronding zou het scharnierjaar de niet-AOW-heffing dragen —
    // aantoonbaar een ándere (fors hogere) uitkomst, geen afrondingsverschil.
    expect(scharnier.aowGerechtigd).toBe(true)
    expect(nietAow.aowGerechtigd).toBe(false)
    expect(scharnier.box1NietVerrekend).toBeLessThan(nietAow.box1NietVerrekend)
    expect(scharnier.box1NietVerrekend).toBe(
      computeBox1Tax({ grossYearlyIncome: 30_000, year: YEAR, aow: true, arbeidsinkomen: 0 }).tax,
    )
  })

  it('een niet-standaard aowLeeftijd wordt gerespecteerd (geen hardcode 67)', () => {
    const series = computeLifetimeTax(
      [69, 70].map((age) => row({ age, pensioenOnttrekkingBruto: 30_000 })),
      { aowLeeftijd: 70, year: YEAR },
    )
    expect(series.rows.map((r) => r.aowGerechtigd)).toEqual([false, true])
    expect(series.aowLeeftijd).toBe(70)
  })
})

// ── 4. Inflatie-indexering van de schijven ───────────────────────────────────

describe('computeLifetimeTax — schijven groeien mee met de inflatie', () => {
  it('nominaal geïndexeerd inkomen bij factor f ⇒ heffing = f × de heffing bij f=1', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const basis = computeLifetimeTax(
      [row({ age: 70, pensioenOnttrekkingBruto: 40_000, inflationFactor: 1 })],
      opts,
    ).rows[0]
    const f = Math.pow(1.02, 25)
    const later = computeLifetimeTax(
      [row({ year: 25, age: 70, pensioenOnttrekkingBruto: 40_000 * f, inflationFactor: f })],
      opts,
    ).rows[0]

    // Relatieve tolerantie: de bedragen schalen met f (~1,64), een absolute cent
    // zou hier niets over de MODELKEUZE zeggen. 1e-9 laat alleen float-ruis toe.
    expect(later.box1NietVerrekend / (basis.box1NietVerrekend * f)).toBeCloseTo(1, 9)
  })

  it('zonder indexering zou de heffing structureel hoger uitvallen (het effect is echt)', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const f = Math.pow(1.02, 25)
    const geindexeerd = computeLifetimeTax(
      [row({ year: 25, age: 70, pensioenOnttrekkingBruto: 40_000 * f, inflationFactor: f })],
      opts,
    ).rows[0]
    // Bevroren schijven = de fout die deze keuze vermijdt: hetzelfde nominale
    // inkomen tegen de tabel van nu, zónder terug-deflatie.
    const bevroren = computeBox1Tax({
      grossYearlyIncome: 40_000 * f,
      year: YEAR,
      aow: true,
    }).tax
    expect(bevroren).toBeGreaterThan(geindexeerd.box1NietVerrekend)
  })

  it('degeneratie: een ongeldige inflationFactor valt terug op 1 (geen NaN/Infinity)', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = computeLifetimeTax(
        [{ year: 0, age: 70, inflationFactor: bad, totalBox3: 0, cumulativeBox3: 0,
           box1Streams: { aowNetto: 0, pensioenUitkeringBruto: 30_000,
                          pensioenOnttrekkingBruto: 0, partnerBatenNetto: 0 } }],
        opts,
      ).rows[0]
      expect(Number.isFinite(r.box1NietVerrekend)).toBe(true)
      expect(r.box1NietVerrekend).toBeGreaterThan(0)
    }
  })
})

// ── 5. Partner volledig uitgesloten (ADR 0036) ───────────────────────────────

describe('computeLifetimeTax — partner volledig uitgesloten', () => {
  it('partnerBatenNetto beïnvloedt GEEN enkel uitvoerveld', () => {
    const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }
    const zonder = computeLifetimeTax(
      [
        row({ age: 70, aowNetto: 18_000, pensioenUitkeringBruto: 15_000, cumulativeBox3: 4_000 }),
        row({ year: 1, age: 71, aowNetto: 18_000, pensioenOnttrekkingBruto: 25_000, cumulativeBox3: 8_000 }),
      ],
      opts,
    )
    const met = computeLifetimeTax(
      [
        row({ age: 70, aowNetto: 18_000, pensioenUitkeringBruto: 15_000, cumulativeBox3: 4_000,
              partnerBatenNetto: 60_000 }),
        row({ year: 1, age: 71, aowNetto: 18_000, pensioenOnttrekkingBruto: 25_000, cumulativeBox3: 8_000,
              partnerBatenNetto: 60_000 }),
      ],
      opts,
    )
    // Byte-identiek, niet "ongeveer": de partner mag nul invloed hebben.
    expect(met).toEqual(zonder)
  })

  it('een reeks met UITSLUITEND partnerinkomen levert nul Box 1-heffing', () => {
    const series = computeLifetimeTax(
      [row({ age: 70, partnerBatenNetto: 45_000, cumulativeBox3: 1_200 })],
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    )
    expect(series.rows[0].box1GrondslagBruto).toBe(0)
    expect(series.cumulatiefBox1NietVerrekend).toBe(0)
    expect(series.cumulatiefTotaal).toBe(1_200)
  })
})

// ── 6. cumulatiefBox3 wordt GECONSUMEERD, niet herberekend ───────────────────

describe('computeLifetimeTax — cumulatiefBox3 komt uit de rij', () => {
  it('neemt row.cumulativeBox3 exact over, óók als die afwijkt van Σ totalBox3', () => {
    // Bewust inconsistente invoer: als de module zelf zou optellen, wint hier de
    // som (3000) i.p.v. de kernel-waarde (12345) — dat is precies de drift die
    // deze test verbiedt.
    const series = computeLifetimeTax(
      [
        row({ age: 50, totalBox3: 1_000, cumulativeBox3: 1_000 }),
        row({ year: 1, age: 51, totalBox3: 2_000, cumulativeBox3: 12_345 }),
      ],
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    )
    expect(series.rows[1].cumulatiefBox3).toBe(12_345)
    expect(series.cumulatiefBox3).toBe(12_345)
  })

  it('cumulatiefTotaal === cumulatiefBox3 + cumulatiefBox1NietVerrekend, per rij', () => {
    const series = computeLifetimeTax(
      [
        row({ age: 68, aowNetto: 19_000, pensioenUitkeringBruto: 10_000, cumulativeBox3: 5_000 }),
        row({ year: 1, age: 69, aowNetto: 19_000, pensioenOnttrekkingBruto: 30_000, cumulativeBox3: 9_500 }),
        row({ year: 2, age: 70, aowNetto: 19_000, cumulativeBox3: 13_000 }),
      ],
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    )
    let lopend = 0
    for (const r of series.rows) {
      lopend += r.box1NietVerrekend
      expect(r.cumulatiefBox1NietVerrekend).toBeCloseTo(lopend, 9)
      expect(r.cumulatiefTotaal).toBe(r.cumulatiefBox3 + r.cumulatiefBox1NietVerrekend)
    }
    const laatste = series.rows[series.rows.length - 1]
    expect(series.cumulatiefBox3).toBe(laatste.cumulatiefBox3)
    expect(series.cumulatiefBox1NietVerrekend).toBe(laatste.cumulatiefBox1NietVerrekend)
    expect(series.cumulatiefTotaal).toBe(laatste.cumulatiefTotaal)
  })

  it('cumulatiefBox1NietVerrekend is monotoon niet-dalend', () => {
    const series = computeLifetimeTax(
      Array.from({ length: 20 }, (_, i) =>
        row({
          year: i,
          age: 60 + i,
          inflationFactor: Math.pow(1.02, i),
          aowNetto: i >= 7 ? 19_000 * Math.pow(1.02, i) : 0,
          pensioenOnttrekkingBruto: 20_000 * Math.pow(1.02, i),
          cumulativeBox3: 1_000 * (i + 1),
        }),
      ),
      { aowLeeftijd: AOW_LEEFTIJD, year: YEAR },
    )
    for (let i = 1; i < series.rows.length; i++) {
      expect(series.rows[i].cumulatiefBox1NietVerrekend).toBeGreaterThanOrEqual(
        series.rows[i - 1].cumulatiefBox1NietVerrekend,
      )
    }
    expect(series.cumulatiefBox1NietVerrekend).toBeGreaterThan(0)
  })
})

// ── 7. Degeneraties + contract-koppeling ─────────────────────────────────────

describe('computeLifetimeTax — degeneraties', () => {
  const opts = { aowLeeftijd: AOW_LEEFTIJD, year: YEAR }

  it('lege reeks ⇒ lege rijen en nul-totalen (geen crash)', () => {
    const series = computeLifetimeTax([], opts)
    expect(series.rows).toEqual([])
    expect(series.cumulatiefBox3).toBe(0)
    expect(series.cumulatiefBox1NietVerrekend).toBe(0)
    expect(series.cumulatiefTotaal).toBe(0)
  })

  it('nul inkomen over de hele reeks ⇒ nul Box 1', () => {
    const series = computeLifetimeTax(
      [row({ age: 40 }), row({ year: 1, age: 41 }), row({ year: 2, age: 80 })],
      opts,
    )
    for (const r of series.rows) {
      expect(r.box1AlVerrekend).toBe(0)
      expect(r.box1Totaal).toBe(0)
      expect(r.box1NietVerrekend).toBe(0)
    }
    expect(series.cumulatiefBox1NietVerrekend).toBe(0)
  })

  it('geen AOW maar wél pensioen ⇒ alVerrekend 0, alles onverrekend', () => {
    const r = computeLifetimeTax([row({ age: 70, pensioenOnttrekkingBruto: 30_000 })], opts).rows[0]
    expect(r.aowBruto).toBe(0)
    expect(r.box1AlVerrekend).toBe(0)
    expect(r.box1NietVerrekend).toBe(r.box1Totaal)
    expect(r.box1Totaal).toBeGreaterThan(0)
  })

  it('minieme AOW zonder pensioen ⇒ nog steeds exact 0 onverrekend', () => {
    const r = computeLifetimeTax([row({ age: 68, aowNetto: 1 })], opts).rows[0]
    expect(r.box1NietVerrekend).toBe(0)
  })

  it('default-jaar = CURRENT_TAX_YEAR wanneer `year` niet is meegegeven', () => {
    const series = computeLifetimeTax([row({ age: 70, aowNetto: 19_000 })], {
      aowLeeftijd: AOW_LEEFTIJD,
    })
    expect(series.year).toBe(CURRENT_TAX_YEAR)
  })

  it('de invoerrijen worden niet gemuteerd', () => {
    const input = row({ age: 70, aowNetto: 19_000, pensioenUitkeringBruto: 10_000 })
    const kopie = structuredClone(input)
    computeLifetimeTax([input], opts)
    expect(input).toEqual(kopie)
  })
})

describe('computeLifetimeTax — contract-koppeling met UnifiedProjectionRow', () => {
  it('een UnifiedProjectionRow is zonder mapping bruikbaar als invoerrij', () => {
    // Compile-time pinning: als `box1Streams`/`cumulativeBox3` van vorm veranderen
    // op de rij, breekt deze toewijzing (tsc) — niet pas in een consument.
    const unified: Pick<
      UnifiedProjectionRow,
      'year' | 'age' | 'inflationFactor' | 'totalBox3' | 'cumulativeBox3' | 'box1Streams'
    > = {
      year: 3,
      age: 70,
      inflationFactor: 1.061208,
      totalBox3: 2_100,
      cumulativeBox3: 7_400,
      box1Streams: {
        aowNetto: 20_000,
        pensioenUitkeringBruto: 9_000,
        pensioenOnttrekkingBruto: 4_000,
        partnerBatenNetto: 0,
      },
    }
    const asInput: LifetimeTaxRowInput = unified
    const series = computeLifetimeTax([asInput], { aowLeeftijd: AOW_LEEFTIJD, year: YEAR })
    expect(series.rows).toHaveLength(1)
    expect(series.cumulatiefBox3).toBe(7_400)
    expect(series.rows[0].box1NietVerrekend).toBeGreaterThan(0)
  })
})
