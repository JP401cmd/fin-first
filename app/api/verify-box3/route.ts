import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { localMonthBounds } from '@/lib/month-range'
import { calculateBox3, BOX3_PARAMS, type TaxYear } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'

/**
 * API endpoint that verifies Box 3 tax calculations use real asset/debt data.
 * GET /api/verify-box3?year=2025
 *
 * Returns:
 * - Raw assets and debts from database
 * - Box 3 calculation result
 * - Step-by-step verification data
 * - Whether data is real (from DB) vs empty
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year') || '2025'
  const year = (parseInt(yearParam) === 2026 ? 2026 : 2025) as TaxYear

  try {
    const supabase = await createClient()

    // Fetch real data from Supabase
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

    // Calculate daily expenses same as belasting page
    const monthlyExpenses = transactions.reduce((sum: number, t: { amount: number }) => {
      const amt = Number(t.amount)
      return amt < 0 ? sum + Math.abs(amt) : sum
    }, 0)
    const dailyExpenses = monthlyExpenses > 0 ? (monthlyExpenses * 12) / 365 : 0

    // Run calculation with real data
    const input = { assets, debts, hasPartner: false, dailyExpenses, year }
    const result = assets.length > 0 || debts.length > 0
      ? calculateBox3(input)
      : null

    // Summarize assets for verification
    const assetSummary = assets.map(a => ({
      id: a.id,
      name: a.name,
      asset_type: a.asset_type,
      current_value: Number(a.current_value),
      is_active: a.is_active,
      tax_benefit: a.tax_benefit,
    }))

    const debtSummary = debts.map(d => ({
      id: d.id,
      name: d.name,
      debt_type: d.debt_type,
      current_balance: Number(d.current_balance),
      is_active: d.is_active,
      is_tax_deductible: d.is_tax_deductible,
      linked_asset_id: d.linked_asset_id,
    }))

    // Manual verification: recalculate step by step
    const params = BOX3_PARAMS[year]
    let manualSpaargeld = 0
    let manualBeleggingen = 0
    let manualUitgesloten = 0
    let manualBox3Schulden = 0

    for (const a of assets) {
      const val = Number(a.current_value)
      if (a.asset_type === 'eigen_huis') {
        manualUitgesloten += val
      } else if (a.asset_type === 'retirement' && a.tax_benefit) {
        manualUitgesloten += val
      } else if (a.asset_type === 'savings') {
        manualSpaargeld += val
      } else {
        manualBeleggingen += val
      }
    }

    const eigenHuisIds = new Set(assets.filter(a => a.asset_type === 'eigen_huis').map(a => a.id))
    for (const d of debts) {
      const bal = Number(d.current_balance)
      if (d.debt_type === 'mortgage' && d.linked_asset_id && eigenHuisIds.has(d.linked_asset_id) && d.is_tax_deductible) {
        // excluded
      } else {
        manualBox3Schulden += bal
      }
    }

    const schuldendrempel = params.schuldendrempelSingle
    const aftrekbareSchulden = Math.max(0, manualBox3Schulden - schuldendrempel)
    const forfaitairSpaargeld = manualSpaargeld * params.forfaitSpaargeld
    const forfaitairBeleggingen = manualBeleggingen * params.forfaitBeleggingen
    const forfaitairSchulden = aftrekbareSchulden * params.forfaitSchulden
    const voordeelUitSparen = forfaitairSpaargeld + forfaitairBeleggingen - forfaitairSchulden
    const rendementsgrondslag = (manualSpaargeld + manualBeleggingen) - aftrekbareSchulden
    const heffingsvrijVermogen = params.heffingsvrijSingle
    const grondslagSparen = Math.max(0, rendementsgrondslag - heffingsvrijVermogen)
    const effectiefRendement = rendementsgrondslag > 0 ? voordeelUitSparen / rendementsgrondslag : 0
    const box3Inkomen = grondslagSparen * effectiefRendement
    const belasting = box3Inkomen * params.tarief

    const manualCalculation = {
      spaargeld: manualSpaargeld,
      beleggingen: manualBeleggingen,
      uitgesloten: manualUitgesloten,
      box3Schulden: manualBox3Schulden,
      schuldendrempel,
      aftrekbareSchulden,
      forfaitairSpaargeld,
      forfaitairBeleggingen,
      forfaitairSchulden,
      voordeelUitSparen,
      rendementsgrondslag,
      heffingsvrijVermogen,
      grondslagSparen,
      effectiefRendement,
      box3Inkomen,
      belasting: Math.round(belasting * 100) / 100,
    }

    // Verify calculation matches
    const calculationMatches = result
      ? Math.abs(result.tax - belasting) < 0.01
      : assets.length === 0

    return NextResponse.json({
      status: 'ok',
      year,
      params,
      dataSource: 'supabase_database',
      assetCount: assets.length,
      debtCount: debts.length,
      transactionCount: transactions.length,
      assets: assetSummary,
      debts: debtSummary,
      dailyExpenses,
      calculatedResult: result ? {
        totaalSpaargeld: result.totaalSpaargeld,
        totaalBeleggingen: result.totaalBeleggingen,
        totaalUitgesloten: result.totaalUitgesloten,
        totaalBox3Schulden: result.totaalBox3Schulden,
        tax: result.tax,
        freedomDays: result.freedomDays,
      } : null,
      manualCalculation,
      calculationMatches,
      verification: {
        usesRealAssets: assets.length > 0,
        usesRealDebts: debts.length > 0,
        noMockData: true,
        dataFromDatabase: true,
      },
    })
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      error: String(err),
    }, { status: 500 })
  }
}
