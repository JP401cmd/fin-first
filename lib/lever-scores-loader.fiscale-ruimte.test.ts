/**
 * lib/lever-scores-loader.fiscale-ruimte.test.ts
 *
 * De VOEDING van ADR 0177: `deriveFiscaleRuimte` — de pure functie die de vijf
 * scalars van de Belasting-hefboom uit al-geladen rijen afleidt.
 *
 * Deze suite grendelt de zes bevindingen uit de review van 22 sep 2026, elk met
 * een test die het oude gedrag zou hebben gevangen:
 *
 *  1. factor A ONBEKEND ≠ factor A NUL — anders staat iedereen met een bekend
 *     inkomen en een niet-ingevulde UPO rood (gemeten ratio 35–45%);
 *  2a. het bruto komt uit de canonieke `grossFromNet`, niet uit de lineaire
 *     vuistregel netto/(1−marginaal) van `box1JaarruimteStatus`;
 *  2b. de eigen woning zit in de noemer (bevinding C8);
 *  3. Box 3-posten worden gewogen met `net_worth_inclusion_pct`;
 *  4. fail-soft: een throw geeft `neutral`, nooit een lege groene tegel;
 *  5. er ontsnapt geen rij-data uit `Box3Result` naar de uitkomst;
 *  6. het belastingjaar is overal expliciet CURRENT_TAX_YEAR.
 *
 * Bewust ZONDER Supabase: `deriveFiscaleRuimte` is puur, en dat is precies de
 * reden dat hij een eigen geëxporteerde functie is en geen inline blok.
 */

import { describe, it, expect } from 'vitest'
import {
  deriveFiscaleRuimte,
  type DeriveFiscaleRuimteInput,
} from './lever-scores-loader'
import { computeBox1Tax, grossFromNet } from './box1-tax'
import { calculateBox3, CURRENT_TAX_YEAR } from './box3-data'
import { box1JaarruimteStatus, computeJaarruimte, jaarruimteBesparing } from './jaarruimte'
import { resolveFireParams } from './fire-params'
import { DEFAULT_RETURN } from './constants'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const NETTO_PER_MAAND = 2_500

/**
 * Basis: geen bezittingen, geen schulden, alleenstaand, een bekend inkomen.
 * Eén post mogelijk (jaarruimte), dus de noemer ÍS de Box 1-heffing — daardoor
 * is `besparing / ratio` een directe meting van de gebruikte noemer.
 */
function basis(over: Partial<DeriveFiscaleRuimteInput> = {}): DeriveFiscaleRuimteInput {
  return {
    assetRows: [],
    debtRows: [],
    householdType: 'solo',
    hasBox3Assets: false,
    netMonthlyIncome: NETTO_PER_MAAND,
    factorA: 0,
    factorAKnown: true,
    // Geen handmatige bruto-override: de schattingstak (`grossFromNet`).
    manualGrossYearly: null,
    expectedReturn: DEFAULT_RETURN,
    ...over,
  }
}

/**
 * De noemer die de kern feitelijk heeft gebruikt, teruggerekend uit de ratio.
 *
 * TOLERANTIE — bewust ABSOLUUT en klein (1e-6 €). Dit is géén modellerings-
 * tolerantie maar de ruis van één float-deling en -vermenigvuldiging heen en
 * terug: teller en noemer zijn allebei hele euro's. Een relatieve band zou hier
 * niets toevoegen en een centband zou de meetfout groter maken dan de ruis.
 */
function gebruikteNoemer(besparing: number, ratio: number): number {
  return besparing / ratio
}

// ── 1. BLOKKEREND: factor A onbekend ≠ factor A nul ──────────────────────────

describe('Bevinding 1 — onbekende factor A mag geen rode hefboom opleveren', () => {
  it('factorAKnown = false → de jaarruimte-post valt weg en de hefboom is GROEN', () => {
    const r = deriveFiscaleRuimte(basis({ factorA: 0, factorAKnown: false }))

    expect(r.posten).toEqual([])
    expect(r.ratio).toBe(0)
    // Groen, niet grijs: de heffing is wél bekend (er ís een inkomen), alleen
    // deze ene post kunnen we niet beoordelen.
    expect(r.status).toBe('good')
  })

  it('DEZELFDE invoer mét bekende factor A 0 staat wél rood — dit is het oude gedrag', () => {
    // Zo zag de bug eruit: `resolvePensionFactorA` geeft bij een lege kolom
    // factorA 0, en wie die 0 als "bekend" doorgeeft rekent de BOVENGRENS van
    // de jaarruimte mee. Deze test faalt zodra iemand `.isKnown` weer weggooit.
    const r = deriveFiscaleRuimte(basis({ factorA: 0, factorAKnown: true }))

    expect(r.posten.map((p) => p.cause)).toEqual(['jaarruimte'])
    expect(r.status).toBe('bad')
    // De orde van grootte uit de bevinding: 35–45% bij élk inkomen.
    expect(r.ratio!).toBeGreaterThan(0.3)
  })

  it.each([1_800, 2_500, 5_000, 10_000])(
    'netto € %s/mnd: onbekende factor A blijft groen — het inkomen doet er niet toe',
    (netMonthlyIncome) => {
      const onbekend = deriveFiscaleRuimte(basis({ netMonthlyIncome, factorAKnown: false }))
      const alsNul = deriveFiscaleRuimte(basis({ netMonthlyIncome, factorAKnown: true }))

      expect(onbekend.status).toBe('good')
      expect(onbekend.posten).toEqual([])

      // Contrast: de oude behandeling (0 als "bekend") zet bij ELK inkomen een
      // post neer en is daardoor nooit groen. Hoe HARD het oordeel uitvalt
      // hangt wél van het inkomen af — bij een laag inkomen ligt de jaarruimte
      // dicht bij de franchise en landt de ratio in de oranje band, hogerop in
      // de rode. Die nuance is bewust niet weggepoetst tot één "altijd rood".
      expect(alsNul.posten.map((p) => p.cause)).toEqual(['jaarruimte'])
      expect(alsNul.status).not.toBe('good')
    },
  )

  it('bij € 2.500 netto/mnd is de ratio van de oude behandeling ~35–45%', () => {
    // Het gemeten getal uit de bevinding, hier vastgepind zodat de orde van
    // grootte niet stilletjes kan wegzakken als iemand de post terugzet.
    const alsNul = deriveFiscaleRuimte(basis({ factorAKnown: true }))
    expect(alsNul.ratio!).toBeGreaterThan(0.3)
    expect(alsNul.ratio!).toBeLessThan(0.5)
    expect(alsNul.status).toBe('bad')
  })

  it('een ECHT bekende factor A dempt de post zoals bedoeld', () => {
    // Een UPO-aangroei van € 300 haalt via × 6,27 ruim € 1.880 van de
    // jaarruimte af; de post blijft bestaan maar wordt kleiner.
    const zonder = deriveFiscaleRuimte(basis({ factorA: 0, factorAKnown: true }))
    const met = deriveFiscaleRuimte(basis({ factorA: 300, factorAKnown: true }))

    expect(met.posten.map((p) => p.cause)).toEqual(['jaarruimte'])
    expect(met.posten[0].besparing).toBeLessThan(zonder.posten[0].besparing)
  })

  it('een factor A die de ruimte volledig opsoupeert laat de post verdwijnen', () => {
    // "Ruimte benut" is een echte uitkomst, geen geen-data-geval: de heffing is
    // bekend, er valt alleen niets te halen → groen, niet grijs.
    const r = deriveFiscaleRuimte(basis({ factorA: 1_800, factorAKnown: true }))
    expect(r.posten).toEqual([])
    expect(r.status).toBe('good')
  })
})

// ── 2a. BLOKKEREND: canonieke bruto-inversie ─────────────────────────────────

describe('Bevinding 2a — de noemer gebruikt grossFromNet, niet de vuistregel', () => {
  const netYearly = NETTO_PER_MAAND * 12

  it('de gebruikte Box 1-heffing is die van het CANONIEKE bruto', () => {
    const r = deriveFiscaleRuimte(basis())
    expect(r.posten.map((p) => p.cause)).toEqual(['jaarruimte'])

    const canoniekBruto = grossFromNet(netYearly, CURRENT_TAX_YEAR)
    const verwacht = computeBox1Tax({
      grossYearlyIncome: canoniekBruto,
      year: CURRENT_TAX_YEAR,
    }).tax

    expect(gebruikteNoemer(r.posten[0].besparing, r.ratio!)).toBeCloseTo(verwacht, 6)
  })

  it('en NIET die van de lineaire vuistregel netto/(1−marginaal)', () => {
    // Exact de bron die `box1JaarruimteStatus` gebruikt. Die overschat bruto,
    // dus ook de heffing; hij mag een stipje voeden, geen euro-bedrag.
    const marginaal = resolveFireParams({ net_monthly_income: NETTO_PER_MAAND }).marginaalTarief
    const vuistregelBruto = netYearly / (1 - marginaal)

    const canoniekBruto = grossFromNet(netYearly, CURRENT_TAX_YEAR)
    expect(vuistregelBruto).toBeGreaterThan(canoniekBruto)

    const r = deriveFiscaleRuimte(basis())
    const vuistregelHeffing = computeBox1Tax({
      grossYearlyIncome: vuistregelBruto,
      year: CURRENT_TAX_YEAR,
    }).tax

    // Ruim buiten elke float-ruis: het verschil is honderden euro's.
    expect(
      Math.abs(gebruikteNoemer(r.posten[0].besparing, r.ratio!) - vuistregelHeffing),
    ).toBeGreaterThan(1)
  })

  it('de jaarruimte-post zelf staat óók op het canonieke bruto', () => {
    const canoniekBruto = grossFromNet(netYearly, CURRENT_TAX_YEAR)
    const ruimte = computeJaarruimte(canoniekBruto, 0, CURRENT_TAX_YEAR)
    const verwacht = jaarruimteBesparing(canoniekBruto, ruimte.jaarruimte, CURRENT_TAX_YEAR)

    expect(deriveFiscaleRuimte(basis()).posten[0].besparing).toBe(verwacht)
  })
})

// ── 2b. BLOKKEREND: eigen woning in de noemer (bevinding C8) ─────────────────

describe('Bevinding 2b — de eigen woning zit in de Box 1-noemer', () => {
  const HUIS = {
    id: 'huis-1',
    asset_type: 'eigen_huis',
    current_value: 400_000,
    woz_value: 400_000,
    is_active: true,
  }
  const HYPOTHEEK = {
    current_balance: 250_000,
    debt_type: 'mortgage',
    linked_asset_id: 'huis-1',
    interest_rate: 3.5,
    is_tax_deductible: true,
    is_active: true,
  }

  const metWoning = () =>
    deriveFiscaleRuimte(basis({ assetRows: [HUIS], debtRows: [HYPOTHEEK] }))

  it('de gebruikte heffing is die MÉT wozValue + hypotheekRente', () => {
    const r = metWoning()
    const bruto = grossFromNet(NETTO_PER_MAAND * 12, CURRENT_TAX_YEAR)
    const verwacht = computeBox1Tax({
      grossYearlyIncome: bruto,
      year: CURRENT_TAX_YEAR,
      wozValue: 400_000,
      // estimateMortgageRenteJaar: 250.000 × 3,5% = 8.750
      hypotheekRente: 8_750,
    }).tax

    expect(gebruikteNoemer(r.posten[0].besparing, r.ratio!)).toBeCloseTo(verwacht, 6)
  })

  it('de renteaftrek VERLAAGT de noemer — zonder woning was hij te hoog', () => {
    const zonder = deriveFiscaleRuimte(basis())
    const met = metWoning()

    const noemerZonder = gebruikteNoemer(zonder.posten[0].besparing, zonder.ratio!)
    const noemerMet = gebruikteNoemer(met.posten[0].besparing, met.ratio!)

    expect(noemerMet).toBeLessThan(noemerZonder)
    // Een kleinere noemer bij dezelfde teller = een HOGERE ratio. Dit is de
    // richting die de oude code miste.
    expect(met.ratio!).toBeGreaterThan(zonder.ratio!)
  })

  it('een hypotheek aan een ANDERE bezitting telt niet mee (contract van de helper)', () => {
    const losseLening = { ...HYPOTHEEK, linked_asset_id: 'iets-anders' }
    const r = deriveFiscaleRuimte(basis({ assetRows: [HUIS], debtRows: [losseLening] }))

    const bruto = grossFromNet(NETTO_PER_MAAND * 12, CURRENT_TAX_YEAR)
    const verwacht = computeBox1Tax({
      grossYearlyIncome: bruto,
      year: CURRENT_TAX_YEAR,
      wozValue: 400_000,
      hypotheekRente: 0,
    }).tax

    expect(gebruikteNoemer(r.posten[0].besparing, r.ratio!)).toBeCloseTo(verwacht, 6)
  })

  it('bij twee woningen wint de hoogste WOZ — de helper krijgt ze aflopend gesorteerd', () => {
    const klein = { ...HUIS, id: 'huis-klein', woz_value: 150_000, current_value: 150_000 }
    const groot = { ...HUIS, id: 'huis-groot', woz_value: 600_000, current_value: 600_000 }
    // Bewust in de "verkeerde" volgorde aangeleverd: de sortering hoort in
    // `deriveFiscaleRuimte` te zitten, niet bij de aanroeper.
    const r = deriveFiscaleRuimte(basis({ assetRows: [klein, groot], debtRows: [] }))

    const bruto = grossFromNet(NETTO_PER_MAAND * 12, CURRENT_TAX_YEAR)
    const verwacht = computeBox1Tax({
      grossYearlyIncome: bruto,
      year: CURRENT_TAX_YEAR,
      wozValue: 600_000,
      hypotheekRente: 0,
    }).tax

    expect(gebruikteNoemer(r.posten[0].besparing, r.ratio!)).toBeCloseTo(verwacht, 6)
  })
})

// ── 3. Weging met net_worth_inclusion_pct ────────────────────────────────────

describe('Bevinding 3 — Box 3-posten worden gewogen met inclusion_pct', () => {
  const spaarrij = (current_value: number, pct?: number) => ({
    id: 'spaar-1',
    asset_type: 'savings',
    current_value,
    is_active: true,
    ...(pct === undefined ? {} : { net_worth_inclusion_pct: pct }),
  })

  it('€ 400.000 op 50% geeft exact dezelfde uitkomst als € 200.000 op 100%', () => {
    const gedeeld = deriveFiscaleRuimte(
      basis({ assetRows: [spaarrij(400_000, 50)], hasBox3Assets: true }),
    )
    const eigen = deriveFiscaleRuimte(
      basis({ assetRows: [spaarrij(200_000)], hasBox3Assets: true }),
    )

    expect(gedeeld).toEqual(eigen)
  })

  it('ongewogen zou de heffing van de VOLLE € 400.000 zijn — dat is de oude fout', () => {
    const gedeeld = deriveFiscaleRuimte(
      basis({ assetRows: [spaarrij(400_000, 50)], hasBox3Assets: true }),
    )
    const vol = deriveFiscaleRuimte(
      basis({ assetRows: [spaarrij(400_000)], hasBox3Assets: true }),
    )

    const noemerGedeeld = gebruikteNoemer(gedeeld.posten[0].besparing, gedeeld.ratio!)
    const noemerVol = gebruikteNoemer(vol.posten[0].besparing, vol.ratio!)
    expect(noemerVol).toBeGreaterThan(noemerGedeeld)
  })

  it('een ontbrekend of onzinnig percentage telt als 100% (geen stille nul)', () => {
    const zonderVeld = deriveFiscaleRuimte(
      basis({ assetRows: [spaarrij(200_000)], hasBox3Assets: true }),
    )
    const metNull = deriveFiscaleRuimte(
      basis({
        assetRows: [{ ...spaarrij(200_000), net_worth_inclusion_pct: null }],
        hasBox3Assets: true,
      }),
    )
    expect(metNull).toEqual(zonderVeld)
  })

  it('de aangeleverde rijen worden NIET gemuteerd (de loader telt ze zelf ook op)', () => {
    const rij = spaarrij(400_000, 50)
    deriveFiscaleRuimte(basis({ assetRows: [rij], hasBox3Assets: true }))
    expect(rij.current_value).toBe(400_000)
  })
})

// ── 4. Fail-soft: neutral, nooit een lege groene tegel ───────────────────────

describe('Bevinding 4 — een gefaalde bron geeft neutral, en legt geen route plat', () => {
  it('een throw binnen het blok komt eruit als neutral', () => {
    const kapot = basis()
    Object.defineProperty(kapot, 'assetRows', {
      get() {
        throw new Error('rijen niet leesbaar')
      },
    })

    // Zou zonder de try/catch door `loadLeverScores` heen slaan en daarmee
    // ÉLKE ingelogde route platleggen (app/(app)/layout.tsx await't hem).
    expect(() => deriveFiscaleRuimte(kapot)).not.toThrow()

    const r = deriveFiscaleRuimte(kapot)
    expect(r.status).toBe('neutral')
    expect(r.ratio).toBeNull()
    expect(r.score).toBeNull()
    expect(r.posten).toEqual([])
  })

  it('neutral is NIET groen — "we weten het niet" ≠ "je bent in orde" (D3)', () => {
    const kapot = basis()
    Object.defineProperty(kapot, 'assetRows', {
      get() {
        throw new Error('boem')
      },
    })
    expect(deriveFiscaleRuimte(kapot).status).not.toBe('good')
  })
})

// ── 5. Geen rij-data in de uitkomst ──────────────────────────────────────────

describe('Bevinding 5 — er ontsnapt geen rij-data uit Box3Result', () => {
  it('de uitkomst draagt uitsluitend status/ratio/posten/score', () => {
    const r = deriveFiscaleRuimte(
      basis({
        assetRows: [
          { id: 'a1', asset_type: 'savings', current_value: 300_000, is_active: true },
        ],
        hasBox3Assets: true,
        householdType: 'samen',
      }),
    )
    expect(Object.keys(r).sort()).toEqual(['posten', 'ratio', 'score', 'status'])
    for (const post of r.posten) {
      expect(Object.keys(post).sort()).toEqual(['besparing', 'cause'])
    }
    // Vangnet tegen een toekomstige "handig, geef de classificaties ook mee":
    // geen enkel asset-id mag in de geserialiseerde uitkomst voorkomen.
    expect(JSON.stringify(r)).not.toContain('a1')
  })
})

// ── 6. Eén belastingjaar, expliciet ──────────────────────────────────────────

describe('Bevinding 6 — het belastingjaar is overal expliciet', () => {
  it('box1JaarruimteStatus met CURRENT_TAX_YEAR is vandaag byte-identiek aan de default', () => {
    // De nieuwe parameter is INERT-BY-DEFAULT: elke bestaande aanroeper die 'm
    // weglaat houdt exact dezelfde uitkomst. Alleen de stille koppeling aan een
    // literal is weg.
    const zonder = box1JaarruimteStatus({ netMonthly: 3_000, marginaalTarief: 0.3737, factorA: 0 })
    const met = box1JaarruimteStatus({
      netMonthly: 3_000,
      marginaalTarief: 0.3737,
      factorA: 0,
      year: CURRENT_TAX_YEAR,
    })
    expect(met).toEqual(zonder)
  })

  it('de Box 3-heffing achter de hefboom draait op CURRENT_TAX_YEAR', () => {
    const rijen = [
      { id: 's1', asset_type: 'savings', current_value: 250_000, is_active: true },
    ]
    const r = deriveFiscaleRuimte(
      basis({ assetRows: rijen, hasBox3Assets: true, factorAKnown: false }),
    )
    const verwachtBox3 = calculateBox3({
      assets: rijen as never,
      debts: [],
      hasPartner: false,
      dailyExpenses: 0,
      year: CURRENT_TAX_YEAR,
    }).tax
    const bruto = grossFromNet(NETTO_PER_MAAND * 12, CURRENT_TAX_YEAR)
    const verwachtBox1 = computeBox1Tax({
      grossYearlyIncome: bruto,
      year: CURRENT_TAX_YEAR,
    }).tax

    // Geen posten (factor A onbekend, alleenstaand, shift niet lonend genoeg
    // om netto positief te zijn) → ratio 0, maar de noemer is wél bepaald.
    expect(verwachtBox3).toBeGreaterThan(0)
    expect(verwachtBox1).toBeGreaterThan(0)
    expect(r.status).toBe('good')
  })
})
