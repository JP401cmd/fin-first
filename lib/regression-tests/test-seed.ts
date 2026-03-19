import type { SupabaseClient } from '@supabase/supabase-js'
import { BUDGET_SLUGS } from '@/lib/budget-data'

// ── Test Data Seed for Regression Test Account ──────────────────────────────
//
// Seeds minimal but realistic financial data for the dedicated regression-test
// account so data-dependent tests can operate on actual rows. Runs before
// the test suite starts and cleans up afterwards.
//
// The seed is idempotent — it upserts the profile and checks for existing
// data before inserting, so running it twice won't create duplicates.

const SEED_TAG = '__regression_seed__'

// ── Helper: date strings ────────────────────────────────────────────────────

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d.toISOString().split('T')[0]
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Seed function ───────────────────────────────────────────────────────────

export async function seedTestData(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const S = BUDGET_SLUGS

  // ── 1. Profile ──────────────────────────────────────────────────────────
  await supabase.from('profiles').upsert({
    id: userId,
    full_name: 'Regressie Tester',
    date_of_birth: '1990-06-15',
    household_type: 'solo',
    number_of_children: 0,
    temporal_balance: 3,
    net_monthly_income: 3500,
    estimated_monthly_expenses: 2200,
    onboarding_completed: true,
    is_demo_user: false,
    budgeting_active: true,
    expected_return: 0.07,
    inflation_rate: 0.02,
    fire_end_strategy: 'perpetual',
    retirement_expense_method: 'current_income',
    withdrawal_strategy: 'static',
    guardrail_floor: 0.80,
    guardrail_ceiling: 1.20,
    feature_preferences: { _invulfase_active: false },
    updated_at: new Date().toISOString(),
  })

  // ── 2. Assets ───────────────────────────────────────────────────────────
  // Check if seed assets already exist
  const { data: existingAssets } = await supabase
    .from('assets')
    .select('id, name')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  let savingsAssetId: string | null = null
  let investmentAssetId: string | null = null
  let houseAssetId: string | null = null

  if (!existingAssets || existingAssets.length === 0) {
    const { data: insertedAssets } = await supabase
      .from('assets')
      .insert([
        {
          user_id: userId,
          name: `Spaarrekening ING ${SEED_TAG}`,
          asset_type: 'savings',
          current_value: 25000,
          purchase_value: 25000,
          expected_return: 1.5,
          monthly_contribution: 500,
          institution: 'ING',
          is_active: true,
          sort_order: 0,
          net_worth_inclusion_pct: 100,
          has_budget_tracking: false,
        },
        {
          user_id: userId,
          name: `Beleggingsrekening DEGIRO ${SEED_TAG}`,
          asset_type: 'investment',
          current_value: 45000,
          purchase_value: 38000,
          expected_return: 7,
          monthly_contribution: 300,
          institution: 'DEGIRO',
          is_active: true,
          sort_order: 1,
          net_worth_inclusion_pct: 100,
          has_budget_tracking: false,
        },
        {
          user_id: userId,
          name: `Eigen woning ${SEED_TAG}`,
          asset_type: 'eigen_huis',
          current_value: 380000,
          purchase_value: 320000,
          expected_return: 2,
          monthly_contribution: 0,
          institution: '',
          is_active: true,
          sort_order: 2,
          net_worth_inclusion_pct: 100,
          has_budget_tracking: false,
          woz_value: 375000,
        },
      ])
      .select('id, name')

    if (insertedAssets) {
      savingsAssetId = insertedAssets.find(a => a.name.includes('Spaarrekening'))?.id ?? null
      investmentAssetId = insertedAssets.find(a => a.name.includes('Beleggingsrekening'))?.id ?? null
      houseAssetId = insertedAssets.find(a => a.name.includes('Eigen woning'))?.id ?? null
    }
  } else {
    savingsAssetId = existingAssets.find(a => a.name.includes('Spaarrekening'))?.id ?? null
    investmentAssetId = existingAssets.find(a => a.name.includes('Beleggingsrekening'))?.id ?? null
    houseAssetId = existingAssets.find(a => a.name.includes('Eigen woning'))?.id ?? null
  }

  // ── 3. Bank account ─────────────────────────────────────────────────────
  const { data: existingBanks } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  let bankAccountId: string | null = null

  if (!existingBanks || existingBanks.length === 0) {
    const { data: insertedBank } = await supabase
      .from('bank_accounts')
      .insert({
        user_id: userId,
        name: `Betaalrekening ING ${SEED_TAG}`,
        bank_name: 'ING',
        account_type: 'checking',
        balance: 3200,
        iban: 'NL91INGB0001234567',
        is_active: true,
        sort_order: 0,
        linked_asset_id: savingsAssetId,
      })
      .select('id')
      .single()

    bankAccountId = insertedBank?.id ?? null
  } else {
    bankAccountId = existingBanks[0].id
  }

  // ── 4. Holdings (stocks/ETFs) ───────────────────────────────────────────
  const { data: existingHoldings } = await supabase
    .from('holdings')
    .select('id')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  if (!existingHoldings || existingHoldings.length === 0) {
    await supabase.from('holdings').insert([
      {
        user_id: userId,
        asset_id: investmentAssetId,
        ticker: 'IWDA',
        isin: 'IE00B4L5Y983',
        name: `iShares MSCI World ${SEED_TAG}`,
        units: 120,
        avg_purchase_price: 75.50,
        current_price: 82.30,
        purchase_date: '2023-03-01',
        is_active: true,
        currency: 'EUR',
      },
      {
        user_id: userId,
        asset_id: investmentAssetId,
        ticker: 'VWRL',
        isin: 'IE00B3RBWM25',
        name: `Vanguard FTSE All-World ${SEED_TAG}`,
        units: 85,
        avg_purchase_price: 98.20,
        current_price: 108.50,
        purchase_date: '2023-06-15',
        is_active: true,
        currency: 'EUR',
      },
    ])
  }

  // ── 5. Debt ─────────────────────────────────────────────────────────────
  const { data: existingDebts } = await supabase
    .from('debts')
    .select('id')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  if (!existingDebts || existingDebts.length === 0) {
    await supabase.from('debts').insert({
      user_id: userId,
      name: `Hypotheek ${SEED_TAG}`,
      debt_type: 'mortgage',
      original_amount: 320000,
      current_balance: 285000,
      interest_rate: 3.5,
      minimum_payment: 1200,
      monthly_payment: 1400,
      start_date: '2020-01-01',
      creditor: 'ABN AMRO',
      is_active: true,
      sort_order: 0,
      repayment_type: 'annuiteit',
      is_tax_deductible: true,
      linked_asset_id: houseAssetId,
      net_worth_inclusion_pct: 100,
    })
  }

  // ── 6. Budgets (parent + children) ──────────────────────────────────────
  // Uses standard BUDGET_SLUGS consistent with new template structure
  const { data: existingBudgets } = await supabase
    .from('budgets')
    .select('id')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  if (!existingBudgets || existingBudgets.length === 0) {
    // Parent: Vaste lasten wonen & energie (matches template category)
    const { data: vasteLasten } = await supabase
      .from('budgets')
      .insert({
        user_id: userId,
        parent_id: null,
        name: `Vaste lasten wonen & energie ${SEED_TAG}`,
        slug: S.VASTE_LASTEN_WONEN,
        icon: 'Home',
        default_limit: 1550,
        budget_type: 'expense',
        interval: 'monthly',
        rollover_type: 'reset',
        is_essential: true,
        priority_score: 5,
        sort_order: 0,
      })
      .select('id')
      .single()

    if (vasteLasten) {
      await supabase.from('budgets').insert([
        {
          user_id: userId,
          parent_id: vasteLasten.id,
          name: `Huur / hypotheek ${SEED_TAG}`,
          slug: S.HUUR_HYPOTHEEK,
          icon: 'Building2',
          default_limit: 1200,
          budget_type: 'expense',
          interval: 'monthly',
          rollover_type: 'reset',
          is_essential: true,
          sort_order: 0,
        },
        {
          user_id: userId,
          parent_id: vasteLasten.id,
          name: `Gas, water, licht ${SEED_TAG}`,
          slug: S.GAS_WATER_LICHT,
          icon: 'Zap',
          default_limit: 200,
          budget_type: 'expense',
          interval: 'monthly',
          rollover_type: 'reset',
          is_essential: true,
          sort_order: 1,
        },
        {
          user_id: userId,
          parent_id: vasteLasten.id,
          name: `Verzekeringen wonen & gezondheid ${SEED_TAG}`,
          slug: S.VERZEKERINGEN_WONEN,
          icon: 'ShieldCheck',
          default_limit: 150,
          budget_type: 'expense',
          interval: 'monthly',
          rollover_type: 'reset',
          is_essential: true,
          sort_order: 2,
        },
      ])
    }

    // Parent: Dagelijkse uitgaven (matches template category)
    const { data: dagelijks } = await supabase
      .from('budgets')
      .insert({
        user_id: userId,
        parent_id: null,
        name: `Dagelijkse uitgaven ${SEED_TAG}`,
        slug: S.DAGELIJKSE_UITGAVEN,
        icon: 'ShoppingCart',
        default_limit: 650,
        budget_type: 'expense',
        interval: 'monthly',
        rollover_type: 'reset',
        is_essential: true,
        priority_score: 5,
        sort_order: 1,
      })
      .select('id')
      .single()

    if (dagelijks) {
      await supabase.from('budgets').insert([
        {
          user_id: userId,
          parent_id: dagelijks.id,
          name: `Boodschappen ${SEED_TAG}`,
          slug: S.BOODSCHAPPEN,
          icon: 'Store',
          default_limit: 400,
          budget_type: 'expense',
          interval: 'monthly',
          rollover_type: 'reset',
          is_essential: true,
          sort_order: 0,
        },
        {
          user_id: userId,
          parent_id: dagelijks.id,
          name: `Huishouden & verzorging ${SEED_TAG}`,
          slug: S.HUISHOUDEN_VERZORGING,
          icon: 'SprayCan',
          default_limit: 150,
          budget_type: 'expense',
          interval: 'monthly',
          rollover_type: 'reset',
          is_essential: true,
          sort_order: 1,
        },
        {
          user_id: userId,
          parent_id: dagelijks.id,
          name: `Medische kosten ${SEED_TAG}`,
          slug: S.MEDISCHE_KOSTEN,
          icon: 'HeartPulse',
          default_limit: 100,
          budget_type: 'expense',
          interval: 'monthly',
          rollover_type: 'reset',
          is_essential: true,
          sort_order: 2,
        },
      ])
    }
  }

  // ── 7. Transactions ─────────────────────────────────────────────────────
  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .like('description', `%${SEED_TAG}%`)
    .limit(1)

  if (!existingTx || existingTx.length === 0) {
    // Get budget IDs for linking
    const { data: budgets } = await supabase
      .from('budgets')
      .select('id, slug')
      .eq('user_id', userId)
      .like('name', `%${SEED_TAG}%`)

    const budgetMap = new Map(budgets?.map(b => [b.slug, b.id]) ?? [])

    const txRows = [
      {
        user_id: userId,
        account_id: bankAccountId,
        budget_id: budgetMap.get(S.BOODSCHAPPEN) ?? null,
        date: daysAgo(2),
        amount: 67.30,
        description: `Albert Heijn ${SEED_TAG}`,
        counterparty_name: 'Albert Heijn',
        is_income: false,
        category_source: 'manual',
      },
      {
        user_id: userId,
        account_id: bankAccountId,
        budget_id: budgetMap.get(S.HUISHOUDEN_VERZORGING) ?? null,
        date: daysAgo(5),
        amount: 42.50,
        description: `Restaurant De Kas ${SEED_TAG}`,
        counterparty_name: 'De Kas',
        is_income: false,
        category_source: 'manual',
      },
      {
        user_id: userId,
        account_id: bankAccountId,
        budget_id: budgetMap.get(S.HUUR_HYPOTHEEK) ?? null,
        date: daysAgo(10),
        amount: 1200,
        description: `Hypotheek ABN AMRO ${SEED_TAG}`,
        counterparty_name: 'ABN AMRO',
        is_income: false,
        category_source: 'manual',
      },
      {
        user_id: userId,
        account_id: bankAccountId,
        budget_id: null,
        date: daysAgo(1),
        amount: 3500,
        description: `Salaris ${SEED_TAG}`,
        counterparty_name: 'Werkgever B.V.',
        is_income: true,
        category_source: 'manual',
      },
    ]

    await supabase.from('transactions').insert(txRows)
  }

  // ── 8. Net worth snapshots (6 months of history) ────────────────────────
  const { data: existingSnapshots } = await supabase
    .from('net_worth_snapshots')
    .select('id')
    .eq('user_id', userId)
    .limit(1)

  if (!existingSnapshots || existingSnapshots.length === 0) {
    const snapshots = []
    for (let i = 6; i >= 0; i--) {
      const totalAssets = 430000 + (6 - i) * 3000 // gradually increasing
      const totalDebts = 290000 - (6 - i) * 800   // gradually decreasing
      snapshots.push({
        user_id: userId,
        snapshot_date: monthsAgo(i),
        total_assets: totalAssets,
        total_debts: totalDebts,
        net_worth: totalAssets - totalDebts,
        freedom_percentage: Math.round(((totalAssets - totalDebts) / (2200 * 12)) * 100) / 100,
        sovereignty_level: 3,
        savings_rate: 37,
      })
    }
    await supabase.from('net_worth_snapshots').insert(snapshots)
  }

  // ── 9. Life events (AOW) ────────────────────────────────────────────────
  const { data: existingEvents } = await supabase
    .from('life_events')
    .select('id')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)
    .limit(1)

  if (!existingEvents || existingEvents.length === 0) {
    await supabase.from('life_events').insert({
      user_id: userId,
      name: `AOW ${SEED_TAG}`,
      type: 'income_start',
      date: '2057-06-15',
      monthly_amount: 1400,
      is_active: true,
      sort_order: 0,
    })
  }
}

// ── Cleanup function ──────────────────────────────────────────────────────

export async function cleanupTestData(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // Delete in reverse dependency order to respect FK constraints

  // Transactions first (depend on bank_accounts + budgets)
  await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .like('description', `%${SEED_TAG}%`)

  // Life events
  await supabase
    .from('life_events')
    .delete()
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  // Net worth snapshots (delete all for user — they're our seed data)
  await supabase
    .from('net_worth_snapshots')
    .delete()
    .eq('user_id', userId)

  // Holdings (depend on assets)
  await supabase
    .from('holdings')
    .delete()
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  // Debts (may reference assets via linked_asset_id)
  await supabase
    .from('debts')
    .delete()
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  // Child budgets first (depend on parent budgets)
  const { data: childBudgets } = await supabase
    .from('budgets')
    .select('id, parent_id')
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)
    .not('parent_id', 'is', null)

  if (childBudgets && childBudgets.length > 0) {
    await supabase
      .from('budgets')
      .delete()
      .in('id', childBudgets.map(b => b.id))
  }

  // Parent budgets
  await supabase
    .from('budgets')
    .delete()
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  // Bank accounts (depend on assets via linked_asset_id)
  await supabase
    .from('bank_accounts')
    .delete()
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  // Assets last (referenced by holdings, debts, bank_accounts)
  await supabase
    .from('assets')
    .delete()
    .eq('user_id', userId)
    .like('name', `%${SEED_TAG}%`)

  // Note: We do NOT delete the profile — it persists for the test account
}
