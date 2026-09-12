/**
 * "Budgetteren uit" telt niet mee in de uitgaven- en inkomstencijfers — ADR 0139.
 *
 * Zet een gebruiker budgetteren UIT op een rekening, dan hoort alleen het SALDO
 * van die rekening nog te tellen (als cash-bezitting, mét rendement). De
 * boekingen vallen buiten élk cijfer dat uit `public.tx_month_aggregate` komt:
 * de budgetsom, het transactie-jaarinkomen, de spaarquote, het dagtarief, de
 * FIRE-uitgaven en de snapshots.
 *
 * WAT DEZE TEST MEET, EN WAT NIET. De filter zit in SQL (migratie
 * 20260912120000). Deze suite meet de TS-SPIEGEL daarvan in de nep-database
 * (`test/helpers/fake-supabase.ts`, `isBudgetExcludedAccount`) plus het gedrag
 * van de consumenten die op het aggregaat staan. Hij bewijst dus dat de
 * regel-DEFINITIE klopt en dat de bedragen de goede kant op bewegen — niet dat
 * Postgres hem draait; dat bewijst de migratie zelf bij toepassen.
 */

import { describe, it, expect } from 'vitest'
import { makeSupabase, isBudgetExcludedAccount, type Row } from '@/test/helpers/fake-supabase'
import {
  fetchTxMonthAggregate,
  aggSumNegatiefAbs,
  aggSumPositief,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { recentDailyExpenseRateFromRows, consumptionExpenseRows } from '@/lib/expense-rate'
import { savingsRateFromAggregates } from '@/lib/savings-source'

const VENSTER = { from: '2026-01-01', to: '2026-07-01' }

/** Eén budget, type 'expense' — zodat de consumptie-grondslag de rijen meeneemt. */
const BUDGET_ID = 'budget-boodschappen'
const BUDGET_TYPES = new Map<string, string>([[BUDGET_ID, 'expense']])

/** Actieve rekening mét gekoppeld bezit waarop budgetteren AAN staat. */
const REKENING_AAN = 'acc-aan'
const BEZIT_AAN = 'asset-aan'
/** Rekening waarop de gebruiker budgetteren heeft uitgezet. */
const REKENING_UIT = 'acc-uit'
const BEZIT_UIT = 'asset-uit'
/**
 * De archief-bucket, precies zoals `delete_bank_account` hem aanmaakt: `is_active
 * = false`, geen gekoppeld bezit, `is_archive_bucket = true`. Let op de
 * combinatie — dit is de valkuil van ADR 0139: de bucket draagt dezelfde
 * actief-vlag als een rekening met budgetteren uit, en moet tóch meetellen.
 */
const REKENING_ARCHIEF = 'acc-archief'

const bankAccounts: Row[] = [
  { id: REKENING_AAN, is_active: true, is_archive_bucket: false, linked_asset_id: BEZIT_AAN },
  // De companion is hier nog ACTIEF: alleen de canonieke gate op het bezit staat
  // uit. Dat is precies de desync-vorm die deze regel moet opvangen.
  { id: REKENING_UIT, is_active: true, is_archive_bucket: false, linked_asset_id: BEZIT_UIT },
  { id: REKENING_ARCHIEF, is_active: false, is_archive_bucket: true, linked_asset_id: null },
]

const assets: Row[] = [
  { id: BEZIT_AAN, asset_type: 'cash', has_budget_tracking: true, is_active: true },
  { id: BEZIT_UIT, asset_type: 'cash', has_budget_tracking: false, is_active: true },
]

function tx(id: string, accountId: string | null, amount: number, date = '2026-03-15'): Row {
  return {
    id,
    date,
    amount,
    account_id: accountId,
    budget_id: amount < 0 ? BUDGET_ID : null,
    transaction_type: null,
  }
}

async function aggregaat(transactions: Row[]): Promise<TxMonthAggregateRow[]> {
  const fake = makeSupabase({ profile: { id: 'user-parity' }, transactions, assets, bankAccounts })
  const { data, error } = await fetchTxMonthAggregate(fake.client, VENSTER)
  expect(error).toBeNull()
  return data ?? []
}

describe('isBudgetExcludedAccount — de regel zelf', () => {
  it('sluit uit zodra één van de twee vlaggen "uit" zegt', () => {
    expect(isBudgetExcludedAccount({ id: 'a', is_active: false }, [])).toBe(true)
    expect(
      isBudgetExcludedAccount({ id: 'a', linked_asset_id: 'x' }, [
        { id: 'x', has_budget_tracking: false, is_active: true },
      ]),
    ).toBe(true)
    expect(
      isBudgetExcludedAccount({ id: 'a', linked_asset_id: 'x' }, [
        { id: 'x', has_budget_tracking: true, is_active: false },
      ]),
    ).toBe(true)
  })

  it('sluit de ARCHIEF-bucket nooit uit, ook niet met is_active = false', () => {
    // DE VALKUIL. `delete_bank_account` maakt de bucket aan met is_active =
    // false en verplaatst de bewaarde boekingen erheen. Zou `is_archive_bucket`
    // alleen uit de uitsluitingslijst gehaald zijn, dan viel de bucket alsnog
    // weg via de actief-vlag — en verloor iemand na een bankoverstap zijn hele
    // voorgeschiedenis uit dagtarief, spaarquote en FIRE. De archieftest staat
    // daarom VOORAAN, niet als OR-tak. Draai dit niet terug.
    expect(isBudgetExcludedAccount({ id: 'a', is_active: false, is_archive_bucket: true }, [])).toBe(false)
    // …en ook niet via de bezit-gate, mocht de bucket ooit een bezit krijgen.
    expect(
      isBudgetExcludedAccount({ id: 'a', is_active: false, is_archive_bucket: true, linked_asset_id: 'x' }, [
        { id: 'x', has_budget_tracking: false, is_active: false },
      ]),
    ).toBe(false)
  })

  it('laat een actieve rekening met een actief, budgetterend bezit staan', () => {
    expect(
      isBudgetExcludedAccount({ id: 'a', is_active: true, linked_asset_id: 'x' }, [
        { id: 'x', has_budget_tracking: true, is_active: true },
      ]),
    ).toBe(false)
  })

  it('telt een rekening ZONDER gekoppeld bezit mee zolang hij actief is', () => {
    // Op productie hangen hier 7.975 van de 24.606 boekingen aan (gemeten
    // 12-09-2026): een regel die "geen bezit" als "budgetteren uit" leest, zou
    // een derde van alle transacties laten verdwijnen.
    expect(isBudgetExcludedAccount({ id: 'a', is_active: true, linked_asset_id: null }, [])).toBe(false)
    expect(isBudgetExcludedAccount({ id: 'a', is_active: true }, [])).toBe(false)
  })

  it('spiegelt de DB-defaults van ontbrekende velden (has_budget_tracking = false)', () => {
    // In de database zijn deze kolommen NOT NULL met een default; een rij zónder
    // waarde bestaat er niet. De vlag defaultt op FALSE — een gekoppeld bezit dat
    // de vlag niet draagt, is dus "budgetteren uit", ook in de mock.
    expect(isBudgetExcludedAccount({ id: 'a', linked_asset_id: 'x' }, [{ id: 'x' }])).toBe(true)
    // …en een rekening zonder is_active/is_archive_bucket is actief, geen archief.
    expect(isBudgetExcludedAccount({ id: 'a' }, [])).toBe(false)
  })

  it('laat een onbekend rekening-id staan (faalrichting = ongewijzigd)', () => {
    expect(isBudgetExcludedAccount({ id: 'a', linked_asset_id: 'bestaat-niet' }, assets)).toBe(false)
  })
})

describe('tx_month_aggregate — (a) actieve rekening telt onveranderd mee', () => {
  it('levert de sommen van de actieve rekening ongewijzigd', async () => {
    const rows = await aggregaat([
      tx('t1', REKENING_AAN, -200),
      tx('t2', REKENING_AAN, 3000),
    ])
    expect(aggSumNegatiefAbs(rows)).toBe(200)
    expect(aggSumPositief(rows)).toBe(3000)
  })
})

describe('tx_month_aggregate — (b) budgetteren uit telt niet mee', () => {
  const transacties = [
    tx('t1', REKENING_AAN, -200),
    tx('t2', REKENING_AAN, 3000),
    tx('t3', REKENING_UIT, -1500),
    tx('t4', REKENING_UIT, 900),
  ]

  it('laat de boekingen van die rekening uit de budgetsom', async () => {
    const rows = await aggregaat(transacties)
    expect(aggSumNegatiefAbs(rows)).toBe(200)
    expect(aggSumNegatiefAbs(rows, { budgetIds: new Set([BUDGET_ID]) })).toBe(200)
  })

  it('laat ook de INKOMSTEN van die rekening erbuiten', async () => {
    // Het eigenaarsbesluit gaat beide kanten op: alleen het saldo telt.
    const rows = await aggregaat(transacties)
    expect(aggSumPositief(rows)).toBe(3000)
  })

  it('verandert de spaarquote-invoer mee', async () => {
    const rows = await aggregaat(transacties)
    const inkomen = aggSumPositief(rows)
    const uitgaven = aggSumNegatiefAbs(rows)
    // Zonder de filter: (3900 − 1700) / 3900 ≈ 56,4%. Met de filter blijft de
    // rekening die buiten het budget hoort volledig weg: (3000 − 200) / 3000.
    expect(savingsRateFromAggregates(inkomen, uitgaven, 0)).toBeCloseTo((2800 / 3000) * 100, 6)
    expect(savingsRateFromAggregates(3900, 1700, 0)).not.toBeCloseTo((2800 / 3000) * 100, 6)
  })

  it('verandert het dagtarief mee', async () => {
    const rows = await aggregaat(transacties)
    const zonderFilter = recentDailyExpenseRateFromRows(
      consumptionExpenseRows(
        // Wat het aggregaat vóór ADR 0139 zou hebben opgeleverd: beide rekeningen.
        await aggregaatZonderFilter(transacties),
        BUDGET_TYPES,
      ),
      new Date('2026-06-30'),
    )
    const metFilter = recentDailyExpenseRateFromRows(
      consumptionExpenseRows(rows, BUDGET_TYPES),
      new Date('2026-06-30'),
    )
    expect(metFilter.monthlyExpenses).toBeLessThan(zonderFilter.monthlyExpenses)
    expect(metFilter.dailyRate).toBeLessThan(zonderFilter.dailyRate)
  })
})

describe('tx_month_aggregate — (c) transactie zonder rekening telt gewoon mee', () => {
  it('neemt een rij zonder account_id op', async () => {
    // DEFENSIEVE tak: `transactions.account_id` is vandaag NOT NULL (gemeten
    // tegen information_schema, 12-09-2026) en er zijn 0 zulke rijen. De tak
    // bestaat zodat een toekomstige versoepeling geen boekingen laat verdampen.
    const rows = await aggregaat([tx('t1', null, -400), tx('t2', REKENING_UIT, -1500)])
    expect(aggSumNegatiefAbs(rows)).toBe(400)
  })
})

describe('tx_month_aggregate — (d) archiefbucket telt WÉL mee', () => {
  /**
   * Eigenaarsbesluit 12 sep 2026, herziening van de eerste lezing van ADR 0139.
   *
   * WAAROM DIT GEEN UITSLUITING IS. "Budgetteren uit" is een bewuste keuze per
   * rekening: reken deze niet mee. Het archief is iets anders — daar belanden
   * boekingen wanneer iemand een rekening VERWIJDERT met "transacties bewaren",
   * typisch na een overstap van de ene bank naar de andere. Dat is opruimen.
   * Zou het archief uitgesloten worden, dan verliest die gebruiker in één klap
   * zijn hele voorgeschiedenis uit dagtarief, spaarquote en FIRE, en zakt
   * `historyMonths` (ADR 0138) in tot de maanden sinds de overstap.
   *
   * Draai deze test niet om zonder dat besluit terug te draaien.
   */
  it('laat de bewaarde historie van de archief-bucket MEETELLEN', async () => {
    const rows = await aggregaat([
      tx('t1', REKENING_AAN, -200),
      tx('t2', REKENING_ARCHIEF, -9999),
    ])
    expect(aggSumNegatiefAbs(rows)).toBe(10199)
  })

  it('onderscheidt archief (telt mee) van budgetteren-uit (telt niet mee) in één meting', async () => {
    // De kern van de wijziging in één assertie: beide rekeningen dragen
    // is_active = false respectievelijk een uitgezette bezit-gate, en tóch
    // overleeft alleen het archief. Een implementatie die de bucket via de
    // actief-vlag laat vallen, meet hier 200 in plaats van 10.199.
    const rows = await aggregaat([
      tx('t1', REKENING_AAN, -200),
      tx('t2', REKENING_ARCHIEF, -9999),
      tx('t3', REKENING_UIT, -1500),
    ])
    expect(aggSumNegatiefAbs(rows)).toBe(10199)
  })
})

/**
 * Het aggregaat zoals het er vóór ADR 0139 uitzag: dezelfde fixture, maar zonder
 * rekening-tabel, dus zonder budget-status. Dient als contrast-meting — nooit
 * als norm.
 */
async function aggregaatZonderFilter(transactions: Row[]): Promise<TxMonthAggregateRow[]> {
  const fake = makeSupabase({ profile: { id: 'user-parity' }, transactions, assets })
  const { data } = await fetchTxMonthAggregate(fake.client, VENSTER)
  return data ?? []
}
