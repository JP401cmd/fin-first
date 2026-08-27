import { describe, it, expect } from 'vitest'
import {
  BOX3_PARAMS,
  BOX3_TOOLTIPS,
  BOX3_UITSLUITING_REDENEN,
  BOX3_CLASSIFICATIE_NOTITIES,
  calculateBox3,
  classifyAsset,
  classifyDebt,
  generateBox3Optimizations,
  type Box3Input,
} from './box3-data'
import type { Asset, AssetType } from './asset-data'
import type { Debt, DebtType } from './debt-data'

/**
 * Snapshot- en sanity-tests voor de Box 3 vermogensrendementsheffing-motor.
 *
 * Doel: de gecorrigeerde 2026-constanten vastleggen (forfaits, tarief,
 * heffingsvrij vermogen) zodat een toekomstige onbedoelde wijziging hier
 * breekt, plus een sanity-check op calculateBox3 en de groen-beleggen-tip
 * met het 2026-vrijstellingsbedrag (≈ €26.715 p.p.).
 */

/** Minimale Asset-fixture — alleen de velden die de Box 3-motor leest. */
function makeAsset(over: Partial<Asset> & { asset_type: Asset['asset_type']; current_value: number }): Asset {
  return {
    id: over.id ?? `asset-${Math.random().toString(36).slice(2)}`,
    is_active: true,
    tax_benefit: null,
    ...over,
  } as Asset
}

function makeInput(over: Partial<Box3Input>): Box3Input {
  return {
    assets: [],
    debts: [] as Debt[],
    hasPartner: false,
    dailyExpenses: 0,
    year: 2026,
    ...over,
  }
}

describe('BOX3_PARAMS — snapshot 2026-constanten', () => {
  it('legt de gecorrigeerde 2026-waarden vast', () => {
    expect(BOX3_PARAMS[2026]).toEqual({
      forfaitSpaargeld: 0.0128,
      forfaitBeleggingen: 0.0600,
      forfaitSchulden: 0.0270,
      tarief: 0.36,
      heffingsvrijSingle: 59_357,
      heffingsvrijPartner: 118_714,
      schuldendrempelSingle: 3_800,
      schuldendrempelPartner: 7_600,
    })
  })

  it('heffingsvrijPartner is exact het dubbele van single (2026)', () => {
    expect(BOX3_PARAMS[2026].heffingsvrijPartner).toBe(
      BOX3_PARAMS[2026].heffingsvrijSingle * 2,
    )
  })
})

describe('calculateBox3 — sanity', () => {
  it('vermogen onder het heffingsvrij vermogen → geen belasting', () => {
    const r = calculateBox3(
      makeInput({
        assets: [makeAsset({ asset_type: 'savings', current_value: 40_000 })],
      }),
    )
    expect(r.totaalSpaargeld).toBe(40_000)
    expect(r.grondslagSparen).toBe(0) // 40_000 < heffingsvrij 59_357
    expect(r.tax).toBe(0)
  })

  it('beleggingen ruim boven het heffingsvrij vermogen → positieve heffing', () => {
    const r = calculateBox3(
      makeInput({
        assets: [makeAsset({ asset_type: 'investment', current_value: 200_000 })],
      }),
    )
    expect(r.totaalBeleggingen).toBe(200_000)
    expect(r.tax).toBeGreaterThan(0)
    // forfaitair rendement beleggingen = 200_000 × 6% = 12_000
    expect(r.forfaitairBeleggingen).toBeCloseTo(200_000 * 0.06, 2)
    // grondslag sparen = 200_000 - 59_357
    expect(r.grondslagSparen).toBeCloseTo(200_000 - 59_357, 2)
  })

  it('eigen woning valt buiten Box 3 (Box 1)', () => {
    const r = calculateBox3(
      makeInput({
        assets: [makeAsset({ asset_type: 'eigen_huis', current_value: 500_000 })],
      }),
    )
    expect(r.totaalUitgesloten).toBe(500_000)
    expect(r.totaalSpaargeld).toBe(0)
    expect(r.totaalBeleggingen).toBe(0)
    expect(r.tax).toBe(0)
  })
})

describe('generateBox3Optimizations — groen-beleggen-tip 2026', () => {
  it('bevat de groen-beleggen-tip met het 2026-bedrag (≈ €26.715 p.p.)', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 200_000 })],
      dailyExpenses: 100,
    })
    const result = calculateBox3(input)
    expect(result.tax).toBeGreaterThan(0)

    const tips = generateBox3Optimizations(result, input)
    const groen = tips.find(t => t.id === 'groene-beleggingen')
    expect(groen).toBeDefined()
    // Assert op de aanwezigheid van het 2026-bedrag, niet op exacte string.
    expect(groen!.description).toContain('26.715')
  })

  it('verdubbelt het groen-vrijstellingsbedrag voor fiscaal partners (≈ €53.430)', () => {
    const input = makeInput({
      hasPartner: true,
      assets: [makeAsset({ asset_type: 'investment', current_value: 400_000 })],
      dailyExpenses: 100,
    })
    const result = calculateBox3(input)
    expect(result.tax).toBeGreaterThan(0)

    const tips = generateBox3Optimizations(result, input)
    const groen = tips.find(t => t.id === 'groene-beleggingen')
    expect(groen).toBeDefined()
    expect(groen!.description).toContain('53.430')
  })
})

// ── M23 · Box 3-INDELING (classifyAsset / classifyDebt) ─────────────────────
//
// Aanleiding: de indeling zette vrijgestelde bezittingen IN box 3 (roerende
// zaken voor eigen gebruik, pensioenaanspraken zonder vlag) en trok een
// niet-aftrekbare belastingschuld ERAF. De oude `classifyAsset` eindigde op een
// fall-through "alles overige is een belegging", waardoor elk nieuw assettype
// stilzwijgend op het 6%-forfait belandde.
//
// TOLERANTIE: overal ABSOLUUT (exacte gelijkheid op de totalen, €0,01 op de
// heffing). Bewuste keuze — dit is een INDELINGS-fout, geen afrondingsfout: een
// post zit wél of niet in de grondslag, en het verschil is een heel bedrag.
// Een relatieve marge zou precies de klasse verbergen die deze suite vangt, en
// zou bovendien rond de heffingsvrije voet (waar de heffing bijna nul is)
// betekenisloos worden.

describe('classifyAsset — vrijgestelde bezittingen vallen buiten Box 3', () => {
  it('vehicle (roerende zaak eigen gebruik) valt BUITEN Box 3', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'vehicle', current_value: 8_000, subtype: 'auto_eigendom' }))
    expect(r.category).toBeNull()
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.roerendEigenGebruik)
  })

  it('physical/sieraden en physical/inboedel vallen BUITEN Box 3', () => {
    for (const subtype of ['sieraden', 'inboedel']) {
      const r = classifyAsset(makeAsset({ asset_type: 'physical', current_value: 2_500, subtype }))
      expect(r.category, subtype).toBeNull()
    }
  })

  it('physical/kunst en physical/verzameling blijven IN Box 3 (hoofdzakelijk ter belegging)', () => {
    for (const subtype of ['kunst', 'verzameling']) {
      const r = classifyAsset(makeAsset({ asset_type: 'physical', current_value: 14_000, subtype }))
      expect(r.category, subtype).toBe('beleggingen')
      expect(r.note).toBe(BOX3_CLASSIFICATIE_NOTITIES.physicalTerBelegging)
    }
  })

  it('physical zonder subtype valt BUITEN Box 3 — de wettelijke hoofdregel voor roerende zaken', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'physical', current_value: 25_000 }))
    expect(r.category).toBeNull()
    expect(r.note).toBe(BOX3_CLASSIFICATIE_NOTITIES.roerendMogelijkBelegging)
  })

  it('other blijft conservatief IN Box 3, maar met een toelichting', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'other', current_value: 800 }))
    expect(r.category).toBe('beleggingen')
    expect(r.note).toBe(BOX3_CLASSIFICATIE_NOTITIES.overigeZaak)
  })

  it('retirement valt BUITEN Box 3, ook zonder tax_benefit-vlag (de schaal-as)', () => {
    // De vlag is een los vinkje dat in het formulier op false staat tot de
    // gebruiker hem aanraakt; 2 van de 4 productie-pensioenrijen missen hem.
    // Voorheen kwam zo'n rij volledig op het 6%-forfait terecht.
    const metVlag = classifyAsset(makeAsset({ asset_type: 'retirement', current_value: 200_000, tax_benefit: true }))
    expect(metVlag.category).toBeNull()
    expect(metVlag.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.pensioenFiscaal)
    expect(metVlag.note).toBeNull()

    const zonderVlag = classifyAsset(makeAsset({ asset_type: 'retirement', current_value: 200_000, tax_benefit: null }))
    expect(zonderVlag.category).toBeNull()
    expect(zonderVlag.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.pensioenAangenomen)
    expect(zonderVlag.note).toBe(BOX3_CLASSIFICATIE_NOTITIES.pensioenZonderVlag)
  })

  it('levensverzekering blijft IN Box 3; uitvaartverzekering krijgt een eigen toelichting', () => {
    const kapitaal = classifyAsset(makeAsset({ asset_type: 'levensverzekering', current_value: 4_500, subtype: 'kapitaalverzekering' }))
    expect(kapitaal.category).toBe('beleggingen')
    expect(kapitaal.note).toBe(BOX3_TOOLTIPS.levensverzekering)

    const uitvaart = classifyAsset(makeAsset({ asset_type: 'levensverzekering', current_value: 4_500, subtype: 'uitvaartverzekering' }))
    expect(uitvaart.category).toBe('beleggingen')
    expect(uitvaart.note).toBe(BOX3_CLASSIFICATIE_NOTITIES.uitvaartverzekering)
  })

  it('dekt ELK AssetType — geen enkel type valt nog door een fall-through', () => {
    // De exhaustive switch geeft compile-rood bij een nieuw AssetType; deze test
    // bewaakt de runtime-kant: elk type levert een uitspraak, en die uitspraak is
    // of een categorie of een uitgesproken uitsluitingsreden — nooit allebei leeg.
    const ALLE_TYPEN: AssetType[] = [
      'cash', 'savings', 'investment', 'retirement', 'eigen_huis', 'real_estate',
      'crypto', 'vehicle', 'physical', 'deelneming', 'levensverzekering', 'vordering', 'other',
    ]
    for (const asset_type of ALLE_TYPEN) {
      const r = classifyAsset(makeAsset({ asset_type, current_value: 1_000 }))
      if (r.category === null) {
        expect(r.exclusionReason, `${asset_type} mist een uitsluitingsreden`).toBeTruthy()
      } else {
        expect(['spaargeld', 'beleggingen']).toContain(r.category)
        expect(r.exclusionReason, `${asset_type} heeft categorie en uitsluitingsreden`).toBeNull()
      }
    }
  })

  it('onbekend asset_type levert geen verzonnen forfait op', () => {
    // asset_type is een vrije tekstkolom; een waarde buiten de union mag niet
    // stilzwijgend op 6% belanden (dat was de fall-through-bug).
    const r = classifyAsset(makeAsset({ asset_type: 'iets_nieuws' as AssetType, current_value: 50_000 }))
    expect(r.category).toBeNull()
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.onbekendType)
  })
})

describe('classifyAsset — box3_vrijgesteld als overschrijving (Fase 3)', () => {
  it('true haalt een belegging uit de grondslag, met de eigen reden van de gebruiker', () => {
    const r = classifyAsset(makeAsset({
      asset_type: 'investment', current_value: 30_000,
      box3_vrijgesteld: true, box3_vrijstelling_reden: 'Groenfonds — vrijgesteld',
    }))
    expect(r.category).toBeNull()
    expect(r.exclusionReason).toBe('Groenfonds — vrijgesteld')
  })

  it('true zonder reden valt terug op de standaardtekst', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'investment', current_value: 30_000, box3_vrijgesteld: true }))
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.handmatigVrijgesteld)
  })

  it('false zet een afgeleid-vrijgestelde bezitting terug IN de grondslag', () => {
    const auto = classifyAsset(makeAsset({ asset_type: 'vehicle', current_value: 60_000, box3_vrijgesteld: false }))
    expect(auto.category).toBe('beleggingen')
    expect(auto.exclusionReason).toBeNull()

    // Een spaartype houdt bij een expliciete false het LAGE spaarforfait.
    const spaar = classifyAsset(makeAsset({ asset_type: 'savings', current_value: 10_000, box3_vrijgesteld: false }))
    expect(spaar.category).toBe('spaargeld')
  })

  it('null (de normale stand) is geen overschrijving — de afleiding blijft leidend', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'vehicle', current_value: 8_000, box3_vrijgesteld: null }))
    expect(r.category).toBeNull()
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.roerendEigenGebruik)
  })
})

describe('classifyDebt — belastingschuld is niet aftrekbaar', () => {
  const geenHuis = new Set<string>()

  it('belastingschuld valt BUITEN Box 3 (art. 5.3 lid 3 onder b Wet IB 2001)', () => {
    const r = classifyDebt({ debt_type: 'belastingschuld', current_balance: 1_200 } as unknown as Debt, geenHuis)
    expect(r.inBox3).toBe(false)
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.belastingschuld)
  })

  it('geldt voor elk belastingschuld-subtype — dit datamodel kent geen erfbelasting-uitzondering', () => {
    for (const subtype of ['inkomstenbelasting', 'voorlopige_aanslag', 'box3_nabetaling', 'btw', 'overig_belasting']) {
      const r = classifyDebt({ debt_type: 'belastingschuld', subtype, current_balance: 500 } as unknown as Debt, geenHuis)
      expect(r.inBox3, subtype).toBe(false)
    }
  })

  it('de eigenwoninghypotheek-tak blijft ongewijzigd', () => {
    const huisIds = new Set(['huis-1'])
    const hypotheek = classifyDebt({
      debt_type: 'mortgage', linked_asset_id: 'huis-1', is_tax_deductible: true, current_balance: 350_000,
    } as unknown as Debt, huisIds)
    expect(hypotheek.inBox3).toBe(false)
    expect(hypotheek.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.eigenwoningHypotheek)

    // Een ONGELINKTE hypotheek blijft bewust in Box 3 (bv. een tweede woning).
    const losseHypotheek = classifyDebt({
      debt_type: 'mortgage', linked_asset_id: null, is_tax_deductible: true, current_balance: 200_000,
    } as unknown as Debt, huisIds)
    expect(losseHypotheek.inBox3).toBe(true)
  })

  it('alle overige schuldtypen blijven aftrekbaar in Box 3', () => {
    const OVERIGE: DebtType[] = [
      'personal_loan', 'student_loan', 'car_loan', 'credit_card',
      'revolving_credit', 'payment_plan', 'familielening', 'dga_schuld', 'other',
    ]
    for (const debt_type of OVERIGE) {
      const r = classifyDebt({ debt_type, current_balance: 1_000 } as unknown as Debt, geenHuis)
      expect(r.inBox3, debt_type).toBe(true)
      expect(r.exclusionReason, debt_type).toBeNull()
    }
  })
})

describe('calculateBox3 — persona-golden op de Lisa-set (M23)', () => {
  // De bezittingen/schulden van persona Lisa (lib/test-personas.ts), waarop de
  // bevinding is gereproduceerd. VOOR M23: beleggingen €80.500, uitgesloten
  // €395.000, box 3-schulden €18.270.
  function lisaAssets(): Asset[] {
    return [
      makeAsset({ id: 'a1', asset_type: 'investment', current_value: 42_000, subtype: 'indexfonds' }),
      makeAsset({ id: 'a2', asset_type: 'investment', current_value: 8_000, subtype: 'indexfonds' }),
      makeAsset({ id: 'huis', asset_type: 'eigen_huis', current_value: 385_000 }),
      makeAsset({ id: 'a4', asset_type: 'vehicle', current_value: 8_000, subtype: 'auto_eigendom' }),
      makeAsset({ id: 'a5', asset_type: 'savings', current_value: 4_000, subtype: 'deposito' }),
      makeAsset({ id: 'a6', asset_type: 'retirement', current_value: 8_000, subtype: 'uitkeringsregeling', tax_benefit: true }),
      makeAsset({ id: 'a7', asset_type: 'real_estate', current_value: 12_000, subtype: 'beleggingspand' }),
      makeAsset({ id: 'a8', asset_type: 'crypto', current_value: 1_200, subtype: 'bitcoin' }),
      makeAsset({ id: 'a9', asset_type: 'physical', current_value: 2_500, subtype: 'sieraden' }),
      makeAsset({ id: 'a10', asset_type: 'deelneming', current_value: 2_000, subtype: 'familie_bv' }),
      makeAsset({ id: 'a11', asset_type: 'levensverzekering', current_value: 4_500, subtype: 'kapitaalverzekering' }),
      makeAsset({ id: 'a12', asset_type: 'vordering', current_value: 1_500, subtype: 'familielening' }),
      makeAsset({ id: 'a13', asset_type: 'other', current_value: 800 }),
    ]
  }

  function lisaDebts(): Debt[] {
    const d = (debt_type: string, current_balance: number, extra: Record<string, unknown> = {}) =>
      ({ debt_type, current_balance, is_active: true, ...extra }) as unknown as Debt
    return [
      d('mortgage', 350_000, { linked_asset_id: 'huis', is_tax_deductible: true }),
      d('personal_loan', 2_800),
      d('student_loan', 4_500),
      d('car_loan', 2_000),
      d('credit_card', 250),
      d('revolving_credit', 800),
      d('payment_plan', 320),
      d('belastingschuld', 1_200, { subtype: 'inkomstenbelasting' }),
      d('familielening', 6_000),
      d('dga_schuld', 200),
      d('other', 200),
    ]
  }

  const result = calculateBox3(makeInput({ assets: lisaAssets(), debts: lisaDebts() }))

  it('auto en sieraden verhuizen van beleggingen naar uitgesloten', () => {
    // 80.500 − 8.000 (auto) − 2.500 (sieraden) = 70.000
    expect(result.totaalBeleggingen).toBe(70_000)
    // 395.000 + 8.000 + 2.500 = 405.500
    expect(result.totaalUitgesloten).toBe(405_500)
    expect(result.totaalSpaargeld).toBe(4_000)
  })

  it('de indeling verplaatst waarde, hij laat niets verdampen', () => {
    // Som-invariant: elke euro landt in precies één emmer, voor en na de fix.
    const totaal = result.totaalSpaargeld + result.totaalBeleggingen + result.totaalUitgesloten
    expect(totaal).toBe(479_500)
  })

  it('de belastingschuld verlaat de aftrekbare schulden', () => {
    // 18.270 − 1.200 = 17.070
    expect(result.totaalBox3Schulden).toBe(17_070)
    // 350.000 hypotheek + 1.200 belastingschuld
    expect(result.totaalUitgeslotenSchulden).toBe(351_200)
    // Som-invariant op de schuldkant.
    expect(result.totaalBox3Schulden + result.totaalUitgeslotenSchulden).toBe(368_270)
  })

  it('de heffing daalt fors — tolerantie ABSOLUUT (€0,01)', () => {
    // Voor M23 rekende dezelfde set €246,38. De vier fouten wijzen twee kanten
    // op: F1-F3 maakten de heffing te hoog, F4 (belastingschuld) te laag.
    expect(result.tax).toBeCloseTo(31.68, 2)
    expect(result.grondslagSparen).toBeCloseTo(1_373, 2)
  })
})
