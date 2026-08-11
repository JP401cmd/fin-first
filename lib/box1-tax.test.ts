import { describe, it, expect } from 'vitest'
import {
  computeBox1Tax,
  marginalRateAt,
  effectiveRateAt,
  schijftariefOp,
  grossFromNet,
  deriveMarginaalTarief,
  schijfGrensVoor,
  MARGINAAL_TARIEF_NETTO_DREMPEL,
  BOX1_PARAMS,
} from './box1-tax'
import { CURRENT_TAX_YEAR } from './box3-data'

describe('BOX1_PARAMS — constants', () => {
  it('heeft schijven voor 2025 en 2026', () => {
    expect(BOX1_PARAMS[2026].schijven).toHaveLength(3)
    expect(BOX1_PARAMS[2025].schijven).toHaveLength(3)
  })

  it('2026 schijf-tarieven kloppen met het onderzoeksdoc', () => {
    const s = BOX1_PARAMS[2026].schijven
    expect(s[0].tarief).toBeCloseTo(0.3575, 4)
    expect(s[0].tot).toBe(38_883)
    expect(s[1].tarief).toBeCloseTo(0.3756, 4)
    expect(s[1].tot).toBe(78_426)
    expect(s[2].tarief).toBeCloseTo(0.495, 4)
    expect(s[2].tot).toBeNull()
  })

  it('eigenwoningforfait = 0,35% en Hillen 2026 ≈ 71,8%', () => {
    expect(BOX1_PARAMS[2026].eigenwoningforfaitRate).toBeCloseTo(0.0035, 5)
    expect(BOX1_PARAMS[2026].hillenPct).toBeCloseTo(0.718, 3)
  })

  it('AOW schijf-1 tarief is lager dan niet-AOW (geen AOW-premie)', () => {
    expect(BOX1_PARAMS[2026].schijvenAow[0].tarief).toBeLessThan(
      BOX1_PARAMS[2026].schijven[0].tarief,
    )
  })
})

describe('schijftariefOp — juiste tarief per schijf', () => {
  it('inkomen in schijf 1 → 35,75% (2026)', () => {
    expect(schijftariefOp(30_000, 2026)).toBeCloseTo(0.3575, 4)
  })
  it('inkomen in schijf 2 → 37,56% (2026)', () => {
    expect(schijftariefOp(50_000, 2026)).toBeCloseTo(0.3756, 4)
  })
  it('inkomen in schijf 3 → 49,5% (2026)', () => {
    expect(schijftariefOp(100_000, 2026)).toBeCloseTo(0.495, 4)
  })
  it('AOW: schijf 1 lager tarief (17,85% = 35,75% − 17,90% AOW-premie)', () => {
    expect(schijftariefOp(30_000, 2026, true)).toBeCloseTo(0.1785, 4)
  })
})

describe('computeBox1Tax — heffing vóór kortingen (schijf-grenzen)', () => {
  it('belast schijf 1 lineair tot de grens', () => {
    // Geen eigen woning, geen kortingen-effect op heffingVoorKortingen.
    const r = computeBox1Tax({ grossYearlyIncome: 38_883, year: 2026 })
    // 38883 * 0.3575
    expect(r.heffingVoorKortingen).toBeCloseTo(38_883 * 0.3575, 2)
  })

  it('belast schijf 2 cumulatief (grens schijf 1 + deel schijf 2)', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 50_000, year: 2026 })
    const verwacht = 38_883 * 0.3575 + (50_000 - 38_883) * 0.3756
    expect(r.heffingVoorKortingen).toBeCloseTo(verwacht, 2)
  })

  it('belast schijf 3 cumulatief over de top', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 100_000, year: 2026 })
    const verwacht =
      38_883 * 0.3575 +
      (78_426 - 38_883) * 0.3756 +
      (100_000 - 78_426) * 0.495
    expect(r.heffingVoorKortingen).toBeCloseTo(verwacht, 2)
  })
})

describe('computeBox1Tax — heffingskortingen', () => {
  it('algemene heffingskorting is maximaal onder de afbouwgrens', () => {
    const start = BOX1_PARAMS[2026].algemeneHeffingskorting.afbouwStart
    const r = computeBox1Tax({ grossYearlyIncome: start - 1_000, year: 2026 })
    expect(r.algemeneHeffingskorting).toBeCloseTo(
      BOX1_PARAMS[2026].algemeneHeffingskorting.max,
      2,
    )
  })

  it('hoger inkomen → lagere algemene heffingskorting (afbouw)', () => {
    const laag = computeBox1Tax({ grossYearlyIncome: 30_000, year: 2026 })
    const hoog = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })
    expect(hoog.algemeneHeffingskorting).toBeLessThan(laag.algemeneHeffingskorting)
  })

  it('algemene heffingskorting bouwt af naar 0 bij zeer hoog inkomen', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 500_000, year: 2026 })
    expect(r.algemeneHeffingskorting).toBe(0)
  })

  it('arbeidskorting loopt op en bouwt daarna af', () => {
    const opbouw = computeBox1Tax({ grossYearlyIncome: 35_000, year: 2026 })
    const afbouwVer = computeBox1Tax({ grossYearlyIncome: 120_000, year: 2026 })
    expect(opbouw.arbeidskorting).toBeGreaterThan(0)
    expect(afbouwVer.arbeidskorting).toBeLessThan(opbouw.arbeidskorting)
  })

  it('IACK alleen met kinderen onder 12', () => {
    const zonder = computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026 })
    const met = computeBox1Tax({
      grossYearlyIncome: 40_000,
      year: 2026,
      heeftKinderenOnder12: true,
    })
    expect(zonder.iack).toBe(0)
    expect(met.iack).toBeGreaterThan(0)
  })
})

/**
 * ARBEIDSINKOMEN als eigen grondslag (11 aug 2026).
 *
 * De arbeidskorting en de IACK lopen over het ARBEIDSINKOMEN (loon, winst uit
 * onderneming, resultaat uit overige werkzaamheden — art. 8.1 Wet IB 2001), niet
 * over het totale bruto inkomen. Pensioen, AOW, lijfrente en uitkeringen geven
 * geen recht op arbeidskorting.
 *
 * De regressie-rem is het gemengde geval: twee profielen met HETZELFDE totale
 * bruto inkomen maar een andere samenstelling horen aantoonbaar een andere
 * arbeidskorting te krijgen. Zonder die eis kan de grondslag stil terugglijden
 * naar het totaalinkomen zonder dat één assertie omvalt.
 *
 * Dat de terugval géén stille gedragswijziging is, wordt hier bewezen door
 * "weglaten ≡ expliciet het volledige bruto meegeven"; de externe ijkwaarden in
 * box1-tax.golden.test.ts (die `arbeidsinkomen` nergens zetten) blijven de
 * onafhankelijke controle daarop.
 */
describe('computeBox1Tax — arbeidsinkomen als grondslag voor arbeidskorting/IACK', () => {
  it('weglaten: de heffing is die van het volledige bruto als arbeidsinkomen', () => {
    for (const gross of [0, 5_000, 25_845, 45_592, 60_000, 133_000, 250_000]) {
      for (const aow of [false, true]) {
        for (const kind of [false, true]) {
          const zonder = computeBox1Tax({
            grossYearlyIncome: gross,
            year: 2026,
            aow,
            heeftKinderenOnder12: kind,
          })
          const met = computeBox1Tax({
            grossYearlyIncome: gross,
            year: 2026,
            aow,
            heeftKinderenOnder12: kind,
            arbeidsinkomen: gross,
          })
          // Alles behalve marginalRate is identiek: de terugval zet de grondslag
          // op precies dit bruto. marginalRate verschilt BEWUST — zie de test
          // hieronder over wat "de volgende euro" is.
          const { marginalRate: _weg, ...zonderRest } = zonder
          const { marginalRate: _met, ...metRest } = met
          expect(metRest).toEqual(zonderRest)
          // …en de afgeleide volgt de oude, grondslagloze signatuur exact.
          expect(zonder.marginalRate).toBe(marginalRateAt(gross, 2026, aow))
        }
      }
    }
  })

  it('BEWUST verschil: een expliciete grondslag zet de volgende euro op NIET-arbeid', () => {
    // Weglaten = "mijn hele inkomen is arbeidsinkomen", dus de extra euro is dat
    // óók en de arbeidskorting-opbouw/-afbouw telt mee in het marginale tarief.
    // Expliciet meegeven = de grondslag staat vast, dus de extra euro is pensioen
    // of uitkering. In de OPBOUWtak (€ 25.845) drukt dat het marginale tarief
    // juist omhoog, in de afbouwtak (€ 60.000) omlaag — de richting verschilt,
    // en dat is precies waarom dit geen "gelijk aan weglaten" mag heten.
    const opbouw = 25_845
    expect(marginalRateAt(opbouw, 2026, false, { arbeidsinkomen: opbouw })).toBeGreaterThan(
      marginalRateAt(opbouw, 2026),
    )
    const afbouw = 60_000
    expect(marginalRateAt(afbouw, 2026, false, { arbeidsinkomen: afbouw })).toBeLessThan(
      marginalRateAt(afbouw, 2026),
    )
  })

  it('het resultaat draagt de gebruikte grondslag (default = bruto)', () => {
    expect(computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 }).arbeidsinkomen).toBe(60_000)
    expect(
      computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026, arbeidsinkomen: 20_000 })
        .arbeidsinkomen,
    ).toBe(20_000)
  })

  it('gepensioneerde met € 40.000 pensioen en geen loon: arbeidskorting € 0, heffing hoger', () => {
    const pensioen = computeBox1Tax({
      grossYearlyIncome: 40_000,
      year: 2026,
      aow: true,
      arbeidsinkomen: 0,
    })
    const alsofArbeid = computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026, aow: true })

    expect(pensioen.arbeidskorting).toBe(0)
    expect(alsofArbeid.arbeidskorting).toBeGreaterThan(0)
    // De heffing valt navenant hoger uit — precies het bedrag van de korting die
    // ten onrechte werd toegekend (beide zitten ruim onder de kortingsplafonds).
    expect(pensioen.tax - alsofArbeid.tax).toBeCloseTo(alsofArbeid.arbeidskorting, 6)
  })

  it('werkende met € 50.000 loon + € 20.000 pensioenopname: korting over € 50.000', () => {
    const gemengd = computeBox1Tax({
      grossYearlyIncome: 70_000,
      year: 2026,
      arbeidsinkomen: 50_000,
    })
    const zuiverLoon50 = computeBox1Tax({ grossYearlyIncome: 50_000, year: 2026 })
    const overHetTotaal = computeBox1Tax({ grossYearlyIncome: 70_000, year: 2026 })

    expect(gemengd.arbeidskorting).toBeCloseTo(zuiverLoon50.arbeidskorting, 6)
    // € 70.000 ligt in de AFBOUWtak (vanaf € 45.592), dus rekenen over het totaal
    // gaf hier een TE LAGE korting: de fout draait hier van teken.
    expect(gemengd.arbeidskorting).toBeGreaterThan(overHetTotaal.arbeidskorting)
    expect(gemengd.tax).toBeLessThan(overHetTotaal.tax)
  })

  it('REGRESSIE-REM: gelijk totaal, andere samenstelling ⇒ andere arbeidskorting', () => {
    const TOTAAL = 40_000
    const alleenArbeid = computeBox1Tax({ grossYearlyIncome: TOTAAL, year: 2026 })
    const gemengd = computeBox1Tax({
      grossYearlyIncome: TOTAAL,
      year: 2026,
      arbeidsinkomen: 15_000, // € 15.000 loon + € 25.000 uitkering/pensioen
    })
    const geenArbeid = computeBox1Tax({
      grossYearlyIncome: TOTAAL,
      year: 2026,
      arbeidsinkomen: 0,
    })

    expect(alleenArbeid.belastbaarInkomen).toBe(gemengd.belastbaarInkomen)
    expect(alleenArbeid.belastbaarInkomen).toBe(geenArbeid.belastbaarInkomen)
    expect(alleenArbeid.heffingVoorKortingen).toBe(gemengd.heffingVoorKortingen)

    // Zelfde grondslag vóór kortingen, drie verschillende arbeidskortingen…
    expect(alleenArbeid.arbeidskorting).toBeGreaterThan(gemengd.arbeidskorting)
    expect(gemengd.arbeidskorting).toBeGreaterThan(geenArbeid.arbeidskorting)
    expect(geenArbeid.arbeidskorting).toBe(0)
    // …en dus drie verschillende heffingen.
    expect(geenArbeid.tax).toBeGreaterThan(gemengd.tax)
    expect(gemengd.tax).toBeGreaterThan(alleenArbeid.tax)
  })

  it('IACK deelt exact dezelfde grondslag als de arbeidskorting', () => {
    const base = { grossYearlyIncome: 40_000, year: 2026 as const, heeftKinderenOnder12: true }
    expect(computeBox1Tax({ ...base, arbeidsinkomen: 0 }).iack).toBe(0)
    expect(computeBox1Tax({ ...base, arbeidsinkomen: 15_000 }).iack).toBeCloseTo(
      computeBox1Tax({ grossYearlyIncome: 15_000, year: 2026, heeftKinderenOnder12: true }).iack,
      6,
    )
  })

  it('marginalRateAt: een extra euro NIET-arbeidsinkomen kent geen kortingsafbouw', () => {
    // € 60.000 ligt in de afbouwzone van AHK én arbeidskorting.
    const alsArbeid = marginalRateAt(60_000, 2026)
    const alsPensioen = marginalRateAt(60_000, 2026, false, { arbeidsinkomen: 0 })
    expect(alsArbeid).toBeGreaterThan(alsPensioen)
    // De arbeidskorting-afbouw (6,51 pp) valt weg; de AHK-afbouw blijft staan,
    // dus het marginale tarief blijft bóven het pure schijftarief.
    expect(alsArbeid - alsPensioen).toBeCloseTo(BOX1_PARAMS[2026].arbeidskorting.afbouwRate, 4)
    expect(alsPensioen).toBeGreaterThan(schijftariefOp(60_000, 2026))
  })

  it('grossFromNet met arbeidsinkomen 0 vraagt méér bruto voor hetzelfde netto', () => {
    const netto = 16_000
    const metKorting = grossFromNet(netto, 2026, { aow: true })
    const zonderKorting = grossFromNet(netto, 2026, { aow: true, arbeidsinkomen: 0 })
    expect(zonderKorting).toBeGreaterThan(metKorting)
    // Round-trip op de eigen grondslag blijft kloppen (± €1 door afronding).
    const terug = computeBox1Tax({
      grossYearlyIncome: zonderKorting,
      year: 2026,
      aow: true,
      arbeidsinkomen: 0,
    }).nettoBesteedbaar
    expect(Math.abs(terug - netto)).toBeLessThanOrEqual(1)
  })

  it('clamps: negatief → 0; boven het bruto blijft toegestaan (aftrekpost-geval)', () => {
    expect(
      computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026, arbeidsinkomen: -5_000 })
        .arbeidskorting,
    ).toBe(0)
    // Een lijfrentepremie verlaagt het belastbare inkomen maar NIET het
    // arbeidsinkomen — die combinatie moet uitdrukbaar blijven.
    const metAftrek = computeBox1Tax({
      grossYearlyIncome: 70_000,
      year: 2026,
      arbeidsinkomen: 80_000,
    })
    expect(metAftrek.arbeidsinkomen).toBe(80_000)
    expect(metAftrek.arbeidskorting).toBeCloseTo(
      computeBox1Tax({ grossYearlyIncome: 80_000, year: 2026 }).arbeidskorting,
      6,
    )
  })

  it('NaN/onzin valt terug op het bruto (geen stille nul-korting)', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026, arbeidsinkomen: Number.NaN })
    expect(r.arbeidsinkomen).toBe(40_000)
    expect(r).toEqual(computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026 }))
  })
})

describe('computeBox1Tax — marginalRate', () => {
  it('marginalRate in een korting-afbouwzone ligt boven het pure schijftarief', () => {
    // 60.000 ligt in schijf 2 (37,56%) én in de afbouwzone van algemene
    // heffingskorting + arbeidskorting → marginaal tarief moet hoger zijn.
    const income = 60_000
    const schijf = schijftariefOp(income, 2026)
    const marginaal = marginalRateAt(income, 2026)
    expect(marginaal).toBeGreaterThan(schijf)
  })

  it('marginalRate is gelijk aan het result-veld', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })
    expect(r.marginalRate).toBeCloseTo(marginalRateAt(60_000, 2026), 6)
  })

  it('marginalRate bij zeer hoog inkomen ≈ topschijf (geen afbouw meer)', () => {
    const marginaal = marginalRateAt(300_000, 2026)
    // Kortingen zijn weg, dus marginaal ≈ 49,5%.
    expect(marginaal).toBeCloseTo(0.495, 2)
  })
})

describe('effectiveRateAt', () => {
  it('effectief tarief stijgt met het inkomen (progressie)', () => {
    const laag = effectiveRateAt(30_000, 2026)
    const hoog = effectiveRateAt(150_000, 2026)
    expect(hoog).toBeGreaterThan(laag)
  })

  it('effectief tarief < marginaal tarief bij progressieve heffing', () => {
    expect(effectiveRateAt(80_000, 2026)).toBeLessThan(marginalRateAt(80_000, 2026))
  })

  it('returnt 0 bij inkomen ≤ 0', () => {
    expect(effectiveRateAt(0, 2026)).toBe(0)
  })
})

describe('computeBox1Tax — eigen woning (forfait + Hillen)', () => {
  it('forfait = 0,35% WOZ', () => {
    const r = computeBox1Tax({
      grossYearlyIncome: 50_000,
      year: 2026,
      wozValue: 400_000,
    })
    expect(r.eigenwoningforfait).toBeCloseTo(400_000 * 0.0035, 2)
  })

  it('Hillen-aftrek wanneer rente laag is (forfait > rente)', () => {
    // WOZ 400k → forfait 1400; rente 200 → saldoVoorHillen 1200 > 0 → Hillen toepassen.
    const r = computeBox1Tax({
      grossYearlyIncome: 50_000,
      year: 2026,
      wozValue: 400_000,
      hypotheekRente: 200,
    })
    const saldoVoorHillen = r.eigenwoningforfait - r.hypotheekrenteaftrek
    expect(saldoVoorHillen).toBeGreaterThan(0)
    expect(r.hillenAftrek).toBeCloseTo(saldoVoorHillen * 0.718, 2)
    // Saldo na Hillen is positief maar sterk verlaagd.
    expect(r.eigenwoningSaldo).toBeCloseTo(saldoVoorHillen * (1 - 0.718), 2)
    expect(r.eigenwoningSaldo).toBeLessThan(saldoVoorHillen)
  })

  it('geen Hillen wanneer rente hoog is (forfait < rente) → netto aftrekpost', () => {
    const r = computeBox1Tax({
      grossYearlyIncome: 50_000,
      year: 2026,
      wozValue: 400_000,
      hypotheekRente: 8_000,
    })
    expect(r.hillenAftrek).toBe(0)
    // Forfait 1400 - rente 8000 = -6600 → negatief saldo = aftrekpost.
    expect(r.eigenwoningSaldo).toBeLessThan(0)
    // Belastbaar inkomen ligt onder bruto door de aftrek.
    expect(r.belastbaarInkomen).toBeLessThan(50_000)
  })

  it('hypotheekrenteaftrek verlaagt de te betalen belasting t.o.v. zonder woning', () => {
    const zonder = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })
    const met = computeBox1Tax({
      grossYearlyIncome: 60_000,
      year: 2026,
      wozValue: 400_000,
      hypotheekRente: 10_000,
    })
    expect(met.tax).toBeLessThan(zonder.tax)
  })
})

describe('computeBox1Tax — clamps & edge cases', () => {
  it('tax >= 0 (kortingen kunnen niet onder nul brengen)', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 8_000, year: 2026 })
    expect(r.tax).toBeGreaterThanOrEqual(0)
  })

  it('inkomen 0 → alles 0', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 0, year: 2026 })
    expect(r.tax).toBe(0)
    expect(r.belastbaarInkomen).toBe(0)
    expect(r.effectiveRate).toBe(0)
    expect(r.nettoBesteedbaar).toBe(0)
  })

  it('negatief inkomen wordt op 0 geclampt', () => {
    const r = computeBox1Tax({ grossYearlyIncome: -5_000, year: 2026 })
    expect(r.grossYearlyIncome).toBe(0)
    expect(r.tax).toBe(0)
  })

  it('nettoBesteedbaar = bruto - tax', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 70_000, year: 2026 })
    expect(r.nettoBesteedbaar).toBeCloseTo(r.grossYearlyIncome - r.tax, 6)
  })

  it('freedomDays = tax / dailyExpenses (afgerond)', () => {
    const r = computeBox1Tax({
      grossYearlyIncome: 70_000,
      year: 2026,
      dailyExpenses: 100,
    })
    expect(r.freedomDays).toBe(Math.round(r.tax / 100))
  })

  it('freedomDays = 0 bij ontbrekende dailyExpenses', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 70_000, year: 2026 })
    expect(r.freedomDays).toBe(0)
  })
})

describe('grossFromNet — netto → bruto inversie', () => {
  it('rondreis: bruto → netto → bruto reproduceert het bruto (zonder eigen woning)', () => {
    for (const gross of [25_000, 45_000, 70_000, 120_000, 250_000]) {
      const netto = computeBox1Tax({ grossYearlyIncome: gross, year: 2026 }).nettoBesteedbaar
      const terug = grossFromNet(netto, 2026)
      // Op euro-niveau nauwkeurig (bisectie + afronding).
      expect(terug).toBeCloseTo(gross, -1)
      expect(Math.abs(terug - gross)).toBeLessThanOrEqual(2)
    }
  })

  it('bruto is hoger dan het netto-doel (er wordt belasting geheven)', () => {
    const bruto = grossFromNet(40_000, 2026)
    expect(bruto).toBeGreaterThan(40_000)
  })

  it('is monotoon: hoger netto → hoger bruto', () => {
    expect(grossFromNet(50_000, 2026)).toBeGreaterThan(grossFromNet(30_000, 2026))
  })

  it('overschat NIET zoals de platte marginaal-opslag', () => {
    // Platte methode: netto / (1 − marginaal). Bij een netto van 40k zit het
    // marginale tarief rond schijf 2 → flink hoger bruto dan de echte inversie.
    const netto = 40_000
    const marg = marginalRateAt(grossFromNet(netto, 2026), 2026)
    const plat = netto / (1 - marg)
    expect(grossFromNet(netto, 2026)).toBeLessThan(plat)
  })

  it('returnt 0 bij netto ≤ 0', () => {
    expect(grossFromNet(0, 2026)).toBe(0)
    expect(grossFromNet(-1_000, 2026)).toBe(0)
  })

  it('AOW-variant geeft een lager bruto voor hetzelfde netto (minder belasting)', () => {
    const netto = 30_000
    expect(grossFromNet(netto, 2026, { aow: true })).toBeLessThan(grossFromNet(netto, 2026))
  })
})

describe('computeBox1Tax — AOW', () => {
  it('AOW-gerechtigde betaalt minder belasting bij gelijk inkomen (lager schijf-1 tarief)', () => {
    const regulier = computeBox1Tax({ grossYearlyIncome: 30_000, year: 2026 })
    const aow = computeBox1Tax({ grossYearlyIncome: 30_000, year: 2026, aow: true })
    expect(aow.tax).toBeLessThan(regulier.tax)
  })
})

// ── Officiële Belastingdienst-cijfers 2026 (fisin2026 / VA 2026) ──────────────
// Deze suite vergrendelt de gecorrigeerde constanten en de narekening tegen de
// officiële tabellen, zodat een toekomstige jaar-lag (2026 met 2025-waarden) rood wordt.

describe('BOX1_PARAMS 2026 — officiële heffingskorting-constanten', () => {
  it('AHK 2026: max €3.115, afbouwstart €29.736, afbouw 6,398%', () => {
    const ahk = BOX1_PARAMS[2026].algemeneHeffingskorting
    expect(ahk.max).toBe(3_115)
    expect(ahk.afbouwStart).toBe(29_736)
    expect(ahk.afbouwRate).toBeCloseTo(0.06398, 5)
  })

  it('Arbeidskorting 2026: opbouwknikpunten €11.965/€25.845 en afbouwstart €45.592', () => {
    const ak = BOX1_PARAMS[2026].arbeidskorting
    expect(ak.max).toBe(5_685)
    expect(ak.opbouwPunten[0].tarief).toBeCloseTo(0.08324, 5)
    expect(ak.opbouwPunten[1]).toEqual({ vanaf: 11_965, tarief: 0.31009 })
    expect(ak.opbouwPunten[2]).toEqual({ vanaf: 25_845, tarief: 0.01950 })
    expect(ak.afbouwStart).toBe(45_592)
  })

  it('IACK 2026: max €3.032, drempel €6.239', () => {
    expect(BOX1_PARAMS[2026].iack.max).toBe(3_032)
    expect(BOX1_PARAMS[2026].iack.drempelInkomen).toBe(6_239)
  })

  it('AOW-tarief schijf 1 2026 = 17,85% en AOW-korting-varianten aanwezig', () => {
    expect(BOX1_PARAMS[2026].schijvenAow[0].tarief).toBeCloseTo(0.1785, 4)
    expect(BOX1_PARAMS[2026].algemeneHeffingskortingAow.max).toBe(1_556)
    expect(BOX1_PARAMS[2026].arbeidskortingAow.max).toBe(2_840)
  })
})

describe('computeBox1Tax — arbeidskorting-knikpunten 2026 (narekening)', () => {
  it('€11.965 = einde 1e opbouwtraject: 11.965 × 8,324%', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 11_965, year: 2026 })
    expect(r.arbeidskorting).toBeCloseTo(11_965 * 0.08324, 2)
  })

  it('€25.845 = einde 2e opbouwtraject', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 25_845, year: 2026 })
    const verwacht = 11_965 * 0.08324 + (25_845 - 11_965) * 0.31009
    expect(r.arbeidskorting).toBeCloseTo(verwacht, 2)
  })

  it('€45.592 = afbouwstart: arbeidskorting op het maximum (€5.685)', () => {
    const r = computeBox1Tax({ grossYearlyIncome: 45_592, year: 2026 })
    expect(r.arbeidskorting).toBeCloseTo(5_685, 2)
  })
})

describe('computeBox1Tax — narekening €60.000 bruto 2026 (geen AOW/kind/woning)', () => {
  // Handmatige som tegen de officiële 2026-tabellen (zie kaart):
  //   AHK          = 3115 − (60000−29736)·6,398%  = €1.178,71
  //   arbeidskorting = 5685 − (60000−45592)·6,51%  = €4.747,04
  //   tax          = heffing €21.832,22 − korting €5.925,75 = €15.906,47
  // ≈ €230 lager dan de oude (foute) uitkomst van ±€16.136.
  const r = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })

  it('algemene heffingskorting = €1.178,71', () => {
    expect(r.algemeneHeffingskorting).toBeCloseTo(1_178.71, 1)
  })
  it('arbeidskorting = €4.747,04', () => {
    expect(r.arbeidskorting).toBeCloseTo(4_747.04, 1)
  })
  it('netto te betalen Box 1 = €15.906,47', () => {
    expect(r.tax).toBeCloseTo(15_906.47, 1)
  })
  it('≈ €230 lager dan de oude foute uitkomst (±€16.136)', () => {
    expect(16_136 - r.tax).toBeGreaterThan(200)
    expect(16_136 - r.tax).toBeLessThan(260)
  })
})

describe('computeBox1Tax — AOW-scenario €60.000 bruto 2026', () => {
  const aow = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026, aow: true })
  const regulier = computeBox1Tax({ grossYearlyIncome: 60_000, year: 2026 })

  it('AOW-variant AHK: 1556 − (60000−29737)·3,195% = €589,10', () => {
    expect(aow.algemeneHeffingskorting).toBeCloseTo(589.10, 1)
    expect(aow.algemeneHeffingskorting).toBeLessThan(regulier.algemeneHeffingskorting)
  })

  it('AOW-variant arbeidskorting ≈ €2.370 (gehalveerde opbouw + afbouw)', () => {
    expect(aow.arbeidskorting).toBeCloseTo(2_370.38, 1)
    expect(aow.arbeidskorting).toBeLessThan(regulier.arbeidskorting)
  })

  it('AOW betaalt minder Box 1 dan regulier (lager schijf-1 tarief weegt zwaarder)', () => {
    expect(aow.tax).toBeLessThan(regulier.tax)
  })
})

describe('BOX1_PARAMS 2025 — regressie (2024-waarden waren doorgeschoven)', () => {
  it('arbeidskorting-afbouwstart €43.071 (was 2024-waarde €39.957)', () => {
    expect(BOX1_PARAMS[2025].arbeidskorting.afbouwStart).toBe(43_071)
  })
  it('IACK max €2.986 (was 2024-waarde €2.950)', () => {
    expect(BOX1_PARAMS[2025].iack.max).toBe(2_986)
  })
  it('Hillen 2025 = 76,67% (was 2024-waarde 73,33%)', () => {
    expect(BOX1_PARAMS[2025].hillenPct).toBeCloseTo(0.7667, 4)
  })
  it('AHK 2025 blijft correct (€3.068 / €28.406 / 6,337%)', () => {
    const ahk = BOX1_PARAMS[2025].algemeneHeffingskorting
    expect(ahk.max).toBe(3_068)
    expect(ahk.afbouwStart).toBe(28_406)
    expect(ahk.afbouwRate).toBeCloseTo(0.06337, 5)
  })
  it('AOW-korting-varianten 2025 aanwezig (AHK max €1.536, arbeidskorting max €2.802)', () => {
    expect(BOX1_PARAMS[2025].algemeneHeffingskortingAow.max).toBe(1_536)
    expect(BOX1_PARAMS[2025].arbeidskortingAow.max).toBe(2_802)
  })
})

// ── Arch F1: marginaal-tarief vuistregel afgeleid uit BOX1_PARAMS ─────────────
// Vervangt de vroegere 2024-hardcodes 0,3697/0,4950 en €75.518. De tarieven
// worden per belastingjaar uit de schijven afgeleid; de laag/hoog-keuze volgt
// de netto-maandinkomen-drempel.

describe('schijfGrensVoor — topschijf-grens uit BOX1_PARAMS', () => {
  it('2026 = €78.426 (bovengrens één-na-laatste schijf)', () => {
    expect(schijfGrensVoor(2026)).toBe(78_426)
  })
  it('2025 = €76.817', () => {
    expect(schijfGrensVoor(2025)).toBe(76_817)
  })
  it('default = lopend belastingjaar (CURRENT_TAX_YEAR)', () => {
    expect(schijfGrensVoor()).toBe(schijfGrensVoor(CURRENT_TAX_YEAR))
  })
  it('is nooit de oude 2024-hardcode €75.518', () => {
    expect(schijfGrensVoor(2026)).not.toBe(75_518)
  })
})

describe('deriveMarginaalTarief — per jaar uit BOX1_PARAMS', () => {
  it('2026 laag = schijf-1-tarief 35,75% (geen inkomen)', () => {
    expect(deriveMarginaalTarief({ year: 2026 })).toBeCloseTo(0.3575, 4)
  })
  it('2026 hoog = topschijf 49,5% (netto boven de drempel)', () => {
    expect(deriveMarginaalTarief({ year: 2026, netMonthlyIncome: 5000 })).toBeCloseTo(0.495, 4)
  })
  it('2025 laag = schijf-1-tarief 35,82%', () => {
    expect(deriveMarginaalTarief({ year: 2025 })).toBeCloseTo(0.3582, 4)
  })
  it('laag ≠ de oude 2024-hardcode 0,3697', () => {
    expect(deriveMarginaalTarief({ year: 2026 })).not.toBe(0.3697)
  })
  it('drempel: precies op de grens telt als laag, erboven als hoog', () => {
    expect(deriveMarginaalTarief({ year: 2026, netMonthlyIncome: MARGINAAL_TARIEF_NETTO_DREMPEL })).toBeCloseTo(0.3575, 4)
    expect(deriveMarginaalTarief({ year: 2026, netMonthlyIncome: MARGINAAL_TARIEF_NETTO_DREMPEL + 1 })).toBeCloseTo(0.495, 4)
  })
  it('null/0 inkomen → laag tarief (geen crash)', () => {
    expect(deriveMarginaalTarief({ year: 2026, netMonthlyIncome: null })).toBeCloseTo(0.3575, 4)
    expect(deriveMarginaalTarief({ year: 2026, netMonthlyIncome: 0 })).toBeCloseTo(0.3575, 4)
  })
  it('default jaar = CURRENT_TAX_YEAR', () => {
    expect(deriveMarginaalTarief()).toBe(deriveMarginaalTarief({ year: CURRENT_TAX_YEAR }))
    expect(deriveMarginaalTarief()).toBeCloseTo(BOX1_PARAMS[CURRENT_TAX_YEAR].schijven[0].tarief, 6)
  })
})
