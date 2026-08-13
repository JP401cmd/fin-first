import { describe, it, expect } from 'vitest'
import { buildAssetReturnBreakdown, type AssetReturnInput } from './asset-return'
import { sumHoldingTotals } from './holdings-totals'

/**
 * Regressie-fixture: een portefeuille die alle vier de fout-klassen draagt
 * waarop de KPI "Rendement totaal" stukliep. De bedragen zijn SYNTHETISCH —
 * deze fixture stuurt op de structuur (welke grondslag wint, welke rij valt
 * buiten het rendement), niet op specifieke euro's. Dezelfde conventie als
 * `lib/test-personas.ts`: verzonnen entiteiten, geen productie-export.
 *
 * De oude formule was `Σ current_value − Σ purchase_value` over álle actieve
 * bezittingen, zonder te kijken of `purchase_value` iets betekende:
 *
 *   waarde   620.500
 *   aankoop  697.000
 *   verschil  −76.500   ← wat er op het scherm stond
 *
 * …terwijl de marktportefeuille +60% stond. Drie grondslagen liepen door
 * elkaar heen:
 *   1. beleggingen/crypto met een échte, transactie-onderbouwde kostprijs in
 *      de holdings-tabellen, die genegeerd werd ten gunste van een met de hand
 *      ingetypt rond bedrag — bij crypto draaide dat het TEKEN om (−€4.000
 *      getoond, +€12.000 werkelijk);
 *   2. een betaalrekening met `purchase_value = 0`, die daardoor als volledige
 *      winst meetelde;
 *   3. de verkrijgingsprijs van een deelneming en de aankoopprijs van een
 *      woning, die het getal volledig overstemden.
 */
const FIXTURE: AssetReturnInput[] = [
  { id: 'a-creditcard', name: 'Creditcard', assetType: 'cash', value: 500, purchaseValue: 500 },
  { id: 'a-betaal', name: 'Betaalrekening', assetType: 'cash', value: 12000, purchaseValue: 0 },
  { id: 'a-crypto', name: 'Cryptoportefeuille', assetType: 'crypto', value: 18000, purchaseValue: 22000 },
  { id: 'a-bv', name: 'Deelneming werk-bv', assetType: 'deelneming', value: 60000, purchaseValue: 150000 },
  { id: 'a-woning', name: 'Eigen woning', assetType: 'eigen_huis', value: 400000, purchaseValue: 399500 },
  { id: 'a-beleggen', name: 'Beleggingsrekening', assetType: 'investment', value: 30000, purchaseValue: 25000 },
  { id: 'a-pensioen', name: 'Pensioenpot', assetType: 'retirement', value: 50000, purchaseValue: 50000 },
  { id: 'a-deposito', name: 'Spaardeposito', assetType: 'savings', value: 40000, purchaseValue: 40000 },
  { id: 'a-spaar', name: 'Spaarrekening', assetType: 'savings', value: 10000, purchaseValue: 10000 },
]

/** Kostprijs zoals `sumHoldingTotals` 'm over de holding-rijen oplevert — de
 *  enige grondslag die op transacties/posities gebouwd is. */
const FIXTURE_HOLDINGS = {
  'a-crypto': { cost: 6000, value: 18000 },
  'a-beleggen': { cost: 24000, value: 30000 },
}

function rowById<T extends { id: string }>(rows: readonly T[], id: string): T {
  const row = rows.find((r) => r.id === id)
  if (!row) throw new Error(`rij ${id} niet in deze bucket`)
  return row
}

describe('buildAssetReturnBreakdown — grondslagen scheiden', () => {
  it('rekent het portefeuillerendement op de holdings-kostprijs, niet op purchase_value', () => {
    // Given: crypto met een handmatige purchase_value van €22.000 náást een
    // transactie-onderbouwde kostprijs van €6.000 uit de holdings.
    // When: het rendement wordt opgebouwd.
    // Then: de holdings-kostprijs wint — bij crypto keert daardoor het teken om
    // (de oude formule toonde −4.000 waar het +12.000 moest zijn).
    const b = buildAssetReturnBreakdown(FIXTURE, FIXTURE_HOLDINGS)

    expect(rowById(b.portfolio.rows, 'a-crypto').cost).toBeCloseTo(6000, 2)
    expect(rowById(b.portfolio.rows, 'a-crypto').costSource).toBe('holdings')
    expect(rowById(b.portfolio.rows, 'a-crypto').gain).toBeCloseTo(12000, 2)

    expect(rowById(b.portfolio.rows, 'a-beleggen').cost).toBeCloseTo(24000, 2)
    expect(rowById(b.portfolio.rows, 'a-beleggen').gain).toBeCloseTo(6000, 2)

    expect(b.portfolio.cost).toBeCloseTo(30000, 2)
    expect(b.portfolio.gain).toBeCloseTo(18000, 2)
    expect(b.portfolio.pct).toBeCloseTo(60, 1)
  })

  it('houdt niet-markt-waarderingen (woning, deelneming) buiten de kop-KPI', () => {
    // Given: een woning van €400.000 en een met de hand gewaardeerde deelneming
    // op €60.000 tegen een verkrijgingsprijs van €150.000.
    // When/Then: die horen in de waarderings-bucket, niet in het rendement —
    // hun −€89.500 overstemde anders het hele getal.
    const b = buildAssetReturnBreakdown(FIXTURE, FIXTURE_HOLDINGS)

    expect(b.valuation.rows.map((r) => r.id).sort()).toEqual(['a-bv', 'a-woning'])
    expect(rowById(b.valuation.rows, 'a-bv').gain).toBeCloseTo(-90000, 2)
    expect(rowById(b.valuation.rows, 'a-woning').gain).toBeCloseTo(500, 2)
    expect(b.valuation.gain).toBeCloseTo(-89500, 2)

    expect(b.portfolio.rows.some((r) => r.id === 'a-bv')).toBe(false)
  })

  it('zet bezittingen zonder kostprijs-begrip apart, met reden', () => {
    // Given: een betaalrekening met purchase_value 0 (die als +€12.000
    // "rendement" meetelde) en spaar-/pensioenrijen waar quick-add
    // purchase_value = current_value schreef.
    // When/Then: geen van beide levert rendement; elk draagt een reden.
    const b = buildAssetReturnBreakdown(FIXTURE, FIXTURE_HOLDINGS)

    expect(b.withoutBasis.rows.map((r) => r.id).sort()).toEqual(
      ['a-betaal', 'a-creditcard', 'a-deposito', 'a-pensioen', 'a-spaar'],
    )
    expect(rowById(b.withoutBasis.rows, 'a-betaal').reason).toBe('geen-kostprijs-begrip')
    expect(rowById(b.withoutBasis.rows, 'a-betaal').gain).toBeNull()
    expect(b.withoutBasis.value).toBeCloseTo(112500, 2)
  })

  it('laat de som van alle buckets exact het bruto bezittingentotaal zijn', () => {
    // Given/When: de drie buckets samen.
    // Then: geen bezitting valt tussen wal en schip — €620.500, precies
    // het bedrag dat de figures-strip als "Totale waarde" toont.
    const b = buildAssetReturnBreakdown(FIXTURE, FIXTURE_HOLDINGS)

    expect(b.totalValue).toBeCloseTo(620500, 2)
    expect(b.portfolio.value + b.valuation.value + b.withoutBasis.value).toBeCloseTo(b.totalValue, 6)
    expect(b.portfolio.rows.length + b.valuation.rows.length + b.withoutBasis.rows.length).toBe(FIXTURE.length)
  })

  it('valt terug op purchase_value wanneer er geen holdings-kostprijs is', () => {
    // Given: dezelfde portefeuille zonder holdings-map (handmatig bijgehouden
    // posities — de standaardsituatie voor wie nooit een broker-CSV importeerde).
    // When/Then: purchase_value is dan de beste beschikbare kostprijs, expliciet
    // gemarkeerd zodat de modal kan tonen waar het getal op rust.
    const b = buildAssetReturnBreakdown(FIXTURE, {})

    expect(rowById(b.portfolio.rows, 'a-crypto').costSource).toBe('purchase_value')
    expect(rowById(b.portfolio.rows, 'a-crypto').gain).toBeCloseTo(-4000, 2)
  })

  it('weegt kostprijs mee met het aandeel, net als de waarde', () => {
    // Given: een gedeelde beleggingsrekening waarvan deze viewer de helft ziet.
    // When/Then: waarde én kostprijs schalen mee, zodat het percentage klopt.
    const b = buildAssetReturnBreakdown(
      [{ id: 'a-1', name: 'Gedeeld', assetType: 'investment', value: 5000, purchaseValue: 8000, shareFraction: 0.5 }],
      { 'a-1': { cost: 8000, value: 10000 } },
    )
    expect(b.portfolio.cost).toBeCloseTo(4000, 6)
    expect(b.portfolio.gain).toBeCloseTo(1000, 6)
    expect(b.portfolio.pct).toBeCloseTo(25, 6)
  })

  it('telt een holdings-kostprijs van 0 niet als gratis winst', () => {
    // Given: een holdings-map die 0 kostprijs meldt (alle posities gesloten,
    // of nog geen prijzen). When/Then: dat is geen kostprijs — de rij valt
    // terug op purchase_value en anders naar "geen grondslag".
    const b = buildAssetReturnBreakdown(
      [{ id: 'a-1', name: 'Leeg', assetType: 'crypto', value: 900, purchaseValue: 0 }],
      { 'a-1': { cost: 0, value: 900 } },
    )
    expect(b.portfolio.rows).toHaveLength(0)
    expect(rowById(b.withoutBasis.rows, 'a-1').reason).toBe('geen-aankoopwaarde')
  })

  it('geeft geen percentage terug zonder kostprijs', () => {
    const b = buildAssetReturnBreakdown([], {})
    expect(b.portfolio.pct).toBeNull()
    expect(b.totalValue).toBe(0)
  })

  it('zet een partner-aggregaatrij apart met een reden die klopt', () => {
    // Given: privacy 'totalen' levert één rij zonder `asset_type` en zonder
    // `purchase_value`. When/Then: die draagt geen rendement, en de reden mag
    // niet "geen aankoopwaarde ingevuld" zijn — dat suggereert een handeling
    // die op een aggregaat onmogelijk is.
    const b = buildAssetReturnBreakdown(
      [{ id: 'p-1', name: 'Partner vermogen (totaal)', assetType: '', value: 250_000, purchaseValue: null, aggregated: true }],
      {},
    )
    expect(rowById(b.withoutBasis.rows, 'p-1').reason).toBe('samengevoegd-totaal')
    expect(b.totalValue).toBe(250_000)
  })
})

describe('buildAssetReturnBreakdown — dekkingspoort op de holdings-kostprijs', () => {
  /**
   * Deze suite voedt de ÉCHTE `sumHoldingTotals` met rauwe holding-rijen, zoals
   * `loadHoldingsCostByAssetId` dat doet. De fixture hierboven levert
   * vóórgesommeerde totalen aan en kon daardoor niet zien wat hier misgaat:
   * `avg_purchase_price` is nullable zonder default, `num(null)` wordt 0, en
   * drie ingestion-paden laten het veld leeg (wallet-sync schrijft het nooit).
   * Zo'n rij draagt geen kostprijs maar wél volle marktwaarde.
   */

  /** Spiegelt de rij-poort uit `loadHoldingsCostByAssetId`. */
  const covered = (r: { units: number; avg_purchase_price: number | null }) =>
    r.units !== 0 && r.avg_purchase_price != null && r.avg_purchase_price > 0

  it('rapporteert een positie zonder aankoopprijs niet als gratis winst', () => {
    // Given: €5.000 gekochte munten (kostprijs bekend) naast een self-custody
    // wallet van €10.000 die via wallet-sync binnenkwam zónder
    // `avg_purchase_price`. `assets.current_value` telt beide vol mee.
    const rows = [
      { units: 100, avg_purchase_price: 30, current_price: 50 }, // kostprijs 3.000 → waarde 5.000
      { units: 200, avg_purchase_price: null, current_price: 50 }, // wallet: 10.000 waarde, 0 kostprijs
    ]

    // Zonder de rij-poort telt de wallet-waarde vol mee tegen kostprijs 0 —
    // de fout die we moeten uitsluiten.
    const ongefilterd = sumHoldingTotals(rows)
    expect(ongefilterd.totalValue).toBeCloseTo(15_000, 6)
    expect(ongefilterd.totalCost).toBeCloseTo(3_000, 6)

    // Mét de rij-poort dekt de kostprijs nog maar €5.000 van de €15.000.
    const totals = sumHoldingTotals(rows.filter(covered))
    expect(totals.totalCost).toBeCloseTo(3_000, 6)
    expect(totals.totalValue).toBeCloseTo(5_000, 6)

    // When/Then: de dekkingspoort ziet dat gat en weigert de holdings-kostprijs.
    // De rij valt terug op de ingevulde aankoopwaarde — zichtbaar, niet stil.
    const b = buildAssetReturnBreakdown(
      [{ id: 'a-1', name: 'Crypto', assetType: 'crypto', value: 15_000, purchaseValue: 12_000 }],
      { 'a-1': { cost: totals.totalCost, value: totals.totalValue } },
    )
    expect(rowById(b.portfolio.rows, 'a-1').costSource).toBe('purchase_value')
    expect(rowById(b.portfolio.rows, 'a-1').gain).toBeCloseTo(3_000, 6)
    // Zonder poort was dit 15.000 − 3.000 = +12.000 geweest: €10.000 verzonnen.
    expect(b.portfolio.gain).not.toBeCloseTo(12_000, 6)
  })

  it('accepteert de holdings-kostprijs bij normale koersruis', () => {
    // Given: dekking en waarde lopen 0,03% uiteen — holdings-sync leest
    // dezelfde posities, maar op een ander moment. Then: binnen de marge,
    // dus de holdings-kostprijs blijft de grondslag.
    const b = buildAssetReturnBreakdown(
      [{ id: 'a-1', name: 'Fonds', assetType: 'investment', value: 300_000, purchaseValue: 210_000 }],
      { 'a-1': { cost: 226_139.98, value: 300_088.2 } },
    )
    expect(rowById(b.portfolio.rows, 'a-1').costSource).toBe('holdings')
    expect(rowById(b.portfolio.rows, 'a-1').gain).toBeCloseTo(73_860.02, 2)
  })

  it('valt terug zodra de dekking buiten de marge valt', () => {
    // Given: de gedekte waarde is 10% lager dan het bezit — er zit waarde in
    // zonder kostprijs eronder. Then: geen holdings-claim.
    const b = buildAssetReturnBreakdown(
      [{ id: 'a-1', name: 'Fonds', assetType: 'investment', value: 100_000, purchaseValue: 60_000 }],
      { 'a-1': { cost: 50_000, value: 90_000 } },
    )
    expect(rowById(b.portfolio.rows, 'a-1').costSource).toBe('purchase_value')
    expect(rowById(b.portfolio.rows, 'a-1').gain).toBeCloseTo(40_000, 6)
  })

  it('weegt de dekkingsvergelijking mee met het aandeel', () => {
    // Given: gedeeld bezit, viewer ziet de helft. De holdings-map draagt het
    // VOLLE bedrag; waarde komt al gewogen binnen. Then: de vergelijking mag
    // daar niet op omvallen.
    const b = buildAssetReturnBreakdown(
      [{ id: 'a-1', name: 'Gedeeld fonds', assetType: 'investment', value: 50_000, purchaseValue: 80_000, shareFraction: 0.5 }],
      { 'a-1': { cost: 60_000, value: 100_000 } },
    )
    expect(rowById(b.portfolio.rows, 'a-1').costSource).toBe('holdings')
    expect(rowById(b.portfolio.rows, 'a-1').gain).toBeCloseTo(20_000, 6)
  })
})
