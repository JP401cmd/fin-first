/**
 * Shared seeding logic for persona data.
 * Used by both admin seed endpoint and onboarding flow.
 *
 * Optimized with batched parallel deletes (3 batches) and
 * phased parallel inserts (3 phases) to minimize DB round-trips.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonaData } from '@/lib/test-personas'

type ProgressCallback = (step: string, table: string, action: string, count?: number) => void

// ── Helper: relative date from today ──────────────────────────

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function monthsAgoDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  d.setDate(1)
  return d.toISOString().split('T')[0]
}

// ── Helper: delete from table ─────────────────────────────────

async function deleteTable(supabase: SupabaseClient, table: string, userId: string): Promise<number> {
  const { count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('user_id', userId)
  return count ?? 0
}

/**
 * Delete all user data from all financial tables.
 * Uses 3 batched parallel deletes respecting FK constraints.
 */
export async function deleteAllUserData(
  supabase: SupabaseClient,
  userId: string,
  onProgress?: ProgressCallback,
): Promise<Record<string, number>> {
  const summary: Record<string, number> = {}

  // Batch 1: leaf tables (no FK dependencies to other user tables)
  const batch1Results = await Promise.all([
    deleteTable(supabase, 'recommendation_feedback', userId),
    deleteTable(supabase, 'budget_rollovers', userId),
    deleteTable(supabase, 'recurring_transactions', userId),
    deleteTable(supabase, 'valuations', userId),
    deleteTable(supabase, 'net_worth_snapshots', userId),
    deleteTable(supabase, 'life_events', userId),
    deleteTable(supabase, 'goals', userId),
  ])
  const batch1Tables = ['recommendation_feedback', 'budget_rollovers', 'recurring_transactions', 'valuations', 'net_worth_snapshots', 'life_events', 'goals']
  for (let i = 0; i < batch1Tables.length; i++) {
    summary[batch1Tables[i]] = batch1Results[i]
  }
  onProgress?.('Basisgegevens verwijderen...', 'batch1', 'delete', batch1Results.reduce((a, b) => a + b, 0))

  // Batch 2: mid-level (FK to recommendations, budgets)
  const batch2Results = await Promise.all([
    deleteTable(supabase, 'actions', userId),
    deleteTable(supabase, 'transactions', userId),
    deleteTable(supabase, 'budget_amounts', userId),
  ])
  const batch2Tables = ['actions', 'transactions', 'budget_amounts']
  for (let i = 0; i < batch2Tables.length; i++) {
    summary[batch2Tables[i]] = batch2Results[i]
  }
  onProgress?.('Transacties & acties verwijderen...', 'batch2', 'delete', batch2Results.reduce((a, b) => a + b, 0))

  // Batch 3: parent tables
  const batch3Results = await Promise.all([
    deleteTable(supabase, 'recommendations', userId),
    deleteTable(supabase, 'debts', userId),
    deleteTable(supabase, 'assets', userId),
    deleteTable(supabase, 'bank_accounts', userId),
    deleteTable(supabase, 'budgets', userId),
  ])
  const batch3Tables = ['recommendations', 'debts', 'assets', 'bank_accounts', 'budgets']
  for (let i = 0; i < batch3Tables.length; i++) {
    summary[batch3Tables[i]] = batch3Results[i]
  }
  onProgress?.('Hoofdtabellen verwijderen...', 'batch3', 'delete', batch3Results.reduce((a, b) => a + b, 0))

  return summary
}

/**
 * Seed all persona data for a user.
 * Uses phased parallel inserts to minimize DB round-trips.
 */
export async function seedPersonaData(
  supabase: SupabaseClient,
  userId: string,
  persona: PersonaData,
  onProgress: ProgressCallback,
): Promise<Record<string, number>> {
  const summary: Record<string, number> = {}

  // ── Profile (quick, do first) ───────────────────────────────

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      full_name: persona.profile.full_name,
      date_of_birth: persona.profile.date_of_birth,
      household_type: persona.profile.household_type,
      temporal_balance: persona.profile.temporal_balance,
      updated_at: new Date().toISOString(),
    })
  if (profileError) throw new Error(`Profiel update mislukt: ${profileError.message}`)
  summary.profiles = 1

  // ── Phase 1: Independent inserts (parallel) ─────────────────

  const accountRows = persona.bank_accounts.map((a) => ({
    user_id: userId,
    ...a,
  }))

  const assetRows = persona.assets.map((a, i) => ({
    user_id: userId,
    name: a.name,
    asset_type: a.asset_type,
    current_value: a.current_value,
    purchase_value: a.purchase_value,
    purchase_date: a.purchase_date,
    expected_return: a.expected_return,
    monthly_contribution: a.monthly_contribution,
    institution: a.institution || null,
    is_active: true,
    sort_order: i,
    subtype: a.subtype || null,
    risk_profile: a.risk_profile || null,
    tax_benefit: a.tax_benefit ?? null,
    is_liquid: a.is_liquid ?? null,
    lock_end_date: a.lock_end_date || null,
    ticker_symbol: a.ticker_symbol || null,
    rental_income: a.rental_income ?? null,
    woz_value: a.woz_value ?? null,
    retirement_provider_type: a.retirement_provider_type || null,
    depreciation_rate: a.depreciation_rate ?? null,
    address_postcode: a.address_postcode || null,
    address_house_number: a.address_house_number || null,
  }))

  const goalRows = persona.goals.map((g, i) => ({
    user_id: userId,
    name: g.name,
    description: g.description,
    goal_type: g.goal_type,
    target_value: g.target_value,
    current_value: g.current_value,
    target_date: g.target_date,
    icon: g.icon,
    color: g.color,
    is_completed: g.is_completed,
    sort_order: i,
  }))

  const eventRows = persona.life_events.map((e) => ({
    user_id: userId,
    name: e.name,
    event_type: e.event_type,
    target_age: e.target_age,
    target_date: e.target_date,
    one_time_cost: e.one_time_cost,
    monthly_cost_change: e.monthly_cost_change,
    monthly_income_change: e.monthly_income_change,
    duration_months: e.duration_months,
    icon: e.icon,
    is_active: e.is_active,
    sort_order: e.sort_order,
  }))

  const snapshotRows = persona.net_worth_snapshots.map((s) => ({
    user_id: userId,
    snapshot_date: monthsAgoDate(s.monthsAgo),
    total_assets: s.total_assets,
    total_debts: s.total_debts,
    net_worth: s.net_worth,
  }))

  const [accountsResult, assetsResult, goalsResult, eventsResult, snapshotsResult] = await Promise.all([
    supabase.from('bank_accounts').insert(accountRows).select('id, name'),
    supabase.from('assets').insert(assetRows).select('id, name'),
    supabase.from('goals').insert(goalRows).select('id'),
    supabase.from('life_events').insert(eventRows).select('id'),
    supabase.from('net_worth_snapshots').insert(snapshotRows).select('id'),
  ])

  if (accountsResult.error) throw new Error(`Bankrekeningen insert mislukt: ${accountsResult.error.message}`)
  if (assetsResult.error) throw new Error(`Assets insert mislukt: ${assetsResult.error.message}`)
  if (goalsResult.error) throw new Error(`Doelen insert mislukt: ${goalsResult.error.message}`)
  if (eventsResult.error) throw new Error(`Levensgebeurtenissen insert mislukt: ${eventsResult.error.message}`)
  if (snapshotsResult.error) throw new Error(`Vermogenssnapshots insert mislukt: ${snapshotsResult.error.message}`)

  const insertedAccounts = accountsResult.data
  const insertedAssets = assetsResult.data
  const primaryAccountId = insertedAccounts?.[0]?.id

  summary.bank_accounts = insertedAccounts?.length ?? 0
  summary.assets = insertedAssets?.length ?? 0
  summary.goals = goalsResult.data?.length ?? 0
  summary.life_events = eventsResult.data?.length ?? 0
  summary.net_worth_snapshots = snapshotsResult.data?.length ?? 0

  onProgress('Basisgegevens toevoegen...', 'phase1', 'insert',
    summary.bank_accounts + summary.assets + summary.goals + summary.life_events + summary.net_worth_snapshots)

  // Build asset name -> id mapping for mortgage linking
  const assetNameToId: Record<string, string> = {}
  if (insertedAssets) {
    for (let i = 0; i < insertedAssets.length; i++) {
      assetNameToId[persona.assets[i].name] = insertedAssets[i].id
    }
  }

  // ── Phase 2: Dependent inserts (parallel where possible) ────

  // Debts need asset IDs for linking
  async function insertDebts() {
    if (persona.debts.length === 0) {
      summary.debts = 0
      return
    }

    const debtRows = persona.debts.map((d, i) => ({
      user_id: userId,
      name: d.name,
      debt_type: d.debt_type,
      original_amount: d.original_amount,
      current_balance: d.current_balance,
      interest_rate: d.interest_rate,
      minimum_payment: d.minimum_payment,
      monthly_payment: d.monthly_payment,
      start_date: d.start_date,
      creditor: d.creditor || null,
      is_active: true,
      sort_order: i,
      subtype: d.subtype || null,
      is_tax_deductible: d.is_tax_deductible ?? null,
      fixed_rate_end_date: d.fixed_rate_end_date || null,
      nhg: d.nhg ?? null,
      credit_limit: d.credit_limit ?? null,
      repayment_type: d.repayment_type || null,
      draagkrachtmeting_date: d.draagkrachtmeting_date || null,
    }))
    const { data: insertedDebts, error: debtErr } = await supabase
      .from('debts')
      .insert(debtRows)
      .select('id')
    if (debtErr) throw new Error(`Schulden insert mislukt: ${debtErr.message}`)
    summary.debts = insertedDebts?.length ?? 0

    // Link mortgages to assets via linked_asset_id
    if (insertedDebts) {
      const linkPromises = []
      for (let i = 0; i < persona.debts.length; i++) {
        const debtDef = persona.debts[i]
        if (debtDef.linked_asset_name && assetNameToId[debtDef.linked_asset_name]) {
          linkPromises.push(
            supabase
              .from('debts')
              .update({ linked_asset_id: assetNameToId[debtDef.linked_asset_name] })
              .eq('id', insertedDebts[i].id)
              .then()
          )
        }
      }
      if (linkPromises.length > 0) await Promise.all(linkPromises)
    }
  }

  // Budgets: parent→child is sequential internally, but independent of other phase 2 inserts
  const budgetSlugToId: Record<string, string> = {}
  async function insertBudgets() {
    let budgetCount = 0
    for (const parent of persona.budgets) {
      const { data: parentData, error: parentErr } = await supabase
        .from('budgets')
        .insert({
          user_id: userId,
          parent_id: null,
          name: parent.name,
          slug: parent.slug,
          icon: parent.icon,
          description: parent.description,
          default_limit: parent.default_limit,
          budget_type: parent.budget_type,
          interval: 'monthly',
          rollover_type: 'reset',
          limit_type: 'soft',
          alert_threshold: 80,
          max_single_transaction_amount: parent.default_limit,
          is_essential: parent.is_essential,
          priority_score: parent.priority_score,
          is_inflation_indexed: false,
          sort_order: parent.sort_order,
        })
        .select('id')
        .single()
      if (parentErr) throw new Error(`Budget "${parent.name}" insert mislukt: ${parentErr.message}`)
      budgetSlugToId[parent.slug] = parentData.id
      budgetCount++

      if (parent.children) {
        for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i]
          const { data: childData, error: childErr } = await supabase
            .from('budgets')
            .insert({
              user_id: userId,
              parent_id: parentData.id,
              name: child.name,
              slug: child.slug,
              icon: child.icon,
              description: child.description,
              default_limit: child.default_limit,
              budget_type: parent.budget_type,
              interval: 'monthly',
              rollover_type: 'reset',
              limit_type: 'soft',
              alert_threshold: 80,
              max_single_transaction_amount: child.default_limit * 2,
              is_essential: parent.is_essential,
              priority_score: parent.priority_score,
              is_inflation_indexed: false,
              sort_order: i,
            })
            .select('id')
            .single()
          if (childErr) throw new Error(`Budget "${child.name}" insert mislukt: ${childErr.message}`)
          budgetSlugToId[child.slug] = childData.id
          budgetCount++
        }
      }
    }
    summary.budgets = budgetCount
  }

  // Recommendations + Actions: independent of other phase 2 inserts
  async function insertRecommendations() {
    let recCount = 0
    let actionCount = 0
    for (const rec of persona.recommendations) {
      const { data: recData, error: recErr } = await supabase
        .from('recommendations')
        .insert({
          user_id: userId,
          title: rec.title,
          description: rec.description,
          recommendation_type: rec.recommendation_type,
          euro_impact_monthly: rec.euro_impact_monthly,
          euro_impact_yearly: rec.euro_impact_yearly,
          freedom_days_per_year: rec.freedom_days_per_year,
          related_budget_slug: rec.related_budget_slug,
          priority_score: Math.max(1, Math.min(5, rec.priority_score)),
          suggested_actions: rec.suggested_actions,
          status: rec.status,
        })
        .select('id')
        .single()
      if (recErr) throw new Error(`Aanbeveling "${rec.title}" insert mislukt: ${recErr.message}`)
      recCount++

      for (const action of rec.actions) {
        const { error: actErr } = await supabase
          .from('actions')
          .insert({
            user_id: userId,
            recommendation_id: recData.id,
            source: action.source,
            title: action.title,
            description: action.description,
            freedom_days_impact: action.freedom_days_impact,
            euro_impact_monthly: action.euro_impact_monthly,
            status: action.status,
            priority_score: Math.max(1, Math.min(5, action.priority_score)),
            sort_order: actionCount,
          })
        if (actErr) throw new Error(`Actie "${action.title}" insert mislukt: ${actErr.message}`)
        actionCount++
      }
    }
    summary.recommendations = recCount
    summary.actions = actionCount
  }

  await Promise.all([insertDebts(), insertBudgets(), insertRecommendations()])

  onProgress('Schulden, budgetten & aanbevelingen toevoegen...', 'phase2', 'insert',
    (summary.debts ?? 0) + (summary.budgets ?? 0) + (summary.recommendations ?? 0))

  // ── Phase 3: Transactions (needs account ID + budget slug→ID map) ──

  if (primaryAccountId) {
    const txRows = persona.transactions.map((t) => ({
      user_id: userId,
      account_id: primaryAccountId,
      budget_id: budgetSlugToId[t.budgetSlug] ?? null,
      date: daysAgo(t.dayOffset),
      amount: t.amount,
      description: t.description,
      counterparty_name: t.counterparty_name,
      counterparty_iban: t.counterparty_iban,
      is_income: t.is_income,
      category_source: 'import',
    }))

    // Insert in batches of 50
    let txCount = 0
    for (let i = 0; i < txRows.length; i += 50) {
      const batch = txRows.slice(i, i + 50)
      const { error: txErr } = await supabase.from('transactions').insert(batch)
      if (txErr) throw new Error(`Transacties insert mislukt (batch ${Math.floor(i / 50)}): ${txErr.message}`)
      txCount += batch.length
    }
    summary.transactions = txCount
  } else {
    summary.transactions = 0
  }

  onProgress('Transacties toevoegen...', 'phase3', 'insert', summary.transactions)

  return summary
}
