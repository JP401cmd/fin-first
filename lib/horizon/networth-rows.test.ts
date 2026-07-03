import { describe, it, expect } from 'vitest'
import { buildSimNetWorthRows } from './networth-rows'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import {
  deriveHousingContext,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'

/**
 * Variant-tabel-test voor de grafiek-dip-fix (jun 2026), na de v2-verwijdering
 * (FASE 6 stap 5A: de horizon-kernel is de enige motor — `useV2`/`v1DownsizeSaleAge`
 * bestaan niet meer).
 *
 * `buildSimNetWorthRows` levert het GEPROJECTEERDE VOLLEDIGE netto vermogen per
 * jaar (FIRE-pot + meegroeiende niet-liquide assets). Deze test valideert:
 *   - continuïteit vandaag→jaar-1: |simNetWorthRows[0] − currentNetWorth| < ε;
 *   - include_full/reverse_mortgage: reeks ≡ endPortfolio (geen optelling);
 *   - exclude_from_fire (zonder houseInLedger): reeks > endPortfolio met
 *     meegroeiende huiswaarde, geen dip;
 *   - houseInLedger (kernel-tak): huis al in endPortfolio, nooit bijtellen.
 */

const EPS = 1 // €1 tolerantie (afronding)

// Eigen huis €400k @ 2%/jr nominaal, hypotheek €200k annuïteit.
const DOB = '1986-01-01' // ~40 jr op 2026 (deterministisch; hier alleen relatief)
const HOUSE_VALUE = 400_000
const HOUSE_RETURN = 2 // %
const MORTGAGE_BALANCE = 200_000

function makeAssets(): Asset[] {
  return [
    {
      id: 'huis',
      name: 'Eigen woning',
      asset_type: 'eigen_huis',
      current_value: HOUSE_VALUE,
      woz_value: HOUSE_VALUE,
      expected_return: HOUSE_RETURN,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
    {
      id: 'beleggingen',
      name: 'Beleggingen',
      asset_type: 'investment',
      current_value: 100_000,
      woz_value: null,
      expected_return: 7,
      is_active: true,
      net_worth_inclusion_pct: 100,
      depreciation_rate: 0,
    },
  ] as unknown as Asset[]
}

function makeDebts(): Debt[] {
  return [
    {
      id: 'hyp',
      name: 'Hypotheek',
      debt_type: 'mortgage',
      current_balance: MORTGAGE_BALANCE,
      interest_rate: 2.9,
      monthly_payment: 1100,
      repayment_type: 'annuiteit',
      is_tax_deductible: true,
      linked_asset_id: 'huis',
      end_date: null,
      net_worth_inclusion_pct: 100,
      include_aflossing_in_savings: false,
      is_active: true,
    },
  ] as unknown as Debt[]
}

const assets = makeAssets()
const debts = makeDebts()
const ctx = deriveHousingContext(assets, debts)
// Overwaarde vandaag (= huiswaarde − hypotheeksaldo).
const houseEquityNow = Math.max(0, ctx.eigenHuisValue - ctx.mortgageBalance)

const currentAge = 40
const fireAge = 52

/**
 * Bouw een gefilterd `endPortfolio`-pad (zónder huis): het LIQUIDE deel groeit
 * van currentNetWorth − overwaarde naar boven. Dit is wat de engine voor
 * exclude_from_fire teruggeeft.
 */
function buildEndPortfolioFiltered(): { age: number; endPortfolio: number }[] {
  const rows: { age: number; endPortfolio: number }[] = []
  let v = 100_000 // start liquide (beleggingen)
  for (let age = currentAge; age <= fireAge; age++) {
    rows.push({ age, endPortfolio: Math.round(v) })
    v = v * 1.06 + 15_000
  }
  return rows
}

/**
 * Bouw een VOLLEDIG `endPortfolio`-pad (mét huis): voor de niet-filterende modi
 * geeft de engine het volledige netto vermogen terug.
 */
function buildEndPortfolioFull(): { age: number; endPortfolio: number }[] {
  return buildEndPortfolioFiltered().map((r) => ({
    age: r.age,
    // Voeg de overwaarde-van-nu erbij als ruwe benadering van "huis zit erin".
    endPortfolio: r.endPortfolio + houseEquityNow,
  }))
}

// currentNetWorth = volledig netto vermogen vandaag (liquide + overwaarde).
const currentNetWorth = 100_000 + houseEquityNow

const NON_FILTERING: { mode: HousingStrategyConfig; label: string }[] = [
  { mode: { mode: 'include_full' }, label: 'include_full' },
  {
    mode: {
      mode: 'reverse_mortgage',
      trigger: 'fixed_age',
      triggerAge: 67,
      depletionThresholdYears: 0,
      maxLoanPct: 0.5,
      interestRate: 0.055,
      monthlyPayout: null,
    },
    label: 'reverse_mortgage',
  },
]

describe('buildSimNetWorthRows — niet-filterende modi: reeks ≡ endPortfolio', () => {
  for (const variant of NON_FILTERING) {
    it(`${variant.label}: simNetWorthRows ≡ endPortfolio (geen huis-optelling)`, () => {
      const simRows = buildEndPortfolioFull()
      const out = buildSimNetWorthRows({
        simRows,
        currentNetWorth,
        housingStrategy: variant.mode,
        assets,
        debts,
        dateOfBirth: DOB,
      })
      // currentNetWorth ≈ endPortfolio[0] (volledig pad), dus de reconcile-offset
      // is ~0 en de reeks blijft gelijk aan endPortfolio.
      expect(out.length).toBe(simRows.length)
      for (let i = 0; i < out.length; i++) {
        expect(Math.abs(out[i].netWorth - simRows[i].endPortfolio)).toBeLessThanOrEqual(EPS)
      }
    })

    it(`${variant.label}: continuïteit vandaag→jaar-1 (|rij0 − currentNetWorth| < ε)`, () => {
      const simRows = buildEndPortfolioFull()
      const out = buildSimNetWorthRows({
        simRows,
        currentNetWorth,
        housingStrategy: variant.mode,
        assets,
        debts,
        dateOfBirth: DOB,
      })
      expect(Math.abs(out[0].netWorth - currentNetWorth)).toBeLessThanOrEqual(EPS)
    })
  }
})

describe('buildSimNetWorthRows — exclude_from_fire (zonder houseInLedger): huis-overwaarde erbij, geen dip', () => {
  const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }

  it('reeks > endPortfolio met meegroeiende huiswaarde', () => {
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    })
    // Elke rij telt overwaarde bij → reeks ligt boven het gefilterde endPortfolio.
    for (let i = 0; i < out.length; i++) {
      expect(out[i].netWorth).toBeGreaterThan(simRows[i].endPortfolio)
    }
    // De huiswaarde groeit → de bijdrage neemt toe over de jaren.
    const contribFirst = out[0].netWorth - simRows[0].endPortfolio
    const contribLast = out[out.length - 1].netWorth - simRows[simRows.length - 1].endPortfolio
    expect(contribLast).toBeGreaterThan(contribFirst)
  })

  it('continuïteit — geen dip direct na vandaag (rij0 ≈ currentNetWorth)', () => {
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(Math.abs(out[0].netWorth - currentNetWorth)).toBeLessThanOrEqual(EPS)
    // Geen dip: rij 1 ligt niet structureel ónder currentNetWorth door het
    // wegvallen van het huis (zoals de bug deed). De reeks stijgt of blijft.
    expect(out[1].netWorth).toBeGreaterThanOrEqual(out[0].netWorth - EPS)
  })
})

describe('buildSimNetWorthRows — kernel-tak (houseInLedger): huis al in het grootboek', () => {
  // Op de kernel-tak zit het eigen huis voor ÉLKE modus al in endPortfolio
  // (= LedgerRow nettoVermogen). De helper mag dan nooit overwaarde bijtellen —
  // ook niet bij exclude_from_fire, waar de filterende modus dat juist WÉL doet.
  // Spiegelt de `houseInLedger`-kortsluiting van applyHousingToComposition op /toekomst.
  for (const mode of ['exclude_from_fire', 'downsize'] as const) {
    const cfg: HousingStrategyConfig =
      mode === 'exclude_from_fire'
        ? { mode: 'exclude_from_fire' }
        : {
            mode: 'downsize',
            trigger: 'fixed_age',
            triggerAge: 67,
            depletionThresholdYears: 0,
            salePricePct: 1,
            salesCostsPct: 0.04,
            newMonthlyHousingCost: null,
          }

    it(`${mode} + houseInLedger → reeks ≡ endPortfolio (geen huis-optelling)`, () => {
      // Kernel geeft het VOLLEDIGE pad (huis zit in endPortfolio).
      const simRows = buildEndPortfolioFull()
      const out = buildSimNetWorthRows({
        simRows,
        currentNetWorth,
        housingStrategy: cfg,
        houseInLedger: true,
        assets,
        debts,
        dateOfBirth: DOB,
      })
      expect(out.length).toBe(simRows.length)
      for (let i = 0; i < out.length; i++) {
        expect(Math.abs(out[i].netWorth - simRows[i].endPortfolio)).toBeLessThanOrEqual(EPS)
      }
    })
  }

  it('exclude_from_fire: houseInLedger onderdrukt de overwaarde-optelling van de filterende modus', () => {
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    // Zelfde (gefilterde) endPortfolio-invoer; alleen de kernel-vlag verschilt.
    const simRows = buildEndPortfolioFiltered()
    const base = {
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    }
    const filtered = buildSimNetWorthRows({ ...base, houseInLedger: false })
    const kernel = buildSimNetWorthRows({ ...base, houseInLedger: true })
    // De filterende modus telt de meegroeiende overwaarde bij; de kernel-tak niet.
    // In de latere jaren (huiswaarde gegroeid) ligt de filterende reeks strikt boven.
    const last = simRows.length - 1
    expect(filtered[last].netWorth).toBeGreaterThan(kernel[last].netWorth + EPS)
  })

  it('houseInLedger weggelaten ≡ houseInLedger:false (byte-identiek, default-veilig)', () => {
    const cfg: HousingStrategyConfig = { mode: 'exclude_from_fire' }
    const simRows = buildEndPortfolioFiltered()
    const base = {
      simRows,
      currentNetWorth,
      housingStrategy: cfg,
      assets,
      debts,
      dateOfBirth: DOB,
    }
    const omitted = buildSimNetWorthRows(base)
    const explicitFalse = buildSimNetWorthRows({ ...base, houseInLedger: false })
    expect(omitted).toEqual(explicitFalse)
  })
})

describe('buildSimNetWorthRows — edge cases', () => {
  it('lege simRows → lege reeks', () => {
    const out = buildSimNetWorthRows({
      simRows: [],
      currentNetWorth,
      housingStrategy: { mode: 'exclude_from_fire' },
      assets,
      debts,
      dateOfBirth: DOB,
    })
    expect(out).toEqual([])
  })

  it('geen eigen huis → reeks ≡ endPortfolio (niets om bij te tellen)', () => {
    const noHouseAssets = [assets[1]] // alleen beleggingen
    const simRows = buildEndPortfolioFiltered()
    const out = buildSimNetWorthRows({
      simRows,
      currentNetWorth: 100_000, // geen overwaarde
      housingStrategy: { mode: 'exclude_from_fire' },
      assets: noHouseAssets,
      debts: [],
      dateOfBirth: DOB,
    })
    for (let i = 0; i < out.length; i++) {
      expect(Math.abs(out[i].netWorth - simRows[i].endPortfolio)).toBeLessThanOrEqual(EPS)
    }
  })
})
