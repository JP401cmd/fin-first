import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDefaultBudgets } from '@/lib/budget-data'
import { NL_AOW_AGE, NL_AOW_MONTHLY } from '@/lib/horizon-data'

const bodySchema = z.object({
  identity: z.object({
    full_name: z.string().min(1),
    date_of_birth: z.string().min(1),
    household_type: z.enum(['solo', 'samen', 'gezin']),
    number_of_children: z.number().int().min(0).default(0),
    net_monthly_income: z.number().positive(),
    // FIRE parameters (optional, with sensible defaults)
    expected_return: z.number().min(0.01).max(0.20).optional(),
    inflation_rate: z.number().min(0).max(0.10).optional(),
    retirement_expense_method: z.enum(['essential_budgets', 'custom_amount', 'current_income']).optional(),
    retirement_custom_amount: z.number().min(0).optional(),
    fire_end_strategy: z.enum(['perpetual', 'legacy', 'deplete']).optional(),
  }),
  budgetAmounts: z.record(z.string(), z.number().min(0)),
  bankAccounts: z.array(z.object({
    name: z.string().min(1),
    bank_name: z.string().min(1),
    account_type: z.string(),
    balance: z.number(),
  })).optional(),
  assets: z.array(z.object({
    name: z.string().min(1),
    asset_type: z.string(),
    current_value: z.number().min(0),
    purchase_value: z.number().min(0).optional(),
    expected_return: z.number().optional(),
    monthly_contribution: z.number().min(0).optional(),
    institution: z.string().optional(),
    // Type-specific
    subtype: z.string().optional(),
    risk_profile: z.string().optional(),
    tax_benefit: z.boolean().optional(),
    is_liquid: z.boolean().optional(),
    lock_end_date: z.string().optional(),
    ticker_symbol: z.string().optional(),
    rental_income: z.number().optional(),
    woz_value: z.number().optional(),
    retirement_provider_type: z.string().optional(),
    depreciation_rate: z.number().optional(),
    address_postcode: z.string().optional(),
    address_house_number: z.string().optional(),
  })).optional(),
  debts: z.array(z.object({
    name: z.string().min(1),
    debt_type: z.string(),
    original_amount: z.number().min(0).optional(),
    current_balance: z.number().min(0),
    interest_rate: z.number().min(0),
    minimum_payment: z.number().min(0).optional(),
    monthly_payment: z.number().min(0),
    creditor: z.string().optional(),
    // Type-specific
    subtype: z.string().optional(),
    repayment_type: z.string().optional(),
    is_tax_deductible: z.boolean().optional(),
    fixed_rate_end_date: z.string().optional(),
    nhg: z.boolean().optional(),
    credit_limit: z.number().optional(),
    draagkrachtmeting_date: z.string().optional(),
  })).optional(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse and validate
  const raw = await req.json()
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return Response.json({ error: 'Ongeldige invoer', details: parsed.error.flatten() }, { status: 400 })
  }

  const { identity, budgetAmounts, bankAccounts, assets, debts } = parsed.data

  try {
    // Idempotency check: if onboarding is already completed, skip all inserts
    // This prevents duplicate data from rapid double-clicks or retries
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    if (existingProfile?.onboarding_completed) {
      return Response.json({ success: true, alreadyCompleted: true })
    }

    // 1. Update profile
    const profileData: Record<string, unknown> = {
      id: user.id,
      full_name: identity.full_name,
      date_of_birth: identity.date_of_birth,
      household_type: identity.household_type,
      number_of_children: identity.number_of_children,
      net_monthly_income: identity.net_monthly_income,
      onboarding_completed: true,
      is_demo_user: false,
      updated_at: new Date().toISOString(),
    }
    // Add FIRE parameters if provided
    if (identity.expected_return != null) profileData.expected_return = identity.expected_return
    if (identity.inflation_rate != null) profileData.inflation_rate = identity.inflation_rate
    if (identity.retirement_expense_method) profileData.retirement_expense_method = identity.retirement_expense_method
    if (identity.retirement_custom_amount != null) profileData.retirement_custom_amount = identity.retirement_custom_amount
    if (identity.fire_end_strategy) profileData.fire_end_strategy = identity.fire_end_strategy

    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(profileData)
    if (profileErr) throw new Error(`Profiel opslaan mislukt: ${profileErr.message}`)

    // 2. Create budget hierarchy with user amounts
    const defaults = getDefaultBudgets()
    for (const parent of defaults) {
      // Calculate parent limit from children
      const childAmounts = (parent.children ?? []).map(
        (c) => budgetAmounts[c.slug] ?? c.default_limit,
      )
      const parentLimit = childAmounts.reduce((a, b) => a + b, 0)

      const { data: parentData, error: parentErr } = await supabase
        .from('budgets')
        .insert({
          user_id: user.id,
          parent_id: null,
          name: parent.name,
          slug: parent.slug,
          icon: parent.icon,
          description: parent.description,
          default_limit: parentLimit,
          budget_type: parent.budget_type,
          interval: 'monthly',
          rollover_type: 'reset',
          limit_type: 'soft',
          alert_threshold: 80,
          max_single_transaction_amount: parentLimit,
          is_essential: parent.is_essential,
          priority_score: parent.priority_score,
          is_inflation_indexed: false,
          sort_order: parent.sort_order,
        })
        .select('id')
        .single()
      if (parentErr) throw new Error(`Budget "${parent.name}" insert mislukt: ${parentErr.message}`)

      if (parent.children) {
        for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i]
          const amount = budgetAmounts[child.slug] ?? child.default_limit
          const { error: childErr } = await supabase
            .from('budgets')
            .insert({
              user_id: user.id,
              parent_id: parentData.id,
              name: child.name,
              slug: child.slug,
              icon: child.icon,
              description: child.description,
              default_limit: amount,
              budget_type: parent.budget_type,
              interval: 'monthly',
              rollover_type: 'reset',
              limit_type: 'soft',
              alert_threshold: 80,
              max_single_transaction_amount: amount * 2,
              is_essential: parent.is_essential,
              priority_score: parent.priority_score,
              is_inflation_indexed: false,
              sort_order: i,
            })
          if (childErr) throw new Error(`Budget "${child.name}" insert mislukt: ${childErr.message}`)
        }
      }
    }

    // 3. Insert optional bank accounts
    if (bankAccounts && bankAccounts.length > 0) {
      const rows = bankAccounts.map((a, i) => ({
        user_id: user.id,
        name: a.name,
        bank_name: a.bank_name,
        account_type: a.account_type,
        balance: a.balance,
        iban: '',
        is_active: true,
        sort_order: i,
      }))
      const { error: bankErr } = await supabase.from('bank_accounts').insert(rows)
      if (bankErr) throw new Error(`Bankrekeningen opslaan mislukt: ${bankErr.message}`)
    }

    // 4. Insert optional assets (with type-specific fields)
    if (assets && assets.length > 0) {
      const rows = assets.map((a, i) => ({
        user_id: user.id,
        name: a.name,
        asset_type: a.asset_type,
        current_value: a.current_value,
        purchase_value: a.purchase_value ?? a.current_value,
        purchase_date: new Date().toISOString().split('T')[0],
        expected_return: a.expected_return ?? 0,
        monthly_contribution: a.monthly_contribution ?? 0,
        institution: a.institution || null,
        is_active: true,
        sort_order: i,
        // Type-specific
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
      const { error: assetErr } = await supabase.from('assets').insert(rows)
      if (assetErr) throw new Error(`Bezittingen opslaan mislukt: ${assetErr.message}`)
    }

    // 5. Insert optional debts (with type-specific fields)
    if (debts && debts.length > 0) {
      const rows = debts.map((d, i) => ({
        user_id: user.id,
        name: d.name,
        debt_type: d.debt_type,
        original_amount: d.original_amount ?? d.current_balance,
        current_balance: d.current_balance,
        interest_rate: d.interest_rate,
        minimum_payment: d.minimum_payment ?? d.monthly_payment,
        monthly_payment: d.monthly_payment,
        start_date: new Date().toISOString().split('T')[0],
        creditor: d.creditor || null,
        is_active: true,
        sort_order: i,
        // Type-specific
        subtype: d.subtype || null,
        repayment_type: d.repayment_type || null,
        is_tax_deductible: d.is_tax_deductible ?? null,
        fixed_rate_end_date: d.fixed_rate_end_date || null,
        nhg: d.nhg ?? null,
        credit_limit: d.credit_limit ?? null,
        draagkrachtmeting_date: d.draagkrachtmeting_date || null,
      }))
      const { error: debtErr } = await supabase.from('debts').insert(rows)
      if (debtErr) throw new Error(`Schulden opslaan mislukt: ${debtErr.message}`)
    }

    // 6. Seed default AOW life event
    await supabase.from('life_events').insert({
      user_id: user.id,
      name: 'AOW',
      event_type: 'aow',
      target_age: NL_AOW_AGE,
      monthly_income_change: NL_AOW_MONTHLY,
      monthly_cost_change: 0,
      one_time_cost: 0,
      duration_months: 0,
      is_indexed: true,
      is_active: true,
      icon: 'Landmark',
      sort_order: 0,
    })

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('save-own-data error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
