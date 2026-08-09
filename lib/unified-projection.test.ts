/**
 * Unit-tests voor `toSimRow` — de mapping `UnifiedProjectionRow` → legacy `SimRow`.
 *
 * Focus: de GRONDSLAG-scheiding tussen de twee rendement-velden (review-bevinding H1).
 *  - `SimRow.growth` is een COMPOSITIE-veld op de netWorth-grondslag (incl. een
 *    niet-liquide eigen woning) → blijft `totalGrowth`;
 *  - `SimRow.flowIn` is een STROMEN-veld (besteedbare instroom) → consumeert
 *    `totalGrowthLiquide` met terugval op `totalGrowth`.
 * Dat verschil voedt de IE-grafiek in 'Lijnen'-modus, de wat-als-pagina en het
 * surplus-gap-widget; zonder de splitsing telt de waardestijging van het huis daar
 * als besteedbaar inkomen mee.
 */
import { describe, it, expect } from 'vitest'
import { toSimRow, type UnifiedProjectionRow } from './unified-projection'

function makeRow(partial: Partial<UnifiedProjectionRow> = {}): UnifiedProjectionRow {
  return {
    year: 5,
    age: 45,
    phase: 'accumulation',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    nettoLiquide: 0,
    grossIncome: 0,
    savings: 0,
    withdrawal: 0,
    withdrawalByType: {},
    cashflowNet: 0,
    oneTimeNet: 0,
    totalGrowth: 0,
    totalBox3: 0,
    cumulativeBox3: 0,
    inflationFactor: 1,
    ...partial,
  }
}

describe('toSimRow — flowIn draagt het BESTEEDBARE rendement (defect A / H1)', () => {
  it('gebruikt totalGrowthLiquide in flowIn wanneer het veld aanwezig is', () => {
    const sim = toSimRow(makeRow({ totalGrowth: 10_000, totalGrowthLiquide: 6_000 }))
    // Geen savings/cashflows en Box 3 = 0 → flowIn is puur het bruto rendement.
    expect(sim.flowIn).toBe(6_000)
  })

  it('valt terug op totalGrowth wanneer totalGrowthLiquide ontbreekt (geen regressie)', () => {
    const sim = toSimRow(makeRow({ totalGrowth: 10_000 }))
    expect(sim.flowIn).toBe(10_000)
  })

  it('laat SimRow.growth BEWUST op het totaal staan (compositie-grondslag, incl. woning)', () => {
    const sim = toSimRow(makeRow({ totalGrowth: 10_000, totalGrowthLiquide: 6_000 }))
    expect(sim.growth).toBe(10_000)
  })

  it('telt Box 3 nog steeds bij het (liquide) rendement op — flowIn is BRUTO', () => {
    const sim = toSimRow(makeRow({ totalGrowth: 10_000, totalGrowthLiquide: 6_000, totalBox3: 1_500 }))
    expect(sim.flowIn).toBe(7_500)
    // …en flowOut boekt diezelfde Box 3 aan de uitstroomkant (ongewijzigd).
    expect(sim.flowOut).toBe(1_500)
  })

  it('telt savings mee in de opbouwfase, náást het liquide rendement', () => {
    const sim = toSimRow(makeRow({ savings: 20_000, totalGrowth: 10_000, totalGrowthLiquide: 6_000 }))
    expect(sim.flowIn).toBe(26_000)
  })

  it('negatief liquide rendement drukt flowIn niet onder 0 (Math.max-guard blijft)', () => {
    const sim = toSimRow(makeRow({ totalGrowth: 5_000, totalGrowthLiquide: -2_000 }))
    expect(sim.flowIn).toBe(0)
  })
})

describe('toSimRow — de breakdown-arrays blijven leeg (euro-weergave-grendel)', () => {
  it('vult incomeBreakdown/expenseBreakdown niet', () => {
    // WAAROM DEZE GRENDEL: `horizon-client.tsx` deflateert `SimRow` via
    // `deflateRowsByAge`, en die raakt alleen velden met `typeof === 'number'`.
    // De bedragen ín deze twee arrays zouden dus ONGEDEFLATEERD de rendergrens
    // kruisen binnen een `InEuroView<SimRow>` — een fout die op het scherm
    // plausibel oogt en die geen enkel type kan zien, want de velden bestaan al.
    //
    // Vandaag is dat inert: sinds de kernel-migratie vult `toSimRow` ze nooit en
    // loopt de inkomsten/uitgaven-strook via een eigen pad. Gaat de mapping ze
    // ooit wél vullen, dan valt dít om — en dan hoort de deflatie van die items
    // eerst geregeld te zijn (zie SIM_ROW_NON_MONEY_FIELDS in horizon-client.tsx).
    const sim = toSimRow(makeRow({ grossIncome: 80_000, totalGrowth: 10_000 }))
    expect(sim.incomeBreakdown).toBeUndefined()
    expect(sim.expenseBreakdown).toBeUndefined()
  })
})
