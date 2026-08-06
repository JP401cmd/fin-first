/**
 * Regressie — **Prognose!J-grondslag bij een beleggingshypotheek** (defect B, bug-fix pijplijn).
 *
 * Given: een persona met een eigen woning (met eigen-woninghypotheek, gelinkt via
 * `linked_asset_id`) ÉN een los verhuurd pand (`real_estate`) met zijn eigen
 * ("beleggings-")hypotheek, eveneens gelinkt via `linked_asset_id`. Rente 0% en
 * `aflossingsvrij` op beide hypotheken zodat de saldi op de eerste prognose-maand
 * exact de startbalansen zijn (geen amortisatie-/rendementsdrift die de assertie
 * zou vertroebelen).
 *
 * When: de woonstrategie is `exclude_from_fire` (TS!nietLiquide = true voor de
 * eigen-woning-categorieën, `adapter/prio-overgang.ts#buildTsParams`).
 *
 * Then: Prognose!J (nettoLiquide, de FIRE-grondslag, `tables/prognose.ts#computePrognose`)
 * sluit ALLEEN het eigen huis en zijn hypotheek uit — het verhuurde pand en zijn
 * hypotheek blijven liquide en dus in J. `adapter/potten.ts#isNietEigenWoningHypotheek`
 * herkent de beleggingshypotheek aan zijn koppeling (`linked_asset_id` naar een
 * actief, niet-`eigen_huis`-bezit) en zet 'm op schuldcategorie 'Overig' i.p.v.
 * 'Woning', zodat hij NIET meetelt in de M-kolom (niet-liquide schuld).
 *
 * Onder `include_full` is niets nietLiquide → J === I, ongeacht die koppeling.
 */
import { describe, it, expect } from 'vitest'
import { buildKernelInputFromAppWithNotices } from '@/lib/horizon-kernel/adapter'
import { solveFire } from '@/lib/horizon-kernel/solver'
import type { PrognoseComputedRow } from '@/lib/horizon-kernel/tables/prognose'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

const HUISWAARDE = 400_000
const EIGEN_HYP_SALDO = 300_000
const PAND_WAARDE = 200_000
const BELEGGINGS_HYP_SALDO = 110_000

const assets: Asset[] = [
  {
    id: 'house', name: 'Eigen woning', asset_type: 'eigen_huis', current_value: HUISWAARDE,
    expected_return: 0, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100,
  } as unknown as Asset,
  {
    id: 'pand', name: 'Verhuurd pand', asset_type: 'real_estate', current_value: PAND_WAARDE,
    expected_return: 0, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100,
  } as unknown as Asset,
  {
    id: 'sav', name: 'Spaarrekening', asset_type: 'savings', current_value: 50_000,
    expected_return: 0, monthly_contribution: 0, is_active: true, net_worth_inclusion_pct: 100,
  } as unknown as Asset,
]

const debts: Debt[] = [
  {
    id: 'hyp-eigen', name: 'Hypotheek eigen woning', debt_type: 'mortgage', current_balance: EIGEN_HYP_SALDO,
    interest_rate: 0, monthly_payment: 0, repayment_type: 'aflossingsvrij', is_active: true,
    linked_asset_id: 'house', net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
  } as unknown as Debt,
  {
    id: 'hyp-beleg', name: 'Hypotheek verhuurd pand', debt_type: 'mortgage', current_balance: BELEGGINGS_HYP_SALDO,
    interest_rate: 0, monthly_payment: 0, repayment_type: 'aflossingsvrij', is_active: true,
    linked_asset_id: 'pand', net_worth_inclusion_pct: 100, include_aflossing_in_savings: false,
  } as unknown as Debt,
]

function profileWith(mode: 'exclude_from_fire' | 'include_full') {
  return {
    date_of_birth: '1980-01-01',
    net_monthly_income: 4000,
    estimated_monthly_expenses: 2500,
    expected_return: 0.05,
    inflation_rate: 0.02,
    box3_method: 'forfaitair',
    fire_end_strategy: 'deplete',
    fire_end_age: 90,
    housing_strategy_config: { mode },
  }
}

function firstPrognoseRow(mode: 'exclude_from_fire' | 'include_full'): PrognoseComputedRow {
  const input = buildKernelInputFromAppWithNotices({ profile: profileWith(mode), assets, debts }).input
  const solve = solveFire(input)
  const row = solve.projection.prognose[0]
  if (row === undefined || row.beyondHorizon) {
    throw new Error('geen bruikbare eerste prognose-rij (buiten horizon) — fixture ongeldig')
  }
  return row
}

describe('kernel · Prognose!J-grondslag bij een beleggingshypotheek (defect B)', () => {
  it('exclude_from_fire: J sluit ALLEEN het eigen huis + zijn hypotheek uit (pand + beleggingshypotheek blijven liquide)', () => {
    const row = firstPrognoseRow('exclude_from_fire')
    // J = I − (L − M), waarbij L/M uitsluitend het eigen-woningblok zijn:
    // L = huiswaarde, M = eigen-woninghypotheeksaldo. De beleggingshypotheek
    // (110k) telt NIET mee in M — anders viel J ~110k te hoog uit.
    const expectedJ = row.nettoVermogen - HUISWAARDE + EIGEN_HYP_SALDO
    expect(row.nettoLiquide).toBeCloseTo(expectedJ, 2)
  })

  it('include_full: niets is nietLiquide → J === I', () => {
    const row = firstPrognoseRow('include_full')
    expect(row.nettoLiquide).toBeCloseTo(row.nettoVermogen, 2)
  })
})
