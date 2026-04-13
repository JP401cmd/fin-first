import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDefaultBudgets } from '@/lib/budget-data'
import { NL_AOW_AGE, NL_AOW_MONTHLY } from '@/lib/horizon-data'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { type ModuleId } from '@/lib/module-registry'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'

/** Retry a function up to maxRetries times with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  }
  throw lastError
}

/**
 * Build the RPC payload for the atomic save_onboarding_data function.
 * Structures all onboarding data into the format expected by the plpgsql function.
 */
function buildRpcPayload(
  identity: z.infer<typeof bodySchema>['identity'],
  budgetAmounts: Record<string, number>,
  budgetteringMode: string | undefined,
  bankAccounts: z.infer<typeof bodySchema>['bankAccounts'],
  assets: z.infer<typeof bodySchema>['assets'],
  debts: z.infer<typeof bodySchema>['debts'],
  widgetPrefs: z.infer<typeof bodySchema>['widgetPrefs'],
  aowTargetAge: number,
  idempotencyKey: string | undefined,
  horizonData: z.infer<typeof bodySchema>['horizonData'],
  newsDescription: z.infer<typeof bodySchema>['newsDescription'],
  intent: z.infer<typeof bodySchema>['intent'],
) {
  const defaults = getDefaultBudgets()

  // Build parent budget rows
  const parentBudgets = defaults.map((parent) => {
    const childAmounts = (parent.children ?? []).map(
      (c) => budgetAmounts[c.slug] ?? c.default_limit,
    )
    const parentLimit = childAmounts.reduce((a, b) => a + b, 0)
    return {
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
      sort_order: parent.sort_order,
    }
  })

  // Build child budget rows with parent_slug reference
  const childBudgets: Record<string, unknown>[] = []
  for (const parent of defaults) {
    if (!parent.children) continue
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]
      const amount = budgetAmounts[child.slug] ?? child.default_limit
      childBudgets.push({
        parent_slug: parent.slug,
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
        sort_order: i,
      })
    }
  }

  return {
    idempotency_key: idempotencyKey ?? null,
    profile: {
      full_name: identity.full_name,
      date_of_birth: identity.date_of_birth,
      household_type: identity.household_type,
      number_of_children: identity.number_of_children,
      net_monthly_income: identity.net_monthly_income,
      estimated_monthly_expenses: identity.estimated_monthly_expenses ?? null,
      // FIRE params — from horizonData if provided, else from identity (backwards compat), else defaults
      expected_return: identity.expected_return ?? null,
      inflation_rate: identity.inflation_rate ?? null,
      retirement_expense_method: horizonData?.retirement_expense_method ?? identity.retirement_expense_method ?? 'current_income',
      retirement_expense_custom_amount: horizonData?.retirement_custom_amount ?? identity.retirement_custom_amount ?? null,
      fire_end_strategy: horizonData?.fire_end_strategy ?? identity.fire_end_strategy ?? 'deplete',
      fire_legacy_amount: horizonData?.fire_legacy_amount ?? identity.fire_legacy_amount ?? null,
      fire_end_age: horizonData?.fire_end_age ?? identity.fire_end_age ?? 90,
      temporal_balance: horizonData?.temporal_balance ?? identity.temporal_balance ?? 3,
      news_description: newsDescription ?? null,
      onboarding_intent: intent ?? null,
    },
    budget_amounts: budgetAmounts,
    budgettering_mode: budgetteringMode ?? 'manual',
    parent_budgets: parentBudgets,
    child_budgets: childBudgets,
    bank_accounts: (bankAccounts ?? []).map((a, i) => ({ ...a, sort_order: i })),
    assets: (assets ?? []).map((a, i) => ({
      ...a,
      sort_order: i,
      purchase_value: a.purchase_value ?? a.current_value,
      expected_return: a.expected_return ?? 0,
      monthly_contribution: a.monthly_contribution ?? 0,
    })),
    debts: (debts ?? []).map((d, i) => ({
      ...d,
      sort_order: i,
      original_amount: d.original_amount ?? d.current_balance,
      minimum_payment: d.minimum_payment ?? d.monthly_payment,
    })),
    widget_prefs: widgetPrefs ?? null,
    aow_target_age: aowTargetAge,
    aow_monthly: NL_AOW_MONTHLY,
  }
}

const bodySchema = z.object({
  identity: z.object({
    full_name: z.string().min(1),
    date_of_birth: z.string().min(1),
    household_type: z.enum(['solo', 'samen', 'gezin']),
    number_of_children: z.number().int().min(0).default(0),
    net_monthly_income: z.number().positive(),
    estimated_monthly_expenses: z.number().positive().optional(),
    // FIRE parameters (optional, with sensible defaults)
    expected_return: z.number().min(0.01).max(0.20).optional(),
    inflation_rate: z.number().min(0).max(0.10).optional(),
    retirement_expense_method: z.enum(['essential_budgets', 'custom_amount', 'current_income']).optional(),
    retirement_custom_amount: z.number().min(0).optional(),
    fire_end_strategy: z.enum(['perpetual', 'legacy', 'deplete']).optional(),
    fire_legacy_amount: z.number().positive().optional(),
    fire_end_age: z.number().int().min(60).max(120).optional(),
    temporal_balance: z.number().int().min(1).max(5).optional(),
  }),
  budgetAmounts: z.record(z.string(), z.number().min(0)),
  bankAccounts: z.array(z.object({
    name: z.string().min(1),
    bank_name: z.string().min(1),
    account_type: z.string(),
    balance: z.number(),
    has_budget_tracking: z.boolean().optional(),
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
  widgetPrefs: z.object({
    widgets: z.array(z.object({
      id: z.string(),
      enabled: z.boolean(),
      size: z.enum(['quarter', 'half', 'full']),
      order: z.number(),
    })),
  }).optional(),
  budgetteringMode: z.enum(['none', 'template', 'manual']).optional(),
  idempotencyKey: z.string().uuid().optional(),
  /** User-selected modules from the persona/custom step */
  activeModules: z.array(z.enum([
    'budgetteren',
    'vermogensregistratie',
    'aandelenregistratie',
    'inzicht_acties',
    'toekomstplannen',
    'nieuws',
  ])).optional(),
  horizonData: z.object({
    fire_end_strategy: z.enum(['perpetual', 'legacy', 'deplete']).optional(),
    fire_end_age: z.number().int().min(60).max(120).optional(),
    fire_legacy_amount: z.number().positive().optional(),
    retirement_expense_method: z.enum(['essential_budgets', 'custom_amount', 'current_income']).optional(),
    retirement_custom_amount: z.number().min(0).optional(),
    temporal_balance: z.number().int().min(1).max(5).optional(),
    life_events: z.array(z.object({
      name: z.string(),
      event_type: z.string(),
      target_age: z.number().int().min(18).max(120),
      monthly_income_change: z.number().optional(),
      monthly_cost_change: z.number().optional(),
      one_time_cost: z.number().optional(),
      duration_months: z.number().int().optional(),
      is_active: z.boolean(),
    })).optional(),
  }).optional(),
  newsDescription: z.string().max(500).optional(),
  /** User-selected intent from the onboarding intent step */
  intent: z.enum(['coaching', 'grip_uitgaven', 'overzicht_geld', 'toekomst', 'alles', 'nieuws']).optional(),
  /** Pre-extracted data from client-side review (avoids re-running AI extraction) */
  extractionData: z.object({
    assets: z.array(z.object({
      name: z.string(),
      asset_type: z.string(),
      estimated_value: z.number(),
    })).optional(),
    debts: z.array(z.object({
      name: z.string(),
      debt_type: z.string(),
      estimated_balance: z.number(),
    })).optional(),
    life_events: z.array(z.object({
      name: z.string(),
      event_type: z.string(),
      target_age: z.number().nullable(),
      one_time_cost: z.number().optional(),
      monthly_cost_change: z.number().optional(),
      monthly_income_change: z.number().optional(),
      duration_months: z.number().optional(),
      icon: z.string().optional(),
    })).optional(),
    monthly_income_estimate: z.number().nullable().optional(),
    monthly_expenses_estimate: z.number().nullable().optional(),
    financial_context_remainder: z.string().optional(),
  }).optional(),
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

  const { identity, horizonData, budgetAmounts, bankAccounts, assets, debts, widgetPrefs, budgetteringMode, idempotencyKey, activeModules, newsDescription, extractionData, intent } = parsed.data

  try {
    // Idempotency check: if onboarding is already completed, skip all inserts
    // This prevents duplicate data from rapid double-clicks or retries
    // First try with idempotency key column; fall back to without if column doesn't exist yet
    let existingProfile: { onboarding_completed: boolean; onboarding_idempotency_key?: string } | null = null
    const { data: profileWithKey, error: profileError } = await supabase
      .from('profiles')
      .select('onboarding_completed, onboarding_idempotency_key')
      .eq('id', user.id)
      .single()

    if (profileError && profileError.message?.includes('onboarding_idempotency_key')) {
      // Column doesn't exist yet — query without it
      const { data: profileWithoutKey } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()
      existingProfile = profileWithoutKey ? { ...profileWithoutKey, onboarding_idempotency_key: undefined } : null
    } else {
      existingProfile = profileWithKey
    }

    if (existingProfile?.onboarding_completed) {
      // Onboarding already completed — skip data creation but still update modules
      // so re-running onboarding picks up the new module selection
      if (activeModules && activeModules.length > 0) {
        await supabase
          .from('profiles')
          .update({
            active_modules: activeModules,
            budgeting_active: (activeModules as ModuleId[]).includes('budgetteren'),
            onboarding_intent: intent ?? null,
          })
          .eq('id', user.id)
      }
      return Response.json({ success: true, alreadyCompleted: true })
    }

    // Check idempotency key: if same key was already processed, return success
    if (idempotencyKey && existingProfile?.onboarding_idempotency_key === idempotencyKey) {
      return Response.json({ success: true, alreadyCompleted: true })
    }

    // Resolve AOW age for the user's date of birth
    let aowTargetAge = NL_AOW_AGE
    try {
      const { data: aowRows } = await supabase
        .from('aow_leeftijd')
        .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
        .order('birth_date_from', { ascending: true })
      if (aowRows && aowRows.length > 0) {
        const aow = lookupAowAge(aowRows as AowLeeftijdRow[], identity.date_of_birth)
        aowTargetAge = Math.ceil(aow.fractional)
      }
    } catch {
      // Fallback to NL_AOW_AGE
    }

    // ── News-only: extract structured data from free text ──────────────
    // When a user selects ONLY the 'nieuws' module, they provide a free-text
    // description instead of filling in asset/debt/budget forms. We use AI
    // to extract structured financial data from that description.
    const isNewsOnly = activeModules?.length === 1 && activeModules[0] === 'nieuws'
    let extractedAssets: Array<{ name: string; asset_type: string; current_value: number; expected_return: number; monthly_contribution: number; is_liquid: boolean; subtype: string | null; source: string }> = []
    let extractedDebts: Array<{ name: string; debt_type: string; current_balance: number; interest_rate: number; monthly_payment: number; is_tax_deductible: boolean | null; subtype: string | null; source: string }> = []
    let extractedLifeEvents: Array<{ name: string; event_type: string; target_age: number | null; description?: string; one_time_cost: number; monthly_cost_change: number; monthly_income_change: number; duration_months: number; icon: string }> = []
    let financialContext: string | null = null
    let aiIncomeEstimate: number | null = null
    let aiExpensesEstimate: number | null = null

    if (isNewsOnly && (extractionData || newsDescription)) {
      if (extractionData) {
        // Client already ran extraction and user reviewed/edited the results — use directly
        extractedAssets = (extractionData.assets ?? []).map((a) => ({
          name: a.name,
          asset_type: a.asset_type,
          current_value: a.estimated_value,
          expected_return: 0,
          monthly_contribution: 0,
          is_liquid: true,
          subtype: null,
          source: 'ai_extracted' as const,
        }))

        extractedDebts = (extractionData.debts ?? []).map((d) => ({
          name: d.name,
          debt_type: d.debt_type,
          current_balance: d.estimated_balance,
          interest_rate: 0,
          monthly_payment: 0,
          is_tax_deductible: null,
          subtype: null,
          source: 'ai_extracted' as const,
        }))

        extractedLifeEvents = (extractionData.life_events ?? []).map((e) => ({
          name: e.name,
          event_type: e.event_type,
          target_age: e.target_age,
          one_time_cost: e.one_time_cost ?? 0,
          monthly_cost_change: e.monthly_cost_change ?? 0,
          monthly_income_change: e.monthly_income_change ?? 0,
          duration_months: e.duration_months ?? 0,
          icon: e.icon ?? 'Calendar',
        }))

        financialContext = extractionData.financial_context_remainder || null
        aiIncomeEstimate = extractionData.monthly_income_estimate ?? null
        aiExpensesEstimate = extractionData.monthly_expenses_estimate ?? null
      } else if (newsDescription) {
        // Fallback: run extraction server-side (backwards compatibility)
        const dob = new Date(identity.date_of_birth)
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))

        const extraction = await extractFinancialData(supabase, newsDescription, {
          age,
          householdType: identity.household_type,
          monthlyIncome: identity.net_monthly_income,
          monthlyExpenses: identity.estimated_monthly_expenses,
        })

        extractedAssets = extraction.assets.map((a) => ({
          name: a.name,
          asset_type: a.asset_type,
          current_value: a.estimated_value,
          expected_return: a.expected_return,
          monthly_contribution: a.monthly_contribution,
          is_liquid: a.is_liquid,
          subtype: a.subtype,
          source: 'ai_extracted' as const,
        }))

        extractedDebts = extraction.debts.map((d) => ({
          name: d.name,
          debt_type: d.debt_type,
          current_balance: d.estimated_balance,
          interest_rate: d.interest_rate,
          monthly_payment: d.monthly_payment,
          is_tax_deductible: d.is_tax_deductible,
          subtype: d.subtype,
          source: 'ai_extracted' as const,
        }))

        extractedLifeEvents = extraction.life_events

        financialContext = extraction.financial_context_remainder || null
        aiIncomeEstimate = extraction.monthly_income_estimate ?? null
        aiExpensesEstimate = extraction.monthly_expenses_estimate ?? null
      }
    }

    // Derive completed onboarding steps from active modules
    const completedSteps: string[] = ['identity', 'modules']
    if (isNewsOnly) {
      completedSteps.push('nieuws_only')
    } else {
      if (activeModules?.some((m) => m === 'budgetteren' || m === 'vermogensregistratie')) completedSteps.push('bezittingen')
      if (activeModules?.includes('budgetteren')) completedSteps.push('budgets')
      if (activeModules?.includes('toekomstplannen')) completedSteps.push('horizon')
    }

    // ── Strategy: Try atomic RPC first, fall back to multi-step approach ──
    // The RPC wraps everything in a single PostgreSQL transaction — if ANY
    // step fails, the entire save is rolled back. No partial data possible.
    const rpcPayload = buildRpcPayload(
      identity, budgetAmounts, budgetteringMode,
      bankAccounts, assets, debts, widgetPrefs,
      aowTargetAge, idempotencyKey,
      horizonData, newsDescription, intent,
    )

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('save_onboarding_data', { payload: rpcPayload })

    if (!rpcError && rpcResult) {
      // RPC succeeded — check for application-level errors in the response
      const result = typeof rpcResult === 'string' ? JSON.parse(rpcResult) : rpcResult
      if (result.error) {
        throw new Error(result.error)
      }
      // Set initial phase and persist active modules
      if (!result.already_completed) {
        const profileUpdates: Record<string, unknown> = {
          last_known_phase: 'recovery',
          completed_onboarding_steps: completedSteps,
          onboarding_intent: intent ?? null,
        }
        // Persist selected modules when provided by the persona step
        if (activeModules && activeModules.length > 0) {
          profileUpdates.active_modules = activeModules
          // Keep budgeting_active in sync — it's a derived boolean convenience column
          profileUpdates.budgeting_active = (activeModules as ModuleId[]).includes('budgetteren')
        }
        // News-only: store financial context and AI-estimated income/expenses
        if (isNewsOnly) {
          if (financialContext) profileUpdates.financial_context = financialContext
          if (aiIncomeEstimate != null) profileUpdates.net_monthly_income = aiIncomeEstimate
          if (aiExpensesEstimate != null) profileUpdates.estimated_monthly_expenses = aiExpensesEstimate
        }
        await supabase
          .from('profiles')
          .update(profileUpdates)
          .eq('id', user.id)

        // News-only: insert AI-extracted assets, debts, and life events
        // These are persisted outside the RPC transaction since the RPC
        // function does not know about the extraction results.
        if (isNewsOnly) {
          if (extractedAssets.length > 0) {
            const rows = extractedAssets.map((a, i) => ({
              user_id: user.id,
              name: a.name,
              asset_type: a.asset_type,
              current_value: a.current_value,
              purchase_value: a.current_value,
              expected_return: a.expected_return / 100, // Convert % to decimal
              monthly_contribution: a.monthly_contribution,
              is_active: true,
              is_liquid: a.is_liquid,
              subtype: a.subtype,
              sort_order: i,
              source: 'ai_extracted',
            }))
            const { error } = await supabase.from('assets').insert(rows)
            if (error) console.error('AI-extracted assets insert error:', error)
          }

          if (extractedDebts.length > 0) {
            const rows = extractedDebts.map((d, i) => ({
              user_id: user.id,
              name: d.name,
              debt_type: d.debt_type,
              original_amount: d.current_balance,
              current_balance: d.current_balance,
              interest_rate: d.interest_rate / 100, // Convert % to decimal
              monthly_payment: d.monthly_payment,
              minimum_payment: d.monthly_payment,
              start_date: new Date().toISOString().split('T')[0],
              is_active: true,
              is_tax_deductible: d.is_tax_deductible,
              subtype: d.subtype,
              sort_order: i,
              source: 'ai_extracted',
            }))
            const { error } = await supabase.from('debts').insert(rows)
            if (error) console.error('AI-extracted debts insert error:', error)
          }

          if (extractedLifeEvents.length > 0) {
            const rows = extractedLifeEvents.map((e, i) => ({
              user_id: user.id,
              name: e.name,
              event_type: e.event_type,
              target_age: e.target_age,
              monthly_income_change: e.monthly_income_change,
              monthly_cost_change: e.monthly_cost_change,
              one_time_cost: e.one_time_cost,
              duration_months: e.duration_months,
              is_active: true,
              sort_order: i + 1, // 0 is reserved for AOW
              icon: e.icon || 'Calendar',
            }))
            const { error } = await supabase.from('life_events').insert(rows)
            if (error) console.error('AI-extracted life events insert error:', error)
          }
        }
      }
      return Response.json({ success: true, alreadyCompleted: result.already_completed ?? false })
    }

    // RPC not available (function doesn't exist yet) — fall back to multi-step approach
    // This happens when the migration hasn't been applied yet
    if (rpcError) {
      console.warn('save_onboarding_data RPC not available, falling back to multi-step:', rpcError.message)
    }

    // ── Fallback: Multi-step approach (non-atomic) ──────────────────────

    // 1. Update profile (onboarding_completed is set to false first; will be set to true at the end
    // after all data is saved successfully — this ensures retries work correctly)
    // Derive budgeting_active: prefer module-based check when activeModules is present,
    // otherwise fall back to the legacy budgetteringMode flag
    const budgetingActive = activeModules
      ? (activeModules as ModuleId[]).includes('budgetteren')
      : budgetteringMode !== 'none'

    const profileData: Record<string, unknown> = {
      id: user.id,
      full_name: identity.full_name,
      date_of_birth: identity.date_of_birth,
      household_type: identity.household_type,
      number_of_children: identity.number_of_children,
      net_monthly_income: identity.net_monthly_income,
      onboarding_completed: false,
      is_demo_user: false,
      budgeting_active: budgetingActive,
      updated_at: new Date().toISOString(),
    }
    // Persist the selected module set when provided
    if (activeModules && activeModules.length > 0) {
      profileData.active_modules = activeModules
    }
    // Only include idempotency key if the column exists (migration may not be applied yet)
    if (!profileError || !profileError.message?.includes('onboarding_idempotency_key')) {
      profileData.onboarding_idempotency_key = idempotencyKey ?? null
    }
    // Add estimated monthly expenses if provided
    if (identity.estimated_monthly_expenses != null) profileData.estimated_monthly_expenses = identity.estimated_monthly_expenses
    // Add FIRE parameters — horizonData takes priority, then identity (backwards compat)
    if (identity.expected_return != null) profileData.expected_return = identity.expected_return
    if (identity.inflation_rate != null) profileData.inflation_rate = identity.inflation_rate
    profileData.retirement_expense_method = horizonData?.retirement_expense_method ?? identity.retirement_expense_method ?? 'current_income'
    profileData.retirement_expense_custom_amount = horizonData?.retirement_custom_amount ?? identity.retirement_custom_amount ?? null
    profileData.fire_end_strategy = horizonData?.fire_end_strategy ?? identity.fire_end_strategy ?? 'deplete'
    profileData.fire_legacy_amount = horizonData?.fire_legacy_amount ?? identity.fire_legacy_amount ?? null
    profileData.fire_end_age = horizonData?.fire_end_age ?? identity.fire_end_age ?? 90
    profileData.temporal_balance = horizonData?.temporal_balance ?? identity.temporal_balance ?? 3
    profileData.news_description = newsDescription ?? null
    profileData.onboarding_intent = intent ?? null
    profileData.completed_onboarding_steps = completedSteps
    if (widgetPrefs) profileData.widget_prefs = widgetPrefs
    // News-only: store financial context and AI-estimated income/expenses
    if (isNewsOnly) {
      if (financialContext) profileData.financial_context = financialContext
      if (aiIncomeEstimate != null) profileData.net_monthly_income = aiIncomeEstimate
      if (aiExpensesEstimate != null) profileData.estimated_monthly_expenses = aiExpensesEstimate
    }

    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(profileData)
    if (profileErr) throw new Error(`Profiel opslaan mislukt: ${profileErr.message}`)

    // 2. Create budget hierarchy with user amounts — BATCHED for performance
    // Uses upsert with ON CONFLICT on (user_id, slug) so retries and
    // double-submits are handled gracefully without deleting existing data.
    // The idx_budgets_user_slug_parent unique index (migration 20260319000001)
    // ensures proper deduplication while allowing same slug under different parents.
    // Delete existing budgets first as a safety net for the transition period
    // (before the new composite index replaces the old simple index).
    //
    // Batched: all parents in 1 insert, all children in 1 insert (2-3 DB calls instead of 34)

    // Wrapped in retry logic (max 2 retries with exponential backoff)
    // Delete-first + insert makes this safely idempotent on retry
    await withRetry(async () => {
      await supabase.from('budgets').delete().eq('user_id', user.id)

      const defaults = getDefaultBudgets()

      // Step 2a: Build all parent rows in one array
      const parentRows = defaults.map((parent) => {
        const childAmounts = (parent.children ?? []).map(
          (c) => budgetAmounts[c.slug] ?? c.default_limit,
        )
        const parentLimit = childAmounts.reduce((a, b) => a + b, 0)
        return {
          user_id: user.id,
          parent_id: null as string | null,
          name: parent.name,
          slug: parent.slug,
          icon: parent.icon,
          description: parent.description,
          default_limit: parentLimit,
          budget_type: parent.budget_type,
          interval: 'monthly' as const,
          rollover_type: 'reset' as const,
          limit_type: 'soft' as const,
          alert_threshold: 80,
          max_single_transaction_amount: parentLimit,
          is_essential: parent.is_essential,
          priority_score: parent.priority_score,
          is_inflation_indexed: false,
          sort_order: parent.sort_order,
        }
      })

      // Step 2b: Bulk insert all parents in one call and get their IDs
      const { data: insertedParents, error: parentBulkErr } = await supabase
        .from('budgets')
        .insert(parentRows)
        .select('id, slug')
      if (parentBulkErr) throw new Error(`Budget parents bulk insert mislukt: ${parentBulkErr.message}`)

      // Step 2c: Map parent slugs to their generated IDs for child assignment
      const parentSlugToId = new Map<string, string>()
      for (const p of insertedParents ?? []) {
        parentSlugToId.set(p.slug, p.id)
      }

      // Step 2d: Build all child rows in one array with correct parent_id references
      const childRows: typeof parentRows = []
      for (const parent of defaults) {
        if (!parent.children) continue
        const parentId = parentSlugToId.get(parent.slug)
        if (!parentId) continue

        for (let i = 0; i < parent.children.length; i++) {
          const child = parent.children[i]
          const amount = budgetAmounts[child.slug] ?? child.default_limit
          childRows.push({
            user_id: user.id,
            parent_id: parentId,
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
        }
      }

      // Step 2e: Bulk insert all children in one call
      if (childRows.length > 0) {
        const { error: childBulkErr } = await supabase
          .from('budgets')
          .insert(childRows)
        if (childBulkErr) throw new Error(`Budget children bulk insert mislukt: ${childBulkErr.message}`)
      }
    })

    // 3. Insert optional bank accounts + companion cash assets
    // Delete existing onboarding-created bank accounts (without IBAN) to avoid wiping bank-connected ones
    await supabase.from('bank_accounts').delete().eq('user_id', user.id).eq('iban', '')
    // Also delete existing onboarding-created cash assets (companion assets from previous attempt)
    await supabase.from('assets').delete().eq('user_id', user.id).eq('asset_type', 'cash')

    let companionCashAssetIds: string[] = []
    if (bankAccounts && bankAccounts.length > 0) {
      // 3a. Create companion cash assets first (same pattern as seed-persona.ts)
      const cashAssetRows = bankAccounts.map((a, i) => ({
        user_id: user.id,
        name: a.name,
        asset_type: 'cash' as const,
        current_value: a.balance,
        purchase_value: a.balance,
        expected_return: 0,
        monthly_contribution: 0,
        institution: a.bank_name,
        is_active: true,
        sort_order: i,
        ownership: 'personal',
        net_worth_inclusion_pct: 100,
        is_liquid: true,
        subtype: a.account_type,
        has_budget_tracking: a.has_budget_tracking ?? (budgetteringMode !== 'none'),
      }))

      const { data: cashAssets, error: cashErr } = await supabase
        .from('assets')
        .insert(cashAssetRows)
        .select('id')
      if (cashErr) throw new Error(`Cash assets opslaan mislukt: ${cashErr.message}`)
      companionCashAssetIds = (cashAssets ?? []).map((a) => a.id)

      // 3b. Create bank accounts with linked_asset_id pointing to companion cash assets
      const rows = bankAccounts.map((a, i) => ({
        user_id: user.id,
        name: a.name,
        bank_name: a.bank_name,
        account_type: a.account_type,
        balance: a.balance,
        iban: '',
        is_active: true,
        sort_order: i,
        linked_asset_id: companionCashAssetIds[i] ?? null,
      }))
      const { error: bankErr } = await supabase.from('bank_accounts').insert(rows)
      if (bankErr) throw new Error(`Bankrekeningen opslaan mislukt: ${bankErr.message}`)
    }

    // 4. Insert optional assets (delete existing non-cash ones on retry to prevent duplicates)
    // Cash assets were already handled above for bank accounts
    if (assets && assets.length > 0) {
      await supabase.from('assets').delete().eq('user_id', user.id).neq('asset_type', 'cash')
      // Offset sort_order by number of companion cash assets to avoid conflicts
      const assetSortOffset = companionCashAssetIds.length
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
        sort_order: assetSortOffset + i,
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

    // 5. Insert optional debts (delete existing ones on retry to prevent duplicates)
    if (debts && debts.length > 0) {
      await supabase.from('debts').delete().eq('user_id', user.id)
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

    // 6. Seed default AOW life event (uses aowTargetAge resolved above)
    // Delete existing AOW event first to prevent duplicates on retry
    await supabase.from('life_events').delete().eq('user_id', user.id).eq('event_type', 'aow')

    await supabase.from('life_events').insert({
      user_id: user.id,
      name: 'AOW',
      event_type: 'aow',
      target_age: aowTargetAge,
      monthly_income_change: NL_AOW_MONTHLY,
      monthly_cost_change: 0,
      one_time_cost: 0,
      duration_months: 0,
      is_indexed: true,
      is_active: true,
      icon: 'Landmark',
      sort_order: 0,
      metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 },
    })

    // 6b. Insert user-created life events from horizon step (non-AOW)
    if (horizonData?.life_events && horizonData.life_events.length > 0) {
      const userEvents = horizonData.life_events
        .filter((e) => e.event_type !== 'aow') // AOW already handled above
        .map((e, i) => ({
          user_id: user.id,
          name: e.name,
          event_type: e.event_type,
          target_age: e.target_age,
          monthly_income_change: e.monthly_income_change ?? 0,
          monthly_cost_change: e.monthly_cost_change ?? 0,
          one_time_cost: e.one_time_cost ?? 0,
          duration_months: e.duration_months ?? 0,
          is_active: e.is_active,
          sort_order: i + 1,
          icon: 'Calendar',
        }))

      if (userEvents.length > 0) {
        const { error: eventsError } = await supabase
          .from('life_events')
          .insert(userEvents)
        if (eventsError) console.error('Life events insert error:', eventsError)
      }
    }

    // 6c. News-only: insert AI-extracted assets, debts, and life events
    // These come from the AI extraction above and have source: 'ai_extracted'
    if (isNewsOnly && extractedAssets.length > 0) {
      const rows = extractedAssets.map((a, i) => ({
        user_id: user.id,
        name: a.name,
        asset_type: a.asset_type,
        current_value: a.current_value,
        purchase_value: a.current_value,
        expected_return: a.expected_return / 100, // Convert % to decimal
        monthly_contribution: a.monthly_contribution,
        is_active: true,
        is_liquid: a.is_liquid,
        subtype: a.subtype,
        sort_order: i,
        source: 'ai_extracted',
      }))
      const { error } = await supabase.from('assets').insert(rows)
      if (error) console.error('AI-extracted assets insert error:', error)
    }

    if (isNewsOnly && extractedDebts.length > 0) {
      const rows = extractedDebts.map((d, i) => ({
        user_id: user.id,
        name: d.name,
        debt_type: d.debt_type,
        original_amount: d.current_balance,
        current_balance: d.current_balance,
        interest_rate: d.interest_rate / 100, // Convert % to decimal
        monthly_payment: d.monthly_payment,
        minimum_payment: d.monthly_payment,
        start_date: new Date().toISOString().split('T')[0],
        is_active: true,
        is_tax_deductible: d.is_tax_deductible,
        subtype: d.subtype,
        sort_order: i,
        source: 'ai_extracted',
      }))
      const { error } = await supabase.from('debts').insert(rows)
      if (error) console.error('AI-extracted debts insert error:', error)
    }

    if (isNewsOnly && extractedLifeEvents.length > 0) {
      const rows = extractedLifeEvents.map((e, i) => ({
        user_id: user.id,
        name: e.name,
        event_type: e.event_type,
        target_age: e.target_age,
        monthly_income_change: e.monthly_income_change,
        monthly_cost_change: e.monthly_cost_change,
        one_time_cost: e.one_time_cost,
        duration_months: e.duration_months,
        is_active: true,
        sort_order: i + 1, // 0 is reserved for AOW
        icon: e.icon || 'Calendar',
      }))
      const { error } = await supabase.from('life_events').insert(rows)
      if (error) console.error('AI-extracted life events insert error:', error)
    }

    // 7. Mark onboarding as completed LAST — only after all data is saved successfully
    // This ensures the idempotency guard doesn't block retries after partial failures
    const { error: completeErr } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)
    if (completeErr) throw new Error(`Onboarding afronden mislukt: ${completeErr.message}`)

    // 8. Set initial phase so user is immediately fully active
    await supabase
      .from('profiles')
      .update({ last_known_phase: 'recovery' })
      .eq('id', user.id)

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('save-own-data error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
