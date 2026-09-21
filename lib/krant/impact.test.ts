import { describe, expect, it } from 'vitest'
import { BOX3_PARAMS, computeBox3Heffing } from '@/lib/box3-data'
import { BOX1_PARAMS, computeBox1Tax, grossFromNet } from '@/lib/box1-tax'
import { berekenImpact, overlayBox1, overlayBox3, standaardImpactContext, type ImpactUitkomst } from './impact'
import { LEEG_PROFIEL, type NieuwsprofielV1 } from './profiel'
import type { DuidingV1 } from './duiding-schema'
import { AOW_RIJEN, ARTIKELEN, PROFIEL_DAAN, PROFIEL_MARIJKE } from './editie.fixture'

const ctx = standaardImpactContext(AOW_RIJEN, 2026)

function duidingVan(id: string): DuidingV1 {
  const a = ARTIKELEN.find((x) => x.id === id)
  if (!a?.duiding) throw new Error(`fixture ${id} zonder duiding`)
  return a.duiding
}

function bereik(u: ImpactUitkomst) {
  if (u.soort !== 'bereik') throw new Error(`verwachtte bereik, kreeg ${JSON.stringify(u)}`)
  return u
}

const alleen: NieuwsprofielV1 = {
  ...LEEG_PROFIEL,
  huishouden: 'alleen',
  spaargeld: '25k-50k',
  beleggingen: { band: 'tot-25k', vorm: ['fondsen'] },
  schulden: ['geen'],
}

describe('impact — box 3 op de bandranden', () => {
  it('heffingsvrij 59.357 valt in de grondslagband 25k–75k → onbekend (drempel-in-band), geen gok', () => {
    expect(berekenImpact(duidingVan('a01-box3-heffingsvrij'), alleen, ctx)).toEqual({ soort: 'onbekend', reden: 'drempel-in-band' })
  })

  it('100k–250k spaargeld, geen beleggingen: 643 × 1,28% × 36% ≈ € 3 per jaar minder, met de hand nagerekend én via computeBox3Heffing', () => {
    const profiel: NieuwsprofielV1 = { ...alleen, spaargeld: '100k-250k', beleggingen: { band: 'geen', vorm: null } }
    const u = bereik(berekenImpact(duidingVan('a01-box3-heffingsvrij'), profiel, ctx))
    expect(u).toMatchObject({ lo: 3, hi: 3, richting: 'minder', eenheid: 'eur-per-jaar', vorm: 'direct', jaar: 2027 })
    // Consume, don't recompute: dezelfde motor, dezelfde uitkomst.
    const oud = BOX3_PARAMS[2026]
    const nieuw = { ...oud, heffingsvrijSingle: 60_000 }
    const delta = (s: number) =>
      computeBox3Heffing({ spaargeld: s, beleggingen: 0, box3Schulden: 0 }, false, nieuw).tax -
      computeBox3Heffing({ spaargeld: s, beleggingen: 0, box3Schulden: 0 }, false, oud).tax
    expect(Math.round(Math.abs(delta(100_000)))).toBe(u.lo)
    expect(Math.round(Math.abs(delta(250_000)))).toBe(u.hi)
    expect(Math.round(643 * 0.0128 * 0.36)).toBe(3)
  })

  it('open bovenband → alleen een ondergrens ("minstens")', () => {
    const profiel: NieuwsprofielV1 = { ...alleen, spaargeld: 'boven-250k', beleggingen: { band: 'geen', vorm: null } }
    const u = bereik(berekenImpact(duidingVan('a01-box3-heffingsvrij'), profiel, ctx))
    expect(u.lo).toBe(3)
    expect(u.hi).toBeNull()
  })

  it('fiscaal partner rekent met de partnerdrempel; samenwonend zonder fiscaal partner als alleenstaand (keuze 10)', () => {
    const basis: NieuwsprofielV1 = { ...alleen, spaargeld: '100k-250k', beleggingen: { band: 'geen', vorm: null } }
    const partner = bereik(berekenImpact(duidingVan('a01-box3-heffingsvrij'), { ...basis, huishouden: 'fiscaal-partner' }, ctx))
    // Met partner is het heffingsvrij vermogen 118.714: 100k valt eronder (0), 250k erboven → drempel in band? Nee: de
    // nieuwe waarde (60.000 single) raakt de partnerdrempel niet — beide randen 0 → geen verschil.
    expect(partner).toMatchObject({ lo: 0, hi: 0, richting: 'geen' })
    const samenwonend = bereik(berekenImpact(duidingVan('a01-box3-heffingsvrij'), { ...basis, huishouden: 'samenwonend-zonder-fiscaal-partner' }, ctx))
    expect(samenwonend).toMatchObject({ lo: 3, hi: 3 })
  })

  it('ontbrekend huishouden of spaargeld → ontbreekt met de velden, nooit een bedrag', () => {
    expect(berekenImpact(duidingVan('a01-box3-heffingsvrij'), { ...alleen, huishouden: null }, ctx)).toEqual({ soort: 'ontbreekt', velden: ['huishouden'] })
    expect(berekenImpact(duidingVan('a01-box3-heffingsvrij'), { ...alleen, spaargeld: null, schulden: null }, ctx)).toEqual({
      soort: 'ontbreekt',
      velden: ['spaargeld', 'schulden'],
    })
  })

  it('overlayBox3 deelt _pct-params door 100 (drempel-fracties, DREMPEL_EENHEID) en laat de rest staan', () => {
    const nieuw = overlayBox3(BOX3_PARAMS[2026], { jaar: 2027, heffingsvrij_single: null, heffingsvrij_partner: null, forfait_spaargeld_pct: null, forfait_beleggingen_pct: 6.5, forfait_schulden_pct: null, tarief_pct: 38 })
    expect(nieuw.forfaitBeleggingen).toBeCloseTo(0.065, 6)
    expect(nieuw.tarief).toBeCloseTo(0.38, 6)
    expect(nieuw.heffingsvrijSingle).toBe(BOX3_PARAMS[2026].heffingsvrijSingle)
  })

  it('een jaar zonder ingangsdatum → jaar-onbekend; een jaar vóór de eerste parametertabel → geen-canonieke-waarde', () => {
    const d = duidingVan('a01-box3-heffingsvrij')
    const zonderJaar: DuidingV1 = { ...d, ingangsdatum: null, mechanisme: { ...d.mechanisme!, params: { ...(d.mechanisme!.params as Record<string, unknown>), jaar: null } } as DuidingV1['mechanisme'] }
    expect(berekenImpact(zonderJaar, alleen, ctx)).toEqual({ soort: 'onbekend', reden: 'jaar-onbekend' })
    const teVroeg: DuidingV1 = { ...d, mechanisme: { ...d.mechanisme!, params: { ...(d.mechanisme!.params as Record<string, unknown>), jaar: 2020 } } as DuidingV1['mechanisme'] }
    expect(berekenImpact(teVroeg, alleen, ctx)).toEqual({ soort: 'onbekend', reden: 'geen-canonieke-waarde' })
  })
})

describe('impact — box 1 via grossFromNet op de nettoband (U4)', () => {
  const profiel: NieuwsprofielV1 = { ...LEEG_PROFIEL, geboortejaar: 1990, werk: ['loondienst'], inkomen: '2500-3250' }

  it('schijf 1 van 35,75% naar 36%: meer belasting op beide randen, gelijk aan de motor met params-override', () => {
    const u = bereik(berekenImpact(duidingVan('a02-box1-schijf1'), profiel, ctx))
    expect(u).toMatchObject({ richting: 'meer', eenheid: 'eur-per-jaar', vorm: 'direct', jaar: 2027 })
    expect(u.lo).toBeGreaterThan(0)
    expect(u.hi!).toBeGreaterThan(u.lo)
    const oud = BOX1_PARAMS[2026]
    const nieuw = overlayBox1(oud, { jaar: 2027, schijf_1_grens: null, schijf_2_grens: null, schijf_1_tarief_pct: 36, schijf_2_tarief_pct: null, schijf_3_tarief_pct: null, algemene_heffingskorting_max: null, arbeidskorting_max: null })
    const delta = (nettoMaand: number) => {
      const gross = grossFromNet(nettoMaand * 12, 2026)
      return computeBox1Tax({ grossYearlyIncome: gross, year: 2026, params: nieuw }).tax - computeBox1Tax({ grossYearlyIncome: gross, year: 2026 }).tax
    }
    expect(Math.round(delta(2_500))).toBe(u.lo)
    expect(Math.round(delta(3_250))).toBe(u.hi)
    // Vuistregel: 0,25 procentpunt over een bruto van ruim € 37.000 in schijf 1 ≈ € 90 per jaar.
    expect(u.lo).toBeGreaterThan(80)
    expect(u.lo).toBeLessThan(110)
  })

  it('AOW-gerechtigd in het regeljaar (1957 in 2027) met een schijf-1-tarief → niet-afleidbaar; werk = pensioen is daarvoor geen bewijs', () => {
    expect(berekenImpact(duidingVan('a02-box1-schijf1'), PROFIEL_MARIJKE, ctx)).toEqual({ soort: 'onbekend', reden: 'niet-afleidbaar' })
    // Vroegpensioen op 60 (1966, AOW pas 2033/2034): niet-AOW-schijven, zonder arbeidskorting.
    const vroeg: NieuwsprofielV1 = { ...profiel, geboortejaar: 1966, werk: ['pensioen'] }
    const u = bereik(berekenImpact(duidingVan('a02-box1-schijf1'), vroeg, ctx))
    expect(u.richting).toBe('meer')
    const oud = BOX1_PARAMS[2026]
    const nieuw = overlayBox1(oud, { jaar: 2027, schijf_1_grens: null, schijf_2_grens: null, schijf_1_tarief_pct: 36, schijf_2_tarief_pct: null, schijf_3_tarief_pct: null, algemene_heffingskorting_max: null, arbeidskorting_max: null })
    const gross = grossFromNet(2_500 * 12, 2026, { arbeidsinkomen: 0 })
    expect(u.lo).toBe(Math.round(computeBox1Tax({ grossYearlyIncome: gross, year: 2026, arbeidsinkomen: 0, params: nieuw }).tax - computeBox1Tax({ grossYearlyIncome: gross, year: 2026, arbeidsinkomen: 0 }).tax))
  })

  it('bereikt het cohort de AOW-leeftijd in het regeljaar zelf (1960 → 2027), dan is de som drempel-in-band', () => {
    expect(berekenImpact(duidingVan('a02-box1-schijf1'), { ...profiel, geboortejaar: 1960 }, ctx)).toEqual({ soort: 'onbekend', reden: 'drempel-in-band' })
  })

  it('de huidige waarde is exact het jaar ervóór: een 2028-artikel zonder 2027-tabel is geen-canonieke-waarde', () => {
    const d = duidingVan('a02-box1-schijf1')
    const d2028: DuidingV1 = { ...d, mechanisme: { ...d.mechanisme!, params: { ...(d.mechanisme!.params as Record<string, unknown>), jaar: 2028 } } as DuidingV1['mechanisme'] }
    expect(berekenImpact(d2028, profiel, ctx)).toEqual({ soort: 'onbekend', reden: 'geen-canonieke-waarde' })
  })

  it('zonder inkomen, geboortejaar of werk → ontbreekt', () => {
    expect(berekenImpact(duidingVan('a02-box1-schijf1'), LEEG_PROFIEL, ctx)).toEqual({ soort: 'ontbreekt', velden: ['inkomen', 'geboortejaar', 'werk'] })
  })
})

describe('impact — AOW-leeftijd', () => {
  /** "Vanaf 2033 +3 maanden" raakt precies het cohort dat in 2033 de AOW-leeftijd bereikt. */
  function aowVanaf(vanaf: number, m = 3): DuidingV1 {
    const d = duidingVan('a03-aow-leeftijd')
    return { ...d, mechanisme: { soort: 'aow-leeftijd', params: { vanaf_jaar: vanaf, verschuiving_maanden: m }, drempel: null } }
  }

  it('raakt alleen het cohort dat in vanaf_jaar aan de beurt is: 1965 (67+3, jan én dec → 2032/2033) → drempel-in-band; 1966 (67+3 / 67+6 → 2033/2034) met vanaf 2034 → drempel-in-band', () => {
    expect(berekenImpact(aowVanaf(2033), { ...LEEG_PROFIEL, geboortejaar: 1965 }, ctx)).toEqual({ soort: 'onbekend', reden: 'drempel-in-band' })
    expect(berekenImpact(aowVanaf(2034), { ...LEEG_PROFIEL, geboortejaar: 1966 }, ctx)).toEqual({ soort: 'onbekend', reden: 'drempel-in-band' })
  })

  it('een cohort dat op beide randen in vanaf_jaar aan de beurt is (1967: 67+6, jan → 2034, dec → 2035?) — 1968 met vanaf 2036 raakt op beide randen', () => {
    // 1968: 1 jan → 67+6 → 2035; 31 dec → 67+6 + maanden → 2036. Ongelijk → drempel-in-band.
    expect(berekenImpact(aowVanaf(2036), { ...LEEG_PROFIEL, geboortejaar: 1968 }, ctx)).toEqual({ soort: 'onbekend', reden: 'drempel-in-band' })
    // 1960: 67+0 op beide randen → 2027 op beide randen: raakt bij vanaf 2027.
    const u = bereik(berekenImpact(aowVanaf(2027), { ...LEEG_PROFIEL, geboortejaar: 1960 }, ctx))
    expect(u).toMatchObject({ lo: 3, hi: 3, eenheid: 'maanden', richting: 'meer' })
    expect(u.aow!.oud[0]).toBeCloseTo(67, 6)
    expect(u.aow!.nieuw[1]).toBeCloseTo(67.25, 6)
  })

  it('de december-rand telt de AOW-maanden mee: 31 dec 1966 + 67 jaar en 6 maanden = 2034, niet 2033', () => {
    // 1966: jan-rand 67+3 → 2033, dec-rand 67+6 → 2034. Vanaf 2033 → ongelijk → drempel-in-band (niet "raakt niet").
    expect(berekenImpact(aowVanaf(2033), { ...LEEG_PROFIEL, geboortejaar: 1966 }, ctx)).toEqual({ soort: 'onbekend', reden: 'drempel-in-band' })
  })

  it('latere cohorten dragen de CBS-prognose al: geen stapeling → buiten-besluit; eerdere cohorten en wie al AOW heeft → raakt niet', () => {
    expect(berekenImpact(aowVanaf(2033), PROFIEL_DAAN, ctx)).toEqual({ soort: 'onbekend', reden: 'buiten-besluit' })
    expect(berekenImpact(aowVanaf(2033), { ...LEEG_PROFIEL, geboortejaar: 1984 }, ctx)).toEqual({ soort: 'onbekend', reden: 'buiten-besluit' })
    expect(bereik(berekenImpact(aowVanaf(2033), PROFIEL_MARIJKE, ctx))).toMatchObject({ lo: 0, hi: 0, richting: 'geen' })
    expect(bereik(berekenImpact(aowVanaf(2033), { ...LEEG_PROFIEL, geboortejaar: 1962 }, ctx))).toMatchObject({ lo: 0, hi: 0 })
  })

  it('zonder AOW-rijen → geen-canonieke-waarde (nooit de 67-terugval van lookupAowAge als bedrag)', () => {
    expect(berekenImpact(duidingVan('a03-aow-leeftijd'), PROFIEL_DAAN, { ...ctx, aowRows: [] })).toEqual({ soort: 'onbekend', reden: 'geen-canonieke-waarde' })
  })
})

describe('impact — studieschuld-rente (keuze 11: constante, gevoeligheid als terugval)', () => {
  const profiel: NieuwsprofielV1 = { ...LEEG_PROFIEL, schulden: ['studieschuld-15k-40k'] }

  it('3% in 2027 tegen 2026 (2,29 / 2,33): € 101 tot € 284 per jaar meer, met de hand nagerekend', () => {
    const u = bereik(berekenImpact(duidingVan('a04-studieschuld-rente'), profiel, ctx))
    // 15.000 × 0,67% = 100,5 → 101 (het delta wordt op vier decimalen gerond; 3 − 2,33 is binair 0,6699…),
    // 40.000 × 0,71% = 284.
    expect(u).toMatchObject({ lo: 101, hi: 284, richting: 'meer', vorm: 'direct' })
  })

  it('stijgt de ene stelselrente en daalt de andere → richting-onbepaald (2,33% in 2026 tegen 2,21 / 2,57)', () => {
    const d = duidingVan('a04-studieschuld-rente')
    const d2026: DuidingV1 = { ...d, mechanisme: { soort: 'studieschuld-rente', params: { jaar: 2026, rente_pct: 2.33 }, drempel: null } }
    expect(berekenImpact(d2026, profiel, ctx)).toEqual({ soort: 'onbekend', reden: 'richting-onbepaald' })
  })

  it('geen canonieke huidige rente voor dat jaar → gevoeligheid: elke 0,25 pp op € 15.000–€ 40.000 is € 38–€ 100', () => {
    const d = duidingVan('a04-studieschuld-rente')
    const d2031: DuidingV1 = { ...d, mechanisme: { soort: 'studieschuld-rente', params: { jaar: 2031, rente_pct: 3 }, drempel: null } }
    expect(bereik(berekenImpact(d2031, profiel, ctx))).toMatchObject({ lo: 38, hi: 100, vorm: 'gevoeligheid', richting: 'geen' })
  })

  it('de laagste band (tot 15k, ondergrens 0) is proportioneel: hoogstens € 107, geen drempel-in-band', () => {
    // 15.000 × 0,71% = 106,5 → 107 (bovengrens; sf15-delta 0,71 is de grootste).
    expect(bereik(berekenImpact(duidingVan('a04-studieschuld-rente'), { ...profiel, schulden: ['studieschuld-tot-15k'] }, ctx))).toMatchObject({ lo: 0, hi: 107, richting: 'meer' })
  })

  it('zonder studieschuld raakt het niet; zonder schuldenveld ontbreekt het', () => {
    expect(bereik(berekenImpact(duidingVan('a04-studieschuld-rente'), { ...profiel, schulden: ['geen'] }, ctx))).toMatchObject({ lo: 0, hi: 0 })
    expect(berekenImpact(duidingVan('a04-studieschuld-rente'), LEEG_PROFIEL, ctx)).toEqual({ soort: 'ontbreekt', velden: ['schulden'] })
  })
})

describe('impact — eigen risico', () => {
  it('165 in 2027 tegen 385 (2026): hoogstens € 220 per jaar minder', () => {
    const u = bereik(berekenImpact(duidingVan('a05-eigen-risico'), PROFIEL_DAAN, ctx))
    expect(u).toMatchObject({ lo: 220, hi: 220, richting: 'minder', eigenRisico: { oud: 385, nieuw: 165 } })
  })

  it('zonder canonieke waarde voor het jaar ervóór → onbekend, geen terugval op een ouder jaar en geen gevoeligheidsvorm', () => {
    expect(berekenImpact(duidingVan('a05-eigen-risico'), PROFIEL_DAAN, { ...ctx, eigenRisico: {} })).toEqual({ soort: 'onbekend', reden: 'geen-canonieke-waarde' })
    const d = duidingVan('a05-eigen-risico')
    const d2028: DuidingV1 = { ...d, mechanisme: { soort: 'eigen-risico', params: { jaar: 2028, bedrag: 165 }, drempel: null } }
    expect(berekenImpact(d2028, PROFIEL_DAAN, ctx)).toEqual({ soort: 'onbekend', reden: 'geen-canonieke-waarde' })
  })

  it('geldt vanaf 18 in het regeljaar: geboren 2009 is 18 in 2027 en wordt geraakt; 2010 niet', () => {
    expect(bereik(berekenImpact(duidingVan('a05-eigen-risico'), { ...LEEG_PROFIEL, geboortejaar: 2009 }, ctx))).toMatchObject({ lo: 220, hi: 220 })
    expect(bereik(berekenImpact(duidingVan('a05-eigen-risico'), { ...LEEG_PROFIEL, geboortejaar: 2010 }, ctx))).toMatchObject({ lo: 0, hi: 0 })
  })
})

describe('impact — marktbewegingen (B5)', () => {
  it('spaarrente: 25k–50k × 0,25 pp = € 63 tot € 125 per jaar, richting geen', () => {
    expect(bereik(berekenImpact(duidingVan('a06-spaarrente'), alleen, ctx))).toMatchObject({ lo: 63, hi: 125, richting: 'geen', vorm: 'gevoeligheid' })
  })

  it('hypotheekrente: alleen bij een rente die binnenkort beweegt; anders rente-staat-vast; zonder rentevast ontbreekt', () => {
    const basis: NieuwsprofielV1 = { ...LEEG_PROFIEL, wonen: 'koop-met-hypotheek', hypotheek: { restschuld: '300k-450k', rentevast: 'variabel' } }
    expect(bereik(berekenImpact(duidingVan('a07-hypotheekrente'), basis, ctx))).toMatchObject({ lo: 750, hi: 1125 })
    expect(berekenImpact(duidingVan('a07-hypotheekrente'), { ...basis, hypotheek: { restschuld: '300k-450k', rentevast: 'boven-5-jaar' } }, ctx)).toEqual({ soort: 'onbekend', reden: 'rente-staat-vast' })
    expect(berekenImpact(duidingVan('a07-hypotheekrente'), { ...basis, hypotheek: { restschuld: '300k-450k', rentevast: null } }, ctx)).toEqual({ soort: 'ontbreekt', velden: ['hypotheek_rentevast'] })
    expect(bereik(berekenImpact(duidingVan('a07-hypotheekrente'), { ...basis, wonen: 'huur-sociaal' }, ctx))).toMatchObject({ lo: 0, hi: 0 })
  })
})

describe('impact — niet-rekenende mechanismen', () => {
  it('toeslag, huur, pensioenregeling, inflatie, beurs en een leeg mechanisme geven niet-rekenend', () => {
    for (const id of ['a08-kinderopvangtoeslag', 'a09-huurverhoging', 'a10-wtp', 'a11-inflatie', 'a12-beurs', 'a15-oud']) {
      expect(berekenImpact(duidingVan(id), PROFIEL_DAAN, ctx), id).toEqual({ soort: 'onbekend', reden: 'niet-rekenend' })
    }
  })
})
