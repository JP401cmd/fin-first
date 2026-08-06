/**
 * Unit-tests voor `buildBreakdown` — de vermogensstromen-breakdown die de
 * IncomeExpenseChart (IE-strip) én de geldstroom-Sankey op /toekomst voedt.
 *
 * Dekt de fase-2-correcties (kassabon-uitsplitsingen jaar-detail):
 *  - géén Box 3-dubbeltelling aan de uitgaven-kant (withdrawal bevat box3 al);
 *  - rauwe `totalGrowth` aan de inkomsten-kant (geen `+ totalBox3`-opplussing);
 *  - Salaris/werk + AOW & pensioen als bronnen uit `grossIncomeBySource`;
 *  - saldo-invariant oud↔nieuw (de twee box3-opblazingen hieven elkaar op);
 *  - terugval op ongewijzigd withdrawal-gedrag zonder `withdrawalNeed`.
 */
import { describe, it, expect } from 'vitest'
import { buildBreakdown } from './income-expense-breakdown'
import type {
  UnifiedProjectionRow,
  WithdrawalNeedBreakdown,
  GrossIncomeBySource,
} from './unified-projection'
import type { SimRow } from './fire-simulation'
import type { Debt } from './debt-data'

// ── Fixture-helpers ─────────────────────────────────────────────────

function makeRow(partial: Partial<UnifiedProjectionRow>): UnifiedProjectionRow {
  return {
    year: 20,
    age: 60,
    phase: 'withdrawal',
    assetBuckets: {},
    debtBalances: {},
    totalAssets: 0,
    totalDebts: 0,
    netWorth: 0,
    startNetWorth: 0,
    // Mock-rij: volledig liquide (Prognose!J == I) tenzij een test `nettoLiquide` zet.
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

function makeSimRow(age: number, phase: 'accumulation' | 'retirement'): SimRow {
  return {
    age,
    phase,
    startPortfolio: 0,
    growth: 0,
    savings: 0,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: 0,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
  }
}

function need(partial: Partial<WithdrawalNeedBreakdown>): WithdrawalNeedBreakdown {
  return {
    uitgaveTerm: 0,
    huurNaVerkoop: 0,
    vervallenHypotheeklast: 0,
    box3: 0,
    partnerBijdrage: 0,
    totaalNeed: 0,
    restMaandClamp: 0,
    nietGedekt: 0,
    ...partial,
  }
}

const debtHyp: Debt = { id: 'd1', name: 'Hypotheek' } as unknown as Debt

// ── Tests ────────────────────────────────────────────────────────────

describe('buildBreakdown — box3-ontdubbeling (uitgaven-kant)', () => {
  it('telt Box 3 niet dubbel: onttrekking exclusief box3 + aparte box3-post', () => {
    const row = makeRow({
      phase: 'withdrawal',
      withdrawal: 40000,
      withdrawalNeed: need({ uitgaveTerm: 37000, box3: 3000, totaalNeed: 40000 }),
      totalBox3: 3000,
      debtBalances: {
        d1: { startBalance: 100000, interestPaid: 1000, principalPaid: 0, endBalance: 100000 },
      },
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'retirement')], [debtHyp])
    const r = rows[0]

    // Levensonderhoud = onttrekking − box3-component (40000 − 3000)
    expect(r.expenseBySource['withdrawal']).toBe(37000)
    // Box 3 blijft als eigen post
    expect(r.expenseBySource['box3']).toBe(3000)
    // Rente per schuld
    expect(r.expenseBySource['debt-interest-d1']).toBe(1000)
    // Totaal telt box3 exact één keer: withdrawal(40000) + rente(1000)
    expect(r.totalExpenses).toBe(41000)
  })
})

describe('buildBreakdown — rauw rendement (inkomsten-kant)', () => {
  it('gebruikt totalGrowth rauw, zonder + totalBox3-opplussing', () => {
    const row = makeRow({
      phase: 'accumulation',
      totalGrowth: 10000,
      totalBox3: 3000,
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'accumulation')])
    expect(rows[0].incomeBySource['growth']).toBe(10000)
  })
})

describe('buildBreakdown — totalGrowthLiquide (defect A: rendement exclusief niet-liquide bezit)', () => {
  it('gebruikt totalGrowthLiquide i.p.v. totalGrowth wanneer het veld aanwezig is (bv. eigen huis uitgesloten)', () => {
    const row = makeRow({ phase: 'accumulation', totalGrowth: 10000, totalGrowthLiquide: 6000 })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'accumulation')])
    expect(rows[0].incomeBySource['growth']).toBe(6000)
  })

  it('valt terug op totalGrowth wanneer totalGrowthLiquide ontbreekt (geen regressie)', () => {
    const row = makeRow({ phase: 'accumulation', totalGrowth: 10000 })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'accumulation')])
    expect(rows[0].incomeBySource['growth']).toBe(10000)
  })
})

describe('buildBreakdown — salaris & AOW/pensioen-bronnen (fase-gated)', () => {
  it('voegt Salaris/werk + AOW & pensioen toe in een ONTTREKKINGSjaar (withdrawal > 0)', () => {
    const gib: GrossIncomeBySource = { salaris: 12000, gebeurtenisBaten: 16000 }
    const row = makeRow({
      phase: 'withdrawal',
      withdrawal: 30000,
      withdrawalNeed: need({ uitgaveTerm: 30000, totaalNeed: 30000 }),
      totalGrowth: 7000,
      grossIncome: 28000,
      grossIncomeBySource: gib,
    })
    const { rows, incomeLayers } = buildBreakdown([row], [makeSimRow(60, 'retirement')])
    const r = rows[0]

    expect(r.incomeBySource['salaris']).toBe(12000)
    expect(r.incomeBySource['gebeurtenis-baten']).toBe(16000)
    // Layers zijn aanwezig zodat de legenda/labels kloppen
    expect(incomeLayers.map(l => l.id)).toEqual(
      expect.arrayContaining(['salaris', 'gebeurtenis-baten']),
    )
  })

  it('laat Salaris/werk + AOW & pensioen WEG in een pure opbouwjaar (withdrawal === 0), ondanks grossIncomeBySource ≠ 0', () => {
    const gib: GrossIncomeBySource = { salaris: 54000, gebeurtenisBaten: 0 }
    const row = makeRow({
      phase: 'accumulation',
      savings: 18000,
      totalGrowth: 7000,
      withdrawal: 0,
      grossIncome: 54000,
      grossIncomeBySource: gib,
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'accumulation')])
    const r = rows[0]
    // Salaris NIET als aparte instroom: het spaaroverschot staat al als `savings`
    // (salaris + savings samen = dubbeltelling in een vermogensstromen-view).
    expect(r.incomeBySource['salaris']).toBeUndefined()
    expect(r.incomeBySource['gebeurtenis-baten']).toBeUndefined()
    // Alleen de opbouw-instromen: savings + growth
    expect(Object.keys(r.incomeBySource).sort()).toEqual(['growth', 'savings'])
  })

  it('onderdrukt Salaris/AOW in het GEMENGDE FIRE-overgangsjaar (savings > 0 ÉN withdrawal > 0)', () => {
    // Overgangsjaar: savings-laag toont het pre-FIRE-spaaroverschot, terwijl er
    // óók al onttrokken wordt. De bridge-`salaris` telt álle maanden incl. het
    // pre-FIRE-salaris (dat al in savings zit) → zou een fantoom-instroom geven.
    const gib: GrossIncomeBySource = { salaris: 40000, gebeurtenisBaten: 8000 }
    const row = makeRow({
      phase: 'accumulation',
      savings: 12000,
      withdrawal: 20000,
      withdrawalNeed: need({ uitgaveTerm: 20000, totaalNeed: 20000 }),
      totalGrowth: 7000,
      grossIncome: 48000,
      grossIncomeBySource: gib,
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'accumulation')])
    const r = rows[0]
    expect(r.incomeBySource['salaris']).toBeUndefined()
    expect(r.incomeBySource['gebeurtenis-baten']).toBeUndefined()
    // savings blijft wél staan (dat is het pre-FIRE-spaaroverschot van dat jaar)
    expect(r.incomeBySource['savings']).toBe(12000)
  })

  it('laat bronnen weg wanneer grossIncomeBySource ontbreekt (ook in onttrekkingsjaar)', () => {
    const row = makeRow({
      phase: 'withdrawal',
      withdrawal: 30000,
      withdrawalNeed: need({ uitgaveTerm: 30000, totaalNeed: 30000 }),
      totalGrowth: 7000,
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'retirement')])
    expect(rows[0].incomeBySource['salaris']).toBeUndefined()
    expect(rows[0].incomeBySource['gebeurtenis-baten']).toBeUndefined()
  })
})

describe('buildBreakdown — saldo-invariant oud↔nieuw', () => {
  it('houdt saldo gelijk: de twee box3-opblazingen heffen elkaar op', () => {
    // Synthetische rij zonder grossIncomeBySource (isoleert het box3-effect).
    const row = makeRow({
      phase: 'withdrawal',
      totalGrowth: 10000,
      totalBox3: 3000,
      withdrawal: 40000,
      withdrawalNeed: need({ uitgaveTerm: 37000, box3: 3000, totaalNeed: 40000 }),
      debtBalances: {
        d1: { startBalance: 100000, interestPaid: 1000, principalPaid: 0, endBalance: 100000 },
      },
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'retirement')], [debtHyp])
    const newSaldo = rows[0].surplus

    // OUD gedrag, handmatig gereproduceerd: growth werd bruto opgeplust met box3,
    // en withdrawal bevatte box3 óók (dubbeltelling aan beide kanten).
    const oldIncome = (10000 + 3000) // growth + box3
    const oldExpense = 40000 + 3000 + 1000 // withdrawal + box3 + rente
    const oldSaldo = oldIncome - oldExpense

    expect(newSaldo).toBe(oldSaldo)
    // Én het totaal daalt eerlijk met ~box3 aan beide kanten
    expect(rows[0].totalIncome).toBe(10000)
    expect(rows[0].totalExpenses).toBe(41000)
  })
})

describe('buildBreakdown — terugval zonder withdrawalNeed', () => {
  it('toont de volledige onttrekking ongewijzigd wanneer decompositie ontbreekt', () => {
    const row = makeRow({
      phase: 'withdrawal',
      withdrawal: 40000,
      totalBox3: 3000,
    })
    const { rows } = buildBreakdown([row], [makeSimRow(60, 'retirement')])
    // Geen dedup mogelijk → volledige onttrekking blijft staan
    expect(rows[0].expenseBySource['withdrawal']).toBe(40000)
    expect(rows[0].expenseBySource['box3']).toBe(3000)
  })
})
