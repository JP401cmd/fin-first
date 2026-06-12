import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { localMonthBounds } from '@/lib/month-range'
import {
  calculateBox3,
  generateBox3Optimizations,
  calculateBox3WithShift,
  BOX3_PARAMS,
  type Box3Input,
  type TaxYear,
} from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

/**
 * Verification endpoint for Feature #129:
 * "Box 3 tax optimization reflects real calculations"
 *
 * Tests are split into two groups:
 * A) Supabase integration tests — verify data flows from real database
 * B) Calculation engine tests — verify the pure calculation engine with
 *    known synthetic values (exercises ALL code paths regardless of auth state)
 */

// Helper to create synthetic assets for deterministic testing
function makeSyntheticAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'synth-' + Math.random().toString(36).slice(2, 8),
    user_id: 'test-user',
    name: 'Synthetic',
    asset_type: 'savings',
    current_value: 0,
    purchase_value: 0,
    purchase_date: null,
    expected_return: 0,
    monthly_contribution: 0,
    is_active: true,
    tax_benefit: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    linked_holding_id: null,
    ...overrides,
  } as Asset
}

function makeSyntheticDebt(overrides: Partial<Debt>): Debt {
  return {
    id: 'synth-' + Math.random().toString(36).slice(2, 8),
    user_id: 'test-user',
    name: 'Synthetic Debt',
    debt_type: 'personal_loan',
    original_amount: 10000,
    current_balance: 10000,
    interest_rate: 5,
    monthly_payment: 200,
    start_date: '2024-01-01',
    is_active: true,
    is_tax_deductible: false,
    linked_asset_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    repayment_type: 'annuity',
  } as unknown as Debt
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year') || '2025'
  const year = (parseInt(yearParam) === 2026 ? 2026 : 2025) as TaxYear

  const tests: { name: string; pass: boolean; detail: string }[] = []

  try {
    const supabase = await createClient()

    // Fetch real data from Supabase (same as belasting page)
    const [assetsResult, debtsResult, txResult] = await Promise.all([
      supabase.from('assets').select('*').eq('is_active', true),
      supabase.from('debts').select('*').eq('is_active', true),
      supabase
        .from('transactions')
        .select('amount')
        .gte('date', localMonthBounds(new Date()).start)
        .lt('date', localMonthBounds(new Date()).end),
    ])

    const assets = (assetsResult.data ?? []) as Asset[]
    const debts = (debtsResult.data ?? []) as Debt[]
    const transactions = txResult.data ?? []

    const monthlyExpenses = transactions.reduce((sum: number, t: { amount: number }) => {
      const amt = Number(t.amount)
      return amt < 0 ? sum + Math.abs(amt) : sum
    }, 0)
    const dailyExpenses = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0

    // ═══════════════════════════════════════════════════════════════
    // GROUP A: Supabase Integration Tests
    // ═══════════════════════════════════════════════════════════════

    // Test 1: Data loaded from real Supabase tables (no errors)
    const dataSourceOk = !assetsResult.error && !debtsResult.error && !txResult.error
    tests.push({
      name: 'Data loaded from real Supabase tables (no errors)',
      pass: dataSourceOk,
      detail: `assets: ${assets.length}, debts: ${debts.length}, transactions: ${transactions.length}${
        !dataSourceOk ? ` (errors: ${assetsResult.error?.message}, ${debtsResult.error?.message})` : ''
      }`,
    })

    // Test 2: If user has data, verify calculation uses actual asset values
    const input: Box3Input = { assets, debts, hasPartner: false, dailyExpenses, year }
    const hasData = assets.length > 0 || debts.length > 0
    const result = hasData ? calculateBox3(input) : null

    if (result) {
      let expectedSpaargeld = 0
      let expectedBeleggingen = 0
      for (const a of assets) {
        const val = Number(a.current_value)
        if (a.asset_type === 'savings') expectedSpaargeld += val
        else if (a.asset_type === 'eigen_huis') { /* excluded */ }
        else if (a.asset_type === 'retirement' && a.tax_benefit) { /* excluded */ }
        else expectedBeleggingen += val
      }
      const sMatch = Math.abs(result.totaalSpaargeld - expectedSpaargeld) < 0.01
      const bMatch = Math.abs(result.totaalBeleggingen - expectedBeleggingen) < 0.01
      tests.push({
        name: 'Tax calculation uses actual asset portfolio values',
        pass: sMatch && bMatch,
        detail: `Spaargeld: ${result.totaalSpaargeld.toFixed(2)} vs ${expectedSpaargeld.toFixed(2)} (${sMatch ? 'match' : 'MISMATCH'}), Beleggingen: ${result.totaalBeleggingen.toFixed(2)} vs ${expectedBeleggingen.toFixed(2)} (${bMatch ? 'match' : 'MISMATCH'})`,
      })
    } else {
      tests.push({
        name: 'Tax calculation uses actual asset portfolio values',
        pass: true,
        detail: 'No assets/debts in DB — empty state valid (page shows "Geen assets" message)',
      })
    }

    // ═══════════════════════════════════════════════════════════════
    // GROUP B: Calculation Engine Tests (synthetic data — always exercises logic)
    // ═══════════════════════════════════════════════════════════════

    const params2025 = BOX3_PARAMS[2025]
    const params2026 = BOX3_PARAMS[2026]

    // Test 3: Pure savings (€100k) → correct tax
    // Manual calc: €100k spaargeld, heffingsvrij €57,684
    // grondslag = 100000, forfait = 100000*0.0137=1370, effectief=1370/100000=0.0137
    // grondslagSparen = 100000-57684=42316, inkomen=42316*0.0137=579.73, belasting=579.73*0.36=208.70
    {
      const synAssets: Asset[] = [makeSyntheticAsset({ name: 'Spaarrekening', asset_type: 'savings', current_value: 100_000 })]
      const synInput: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const synResult = calculateBox3(synInput)
      const expectedTax = (100_000 - params2025.heffingsvrijSingle) * params2025.forfaitSpaargeld * params2025.tarief
      const taxMatch = Math.abs(synResult.tax - expectedTax) < 0.01
      tests.push({
        name: 'Savings-only €100k yields correct tax (2025)',
        pass: taxMatch && synResult.totaalSpaargeld === 100_000 && synResult.totaalBeleggingen === 0,
        detail: `Tax: €${synResult.tax.toFixed(2)} (expected: €${expectedTax.toFixed(2)}), spaargeld: €${synResult.totaalSpaargeld}, beleggingen: €${synResult.totaalBeleggingen}`,
      })
    }

    // Test 4: Mixed portfolio → beleggingen generate higher tax than savings
    {
      const synAssets: Asset[] = [
        makeSyntheticAsset({ name: 'Spaar', asset_type: 'savings', current_value: 30_000 }),
        makeSyntheticAsset({ name: 'Belegging', asset_type: 'investment', current_value: 80_000 }),
      ]
      const synInput: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const synResult = calculateBox3(synInput)
      // grondslag = 110000, forfaitS = 30000*0.0137=411, forfaitB = 80000*0.0588=4704
      // voordeel = 411+4704 = 5115, effectief = 5115/110000 = 0.046500
      // grondslagSparen = 110000-57684=52316, inkomen = 52316*effectief, belasting = inkomen*0.36
      const forfS = 30_000 * params2025.forfaitSpaargeld
      const forfB = 80_000 * params2025.forfaitBeleggingen
      const voordeel = forfS + forfB
      const grondslag = 110_000
      const effectief = voordeel / grondslag
      const grondslagSparen = grondslag - params2025.heffingsvrijSingle
      const inkomen = grondslagSparen * effectief
      const expectedTax = inkomen * params2025.tarief
      const taxMatch = Math.abs(synResult.tax - expectedTax) < 0.01
      tests.push({
        name: 'Mixed portfolio (€30k savings + €80k investments) correct tax',
        pass: taxMatch && synResult.totaalSpaargeld === 30_000 && synResult.totaalBeleggingen === 80_000,
        detail: `Tax: €${synResult.tax.toFixed(2)} (expected: €${expectedTax.toFixed(2)}). Savings: €${synResult.totaalSpaargeld}, Investments: €${synResult.totaalBeleggingen}`,
      })
    }

    // Test 5: Eigen huis excluded from Box 3
    {
      const synAssets: Asset[] = [
        makeSyntheticAsset({ name: 'Huis', asset_type: 'eigen_huis', current_value: 340_000 }),
        makeSyntheticAsset({ name: 'Spaar', asset_type: 'savings', current_value: 50_000 }),
      ]
      const synInput: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const synResult = calculateBox3(synInput)
      // huis excluded → only €50k spaargeld. Below heffingsvrij → tax = 0
      tests.push({
        name: 'Eigen huis (€340k) excluded from Box 3 calculation',
        pass: synResult.totaalUitgesloten === 340_000 && synResult.totaalSpaargeld === 50_000 && synResult.tax === 0,
        detail: `Uitgesloten: €${synResult.totaalUitgesloten}, Spaargeld: €${synResult.totaalSpaargeld}, Tax: €${synResult.tax.toFixed(2)} (expected: €0 because below heffingsvrij)`,
      })
    }

    // Test 6: Optimization — shift-to-savings reduces tax
    {
      const synAssets: Asset[] = [
        makeSyntheticAsset({ name: 'Spaar', asset_type: 'savings', current_value: 30_000 }),
        makeSyntheticAsset({ name: 'ETF', asset_type: 'investment', current_value: 80_000 }),
      ]
      const synInput: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const synResult = calculateBox3(synInput)
      const synOptimizations = generateBox3Optimizations(synResult, synInput)
      const shiftTip = synOptimizations.find(t => t.id === 'shift-to-savings')
      // Verify: shifting reduces tax because forfait spaargeld (1.37%) < forfait beleggingen (5.88%)
      const shiftAmount = Math.min(synResult.totaalBeleggingen, 50_000)
      const shifted = calculateBox3WithShift(synInput, shiftAmount)
      const expectedBesparing = synResult.tax - shifted.tax
      tests.push({
        name: 'Shift-to-savings optimization reduces tax (beleggingen→spaargeld)',
        pass: !!shiftTip && shiftTip.savings > 0 && Math.abs(shiftTip.savings - expectedBesparing) < 0.01,
        detail: shiftTip
          ? `Shift €${shiftAmount} from beleggingen to spaargeld → saves €${shiftTip.savings.toFixed(2)} (verified: €${expectedBesparing.toFixed(2)})`
          : 'FAIL: shift-to-savings tip not generated',
      })
    }

    // Test 7: Optimization — partner doubles heffingsvrij, reduces tax
    {
      const synAssets: Asset[] = [
        makeSyntheticAsset({ name: 'Spaar', asset_type: 'savings', current_value: 80_000 }),
        makeSyntheticAsset({ name: 'ETF', asset_type: 'investment', current_value: 40_000 }),
      ]
      const synInput: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const synResult = calculateBox3(synInput)
      const synOptimizations = generateBox3Optimizations(synResult, synInput)
      const partnerTip = synOptimizations.find(t => t.id === 'fiscaal-partner')
      const partnerResult = calculateBox3({ ...synInput, hasPartner: true })
      const expectedBesparing = synResult.tax - partnerResult.tax
      tests.push({
        name: 'Partner optimization doubles heffingsvrij and reduces tax',
        pass: !!partnerTip && partnerTip.savings > 0 && Math.abs(partnerTip.savings - expectedBesparing) < 0.01,
        detail: partnerTip
          ? `Single: €${synResult.tax.toFixed(2)}, Partner: €${partnerResult.tax.toFixed(2)}, Saves: €${partnerTip.savings.toFixed(2)} (heffingsvrij: €${params2025.heffingsvrijSingle} → €${params2025.heffingsvrijPartner})`
          : `FAIL: partner tip not generated (tax was €${synResult.tax.toFixed(2)})`,
      })
    }

    // Test 8: Freedom days calculated correctly from besparing
    {
      const synDailyExpenses = 82.19 // ~€30k/year
      const synAssets: Asset[] = [
        makeSyntheticAsset({ name: 'Spaar', asset_type: 'savings', current_value: 30_000 }),
        makeSyntheticAsset({ name: 'ETF', asset_type: 'investment', current_value: 80_000 }),
      ]
      const synInput: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: synDailyExpenses, year: 2025 }
      const synResult = calculateBox3(synInput)
      const synOptimizations = generateBox3Optimizations(synResult, synInput)

      // Verify all tips with besparing > 0 have correct vrijheidsdagen
      const tipsWithSavings = synOptimizations.filter(t => t.savings > 0)
      const allCorrect = tipsWithSavings.every(t => {
        const expected = Math.round(t.savings / synDailyExpenses)
        return t.freedomDays === expected
      })
      // Also verify the main result has correct vrijheidsdagen
      const mainDaysCorrect = synResult.freedomDays === Math.round(synResult.tax / synDailyExpenses)
      tests.push({
        name: 'Freedom days = besparing / daily expenses (correctly calculated)',
        pass: allCorrect && mainDaysCorrect,
        detail: `Main: ${synResult.freedomDays} days (€${synResult.tax.toFixed(2)} / €${synDailyExpenses}/day = ${Math.round(synResult.tax / synDailyExpenses)}). Tips: ${tipsWithSavings.map(t => `"${t.title}": ${t.freedomDays} days (€${t.savings.toFixed(2)} / €${synDailyExpenses} = ${Math.round(t.savings / synDailyExpenses)})`).join('; ')}`,
      })
    }

    // Test 9: Year change affects tax (different forfait rates)
    {
      const synAssets: Asset[] = [
        makeSyntheticAsset({ name: 'Spaar', asset_type: 'savings', current_value: 80_000 }),
        makeSyntheticAsset({ name: 'ETF', asset_type: 'investment', current_value: 40_000 }),
      ]
      const synInput2025: Box3Input = { assets: synAssets, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const synInput2026: Box3Input = { ...synInput2025, year: 2026 }
      const r2025 = calculateBox3(synInput2025)
      const r2026 = calculateBox3(synInput2026)
      // 2025 vs 2026 should differ (different forfaits and heffingsvrij)
      tests.push({
        name: 'Year toggle (2025 vs 2026) changes tax amount',
        pass: r2025.tax !== r2026.tax,
        detail: `2025: €${r2025.tax.toFixed(2)} (forfaitS=${params2025.forfaitSpaargeld}, forfaitB=${params2025.forfaitBeleggingen}, heffingsvrij=€${params2025.heffingsvrijSingle}), 2026: €${r2026.tax.toFixed(2)} (forfaitS=${params2026.forfaitSpaargeld}, forfaitB=${params2026.forfaitBeleggingen}, heffingsvrij=€${params2026.heffingsvrijSingle})`,
      })
    }

    // Test 10: Changing asset value changes tax (proves no hardcoded values)
    {
      const assets50k: Asset[] = [makeSyntheticAsset({ name: 'ETF', asset_type: 'investment', current_value: 50_000 })]
      const assets200k: Asset[] = [makeSyntheticAsset({ name: 'ETF', asset_type: 'investment', current_value: 200_000 })]
      const input50k: Box3Input = { assets: assets50k, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const input200k: Box3Input = { assets: assets200k, debts: [], hasPartner: false, dailyExpenses: 100, year: 2025 }
      const r50k = calculateBox3(input50k)
      const r200k = calculateBox3(input200k)
      // €50k is below heffingsvrij (€57,684) so tax=0. €200k should have significant tax.
      tests.push({
        name: 'Changing asset value changes tax (€50k vs €200k investments)',
        pass: r50k.tax === 0 && r200k.tax > 0 && r200k.tax > r50k.tax,
        detail: `€50k: tax=€${r50k.tax.toFixed(2)} (below heffingsvrij), €200k: tax=€${r200k.tax.toFixed(2)} (above heffingsvrij). Difference: €${(r200k.tax - r50k.tax).toFixed(2)}`,
      })
    }

    // Test 11: Official Box 3 parameters are not mocked
    {
      const p = BOX3_PARAMS[year]
      const paramsValid =
        p.forfaitSpaargeld > 0 && p.forfaitSpaargeld < 0.05 &&
        p.forfaitBeleggingen > 0 && p.forfaitBeleggingen < 0.10 &&
        p.tarief === 0.36 &&
        p.heffingsvrijSingle > 50_000 && p.heffingsvrijSingle < 70_000 &&
        p.heffingsvrijPartner === p.heffingsvrijSingle * 2 &&
        p.schuldendrempelPartner === p.schuldendrempelSingle * 2
      tests.push({
        name: 'Official Box 3 parameters are valid (not mock values)',
        pass: paramsValid,
        detail: `Year ${year}: forfaitS=${p.forfaitSpaargeld}, forfaitB=${p.forfaitBeleggingen}, tarief=${p.tarief}, heffingsvrij=€${p.heffingsvrijSingle} (partner: €${p.heffingsvrijPartner}), schuldendrempel=€${p.schuldendrempelSingle}`,
      })
    }

    const passing = tests.filter(t => t.pass).length
    const total = tests.length

    return NextResponse.json({
      status: 'ok',
      feature: 129,
      featureName: 'Box 3 tax optimization reflects real calculations',
      year,
      passing,
      total,
      allPassing: passing === total,
      tests,
      summary: {
        dbAssetCount: assets.length,
        dbDebtCount: debts.length,
        dailyExpenses: dailyExpenses.toFixed(2),
        belasting: result?.tax.toFixed(2) ?? 'N/A (no user data)',
        vrijheidsdagen: result?.freedomDays ?? 0,
        optimizationCount: result ? generateBox3Optimizations(result, input).length : 0,
      },
    })
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      error: String(err),
      tests,
    }, { status: 500 })
  }
}
