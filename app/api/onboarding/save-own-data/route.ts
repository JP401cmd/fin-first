import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getDefaultBudgets } from '@/lib/budget-data'
import { NL_AOW_AGE, NL_AOW_MONTHLY } from '@/lib/horizon-data'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { type ModuleId, type IntentId } from '@/lib/module-registry'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'
import { AssetQuickInputSchema, DebtQuickInputSchema } from '@/lib/quick-add/validation'
import { buildAssetDraft, buildDebtDraft } from '@/lib/quick-add/build-drafts'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import type { GoalSlug } from '@/lib/goals/types'
import { GOAL_MODULE_PRESETS } from '@/lib/goals/catalog'

/**
 * Best-effort mapping van een nieuwe goal-slug naar de oude `IntentId` zodat
 * downstream features die nog `profiles.onboarding_intent` lezen niet stuk
 * gaan. Eenmaal alle leescode gemigreerd is naar `primary_goal_slug` kan
 * deze mapping verdwijnen.
 */
const GOAL_TO_INTENT_FALLBACK: Record<GoalSlug, IntentId> = {
  'grip-uitgaven': 'grip_uitgaven',
  'vermogen-overzicht': 'overzicht_geld',
  noodfonds: 'grip_uitgaven',
  'schulden-aflossen': 'overzicht_geld',
  'eerder-stoppen': 'toekomst',
  'bewust-leven': 'coaching',
}

/**
 * Module-vereisten — server-side fallback voor modules die een rekening
 * verwachten:
 *   · `budgetteren` heeft minstens één cash-asset met `has_budget_tracking=true`
 *     nodig (anders kunnen transacties niet aan budgetten gekoppeld worden).
 *   · `aandelenregistratie` heeft minstens één investment-asset met
 *     `has_holdings_tracking=true` nodig (anders is de Holdings-app leeg).
 *
 * Wanneer de gebruiker de bezittingen-stap heeft overgeslagen of de juiste
 * categorie niet heeft toegevoegd, seedt de server hier een placeholder met
 * saldo 0. De gebruiker kan dat later in /core/assets/{type} bewerken.
 *
 * Conform CLAUDE.md fallback-regel: een feature mag niet stilzwijgend breken
 * omdat een andere module geen data heeft.
 */
function applyModuleSeeding(
  quickAssets: AssetQuickInput[],
  activeModules: ModuleId[] | undefined,
): AssetQuickInput[] {
  if (!activeModules) return quickAssets
  const result = [...quickAssets]
  if (activeModules.includes('budgetteren') && !result.some((a) => a.asset_type === 'cash')) {
    result.push({ asset_type: 'cash', name: 'Lopende rekening', current_value: 0, field3: null })
  }
  if (
    activeModules.includes('aandelenregistratie') &&
    !result.some((a) => a.asset_type === 'investment')
  ) {
    result.push({ asset_type: 'investment', name: 'Beleggingsrekening', current_value: 0, field3: null })
  }
  return result
}

/**
 * Activeer module-tracking-flags op zojuist-ingevoegde assets.
 *
 * - `budgetteren` actief → alle cash-assets krijgen `has_budget_tracking = true`
 * - `aandelenregistratie` actief → alle investment-assets krijgen
 *   `has_holdings_tracking = true`
 *
 * Deze post-insert UPDATE laat de bestaande RPC-SQL onveranderd (die kent de
 * tracking-kolommen niet). De fallback-pad doet de equivalente write inline.
 */
async function applyModuleTrackingFlags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  activeModules: ModuleId[] | undefined,
) {
  if (!activeModules) return
  if (activeModules.includes('budgetteren')) {
    await supabase
      .from('assets')
      .update({ has_budget_tracking: true })
      .eq('user_id', userId)
      .eq('asset_type', 'cash')
  }
  if (activeModules.includes('aandelenregistratie')) {
    await supabase
      .from('assets')
      .update({ has_holdings_tracking: true })
      .eq('user_id', userId)
      .eq('asset_type', 'investment')
  }
}

/**
 * Insert het onboarding-spaardoel als één rij in de `goals`-tabel. Wordt
 * aangeroepen in zowel het RPC-pad als het multi-step-fallback-pad nadat
 * de profile-write klaar is — onze RLS-policy vereist dat `user_id` (de
 * profile-id) gelijk is aan `auth.uid()`.
 *
 * Non-blocking: bij een fout loggen we maar throwen niet. Onboarding mag
 * niet stilvallen op een goal-insert die mislukt, conform spec.
 */
async function insertOnboardingGoal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goal: NonNullable<z.infer<typeof bodySchema>['onboardingGoal']>,
) {
  const { error } = await supabase.from('goals').insert({
    user_id: userId,
    name: goal.name,
    description: null,
    goal_type: goal.goal_type,
    target_value: goal.target_value,
    current_value: 0,
    target_date: goal.target_date ?? null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: goal.icon,
    color: goal.color,
    custom_unit: null,
    ownership: 'personal',
    household_id: null,
  })
  if (error) {
    console.error('[onboarding-save] goal insert failed:', error.message)
  }
}

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
 *
 * widget_prefs is server-controlled: nieuwe gebruikers starten altijd met een
 * leeg dashboard ({ widgets: [] }). De gebruiker stelt later widgets in via
 * Instellingen — onboarding raakt het dashboard niet meer.
 */
function buildRpcPayload(
  identity: z.infer<typeof bodySchema>['identity'],
  budgetAmounts: Record<string, number>,
  budgetteringMode: string | undefined,
  quickAssets: AssetQuickInput[],
  quickDebts: DebtQuickInput[],
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
    // Geen bank_accounts meer in onboarding — cash-rekeningen worden als
    // `cash`-type asset toegevoegd via de QuickAddWizard. De RPC verwijdert
    // bestaande bank_accounts (regel `iban=''`) en cash-assets aan het begin
    // van die step; daarna worden cash-assets in stap 7 (assets) ingevoegd.
    bank_accounts: [],
    // QuickAddInput → volledige Asset-row via buildAssetDraft. Die helper
    // levert alle velden die de RPC verwacht (subtype/risk_profile/etc.
    // zijn null en de full form vult ze later aan).
    assets: quickAssets.map((q, i) => ({
      ...buildAssetDraft(q),
      sort_order: i,
    })),
    debts: quickDebts.map((q, i) => ({
      ...buildDebtDraft(q),
      sort_order: i,
    })),
    // Lege widgets-array → mergeWidgetPrefs() retourneert alle catalog-widgets
    // met enabled:false, dus dashboard is leeg na onboarding. De gebruiker
    // configureert dit zelf in Instellingen.
    widget_prefs: { widgets: [] },
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
  // budgetAmounts is optioneel sinds de onboarding-redesign (fase 3, mei 2026):
  // de nieuwe 5-stappen-flow heeft geen budgets-stap meer, dus we sturen
  // standaard een leeg object. Server vult ontbrekende slug-amounts aan met
  // de catalog-defaults via `budgetAmounts[slug] ?? default_limit`.
  budgetAmounts: z.record(z.string(), z.number().min(0)).optional().default({}),
  // Onboarding gebruikt het 3-velden-quickadd-shape voor bezittingen en
  // schulden. De server roept buildAssetDraft / buildDebtDraft aan om naar
  // volledige rijen te converteren — dezelfde logica als de Server Action
  // op /core. Bank_accounts vervalt: een bankrekening wordt toegevoegd als
  // `cash`-type quickAsset met optionele `field3` voor de bankinstelling.
  quickAssets: z.array(AssetQuickInputSchema).optional(),
  quickDebts: z.array(DebtQuickInputSchema).optional(),
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
  /** User-selected intent from the onboarding intent step (legacy field — kept for clients that haven't shipped goal yet) */
  intent: z.enum(['coaching', 'grip_uitgaven', 'overzicht_geld', 'toekomst', 'alles', 'nieuws']).optional(),
  /**
   * Legacy single-goal field — kept for backward-compat met clients die nog
   * niet de multi-select doel-stap hebben uitgerold. Sinds fase 3 (mei 2026)
   * stuurt de page.tsx zowel `selectedGoalSlug` (eerste-goal) als
   * `selectedGoalSlugs` (volledige array); oude builds zonder array blijven
   * werken.
   */
  selectedGoalSlug: z.enum([
    'grip-uitgaven',
    'vermogen-overzicht',
    'noodfonds',
    'schulden-aflossen',
    'eerder-stoppen',
    'bewust-leven',
  ]).optional(),
  /**
   * Multi-select goal-slugs uit de nieuwe doel-stap (fase 3, mei 2026). De
   * server gebruikt de eerste entry als primaire-goal voor
   * `profiles.primary_goal_slug` en de unie van alle entries' presets om
   * `activeModules` af te leiden wanneer de client die niet meestuurt.
   */
  selectedGoalSlugs: z.array(z.enum([
    'grip-uitgaven',
    'vermogen-overzicht',
    'noodfonds',
    'schulden-aflossen',
    'eerder-stoppen',
    'bewust-leven',
  ])).optional(),
  /**
   * Spaardoel-keuze van onboarding-stap v. Optioneel — gebruiker mag skippen.
   * Wanneer aanwezig wordt één rij in de `goals`-tabel geïnserteerd na de
   * profile-write (RLS-check faalt anders op de FK). Faalt deze insert om
   * welke reden dan ook, dan wordt de fout gelogd en gaat de save door —
   * onboarding mag niet stilvallen op een goal-insert error.
   *
   * Constraints spiegelen `goals`-tabel: `target_value > 0`, `name` niet
   * leeg. `goal_type` is voor alle presets 'savings'; de Shield-icoon +
   * naam dragen de semantiek "Noodfonds", niet de enum (zie
   * `lib/onboarding-presets.ts` voor de motivatie).
   */
  onboardingGoal: z.object({
    name: z.string().min(1).max(200),
    target_value: z.number().positive(),
    target_date: z.string().nullable().optional(),
    goal_type: z.enum([
      'savings', 'debt_payoff', 'net_worth', 'freedom_days',
      'savings_rate', 'invested_assets', 'passive_income',
      'emergency_fund', 'salary', 'custom',
    ]),
    icon: z.string().min(1).max(40),
    color: z.enum(['teal', 'amber', 'purple', 'emerald', 'red', 'blue']),
  }).optional(),
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

  const {
    identity,
    horizonData,
    budgetAmounts,
    quickAssets: rawQuickAssets,
    quickDebts: rawQuickDebts,
    budgetteringMode,
    idempotencyKey,
    activeModules: rawActiveModules,
    newsDescription,
    extractionData,
    intent: rawIntent,
    selectedGoalSlug: rawSelectedGoalSlug,
    selectedGoalSlugs: rawSelectedGoalSlugs,
    onboardingGoal,
  } = parsed.data

  // Normaliseer de goal-input: de fase-3 client stuurt zowel een array
  // (`selectedGoalSlugs`) als de eerste-entry (`selectedGoalSlug`); oudere
  // clients alleen de single. We bouwen daaruit één array en één primaire-
  // goal-veld zodat downstream-code geen if-cascades hoeft.
  const selectedGoalSlugs: GoalSlug[] =
    rawSelectedGoalSlugs && rawSelectedGoalSlugs.length > 0
      ? [...rawSelectedGoalSlugs]
      : rawSelectedGoalSlug
        ? [rawSelectedGoalSlug]
        : []
  // Primaire goal (eerste in array) — bron voor `profiles.primary_goal_slug`
  // en de intent-fallback. Bewust niet `primaryGoalSlug` om verwarring met
  // de DB-kolom-naam (`primary_goal_slug`) te voorkomen.
  const primaryGoalSlug: GoalSlug | undefined = selectedGoalSlugs[0]

  // Resolve modules: als de client geen activeModules stuurde maar wel
  // goal(s), leid de modules af van GOAL_MODULE_PRESETS via union-merge.
  // Zo blijft de rest van de save-route (die gestuurd wordt door
  // activeModules) werken, ook bij multi-goal clients.
  let resolvedModules: ModuleId[] | undefined = undefined
  if (rawActiveModules && rawActiveModules.length > 0) {
    resolvedModules = rawActiveModules
  } else if (selectedGoalSlugs.length > 0) {
    const seen = new Set<ModuleId>()
    const merged: ModuleId[] = []
    for (const slug of selectedGoalSlugs) {
      for (const m of GOAL_MODULE_PRESETS[slug]) {
        if (!seen.has(m)) {
          seen.add(m)
          merged.push(m)
        }
      }
    }
    resolvedModules = merged
  }
  const activeModules: ModuleId[] | undefined = resolvedModules

  // Effective intent voor backward-compat met `profiles.onboarding_intent`
  // en downstream features die nog op de oude IntentId leunen. Bij multi-goal
  // gebruiken we de primaire goal — exact één intent per profile.
  const intent: IntentId | undefined = rawIntent
    ?? (primaryGoalSlug ? GOAL_TO_INTENT_FALLBACK[primaryGoalSlug] : undefined)

  // Pas module-vereisten-seeding toe vóór persist: bv. een placeholder cash-
  // rekening als budgetteren actief is zonder cash-asset. Vermijdt module-
  // landing-pagina's met lege state. Zie applyModuleSeeding().
  const quickAssets: AssetQuickInput[] = applyModuleSeeding(rawQuickAssets ?? [], activeModules)
  const quickDebts: DebtQuickInput[] = rawQuickDebts ?? []

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
      // Onboarding already completed — skip data creation but still update
      // het primaire-doel + intent zodat een herstart van onboarding de
      // nieuwe doelvraag oppakt.
      if (intent || primaryGoalSlug) {
        const updates: Record<string, unknown> = {}
        if (intent) updates.onboarding_intent = intent
        if (primaryGoalSlug) updates.primary_goal_slug = primaryGoalSlug
        if (selectedGoalSlugs.length > 0) updates.selected_goal_slugs = selectedGoalSlugs
        await supabase.from('profiles').update(updates).eq('id', user.id)
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
      quickAssets, quickDebts,
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
      // Set initial phase
      if (!result.already_completed) {
        const profileUpdates: Record<string, unknown> = {
          last_known_phase: 'recovery',
          completed_onboarding_steps: completedSteps,
          onboarding_intent: intent ?? null,
          primary_goal_slug: primaryGoalSlug ?? null,
          selected_goal_slugs: selectedGoalSlugs.length > 0 ? selectedGoalSlugs : null,
        }
        // budgeting_active follows the intent's preset so onboarding-flow gating
        // (e.g. "show budgets step") stays in sync. Tracking on individual
        // assets governs sidebar visibility (see app/(app)/layout.tsx).
        if (activeModules && activeModules.length > 0) {
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

        // Module-tracking-flags activeren op de juiste assets. De RPC laat
        // has_budget_tracking / has_holdings_tracking standaard false; we
        // zetten ze hier expliciet aan zodat de Budgetteren- en Holdings-
        // apps direct een rekening hebben om mee te werken.
        await applyModuleTrackingFlags(supabase, user.id, activeModules)

        // Onboarding-spaardoel (stap v.) — non-blocking insert. Faalt deze,
        // dan slaat de gebruiker hem later handmatig aan via /will.
        if (onboardingGoal) {
          await insertOnboardingGoal(supabase, user.id, onboardingGoal)
        }
      }
      // Invalideer de server-cache voor de eerste pagina's die de gebruiker
      // na onboarding bezoekt — voorkomt dat een Next.js-cache de oude
      // stappenplan-staat blijft tonen na een data-reset + her-onboarding.
      revalidatePath('/will')
      revalidatePath('/core')
      revalidatePath('/dashboard')
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
    // Optionele metadata-kolommen: schrijf alléén als er waarde is. Dat
    // voorkomt een schema-cache-miss in omgevingen waar de bijbehorende
    // migratie nog niet is toegepast (PostgREST faalt op een onbekende
    // kolom, ook bij `null`-waarde). Voor het geval de kolom wél geschreven
    // wordt maar tóch ontbreekt (partial-migration-state) doet de upsert
    // hieronder een retry-pad zonder die kolom.
    if (newsDescription) profileData.news_description = newsDescription
    if (intent) profileData.onboarding_intent = intent
    if (primaryGoalSlug) profileData.primary_goal_slug = primaryGoalSlug
    if (selectedGoalSlugs.length > 0) profileData.selected_goal_slugs = selectedGoalSlugs
    profileData.completed_onboarding_steps = completedSteps
    // Server-controlled: leeg dashboard na onboarding. Zie buildRpcPayload.
    profileData.widget_prefs = { widgets: [] }
    // News-only: store financial context and AI-estimated income/expenses
    if (isNewsOnly) {
      if (financialContext) profileData.financial_context = financialContext
      if (aiIncomeEstimate != null) profileData.net_monthly_income = aiIncomeEstimate
      if (aiExpensesEstimate != null) profileData.estimated_monthly_expenses = aiExpensesEstimate
    }

    // Upsert met schema-cache-miss-recovery: als de DB een optionele
    // metadata-kolom mist (migratie nog niet toegepast), strippen we die
    // kolom en proberen we opnieuw. Voorkomt dat onboarding stilvalt op een
    // partial-migration-state.
    const OPTIONAL_PROFILE_COLUMNS = [
      'news_description',
      'onboarding_intent',
      'primary_goal_slug',
      'selected_goal_slugs',
      'onboarding_idempotency_key',
      'completed_onboarding_steps',
      'expected_return',
      'inflation_rate',
      'retirement_expense_method',
      'retirement_expense_custom_amount',
      'fire_end_strategy',
      'fire_legacy_amount',
      'fire_end_age',
      'temporal_balance',
      'widget_prefs',
      'financial_context',
    ] as const
    let profileErr: { message?: string; code?: string } | null = null
    for (let attempt = 0; attempt < OPTIONAL_PROFILE_COLUMNS.length + 1; attempt++) {
      const { error } = await supabase.from('profiles').upsert(profileData)
      if (!error) {
        profileErr = null
        break
      }
      profileErr = error
      const missing = OPTIONAL_PROFILE_COLUMNS.find(
        (col) => error.message?.includes(`'${col}'`),
      )
      if (!missing || !(missing in profileData)) break
      console.warn(`[onboarding-save] schema-cache miss op '${missing}' — retry zonder deze kolom`)
      delete profileData[missing]
    }
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

    // 3. Insert assets via QuickAddInput → buildAssetDraft. Cash-rekeningen
    // zitten als `cash`-type tussen de quickAssets — geen aparte
    // bank_accounts-flow meer in onboarding.
    //
    // Cleanup-volgorde mirrort de RPC: eerst lege bank_accounts en cash-
    // assets verwijderen (van een vorige onboarding-poging), dan alle
    // non-cash, dan inserten.
    await supabase.from('bank_accounts').delete().eq('user_id', user.id).eq('iban', '')
    await supabase.from('assets').delete().eq('user_id', user.id).eq('asset_type', 'cash')

    if (quickAssets.length > 0) {
      await supabase.from('assets').delete().eq('user_id', user.id).neq('asset_type', 'cash')
      const today = new Date().toISOString().split('T')[0]
      const hasBudgetteren = activeModules?.includes('budgetteren') ?? false
      const hasAandelenregistratie = activeModules?.includes('aandelenregistratie') ?? false
      const rows = quickAssets.map((q, i) => {
        const draft = buildAssetDraft(q)
        return {
          user_id: user.id,
          name: draft.name,
          asset_type: draft.asset_type,
          current_value: draft.current_value,
          purchase_value: draft.purchase_value,
          purchase_date: today,
          expected_return: draft.expected_return,
          monthly_contribution: draft.monthly_contribution,
          institution: draft.institution,
          is_active: true,
          sort_order: i,
          // Type-specific
          subtype: draft.subtype,
          risk_profile: draft.risk_profile,
          tax_benefit: draft.tax_benefit,
          is_liquid: draft.is_liquid,
          lock_end_date: draft.lock_end_date,
          ticker_symbol: draft.ticker_symbol,
          rental_income: draft.rental_income,
          woz_value: draft.woz_value,
          retirement_provider_type: draft.retirement_provider_type,
          depreciation_rate: draft.depreciation_rate,
          address_postcode: draft.address_postcode,
          address_house_number: draft.address_house_number,
          ownership: draft.ownership,
          net_worth_inclusion_pct: draft.net_worth_inclusion_pct,
          notes: draft.notes,
          // Module-tracking-flags inline meegeven (zelfde semantiek als
          // applyModuleTrackingFlags, maar voor het fallback-pad scheelt
          // dat een extra UPDATE-roundtrip).
          has_budget_tracking: hasBudgetteren && draft.asset_type === 'cash',
          has_holdings_tracking: hasAandelenregistratie && draft.asset_type === 'investment',
        }
      })
      const { error: assetErr } = await supabase.from('assets').insert(rows)
      if (assetErr) throw new Error(`Bezittingen opslaan mislukt: ${assetErr.message}`)
    }

    // 4. Insert debts via QuickAddInput → buildDebtDraft.
    if (quickDebts.length > 0) {
      await supabase.from('debts').delete().eq('user_id', user.id)
      const today = new Date().toISOString().split('T')[0]
      const rows = quickDebts.map((q, i) => {
        const draft = buildDebtDraft(q)
        return {
          user_id: user.id,
          name: draft.name,
          debt_type: draft.debt_type,
          original_amount: draft.original_amount,
          current_balance: draft.current_balance,
          interest_rate: draft.interest_rate,
          minimum_payment: draft.minimum_payment,
          monthly_payment: draft.monthly_payment,
          start_date: today,
          end_date: draft.end_date,
          creditor: draft.creditor,
          is_active: true,
          sort_order: i,
          // Type-specific
          subtype: draft.subtype,
          repayment_type: draft.repayment_type,
          is_tax_deductible: draft.is_tax_deductible,
          fixed_rate_end_date: draft.fixed_rate_end_date,
          nhg: draft.nhg,
          credit_limit: draft.credit_limit,
          draagkrachtmeting_date: draft.draagkrachtmeting_date,
          tax_year: draft.tax_year,
          ownership: draft.ownership,
          net_worth_inclusion_pct: draft.net_worth_inclusion_pct,
          include_aflossing_in_savings: draft.include_aflossing_in_savings,
        }
      })
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

    // 6d. Onboarding-spaardoel (stap v.) — non-blocking insert. Mag falen
    // zonder dat onboarding daarop afhaakt; gebruiker maakt het anders
    // later handmatig aan via /will. Bewust hier na assets/debts en vóór
    // de completed-flag: een gefaalde profile-write zou ons hier nooit
    // brengen, dus user.id is gegarandeerd persistent.
    if (onboardingGoal) {
      await insertOnboardingGoal(supabase, user.id, onboardingGoal)
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

    // Invalideer de server-cache voor de eerste pagina's die de gebruiker
    // na onboarding bezoekt — zelfde semantiek als het RPC-success-pad.
    revalidatePath('/will')
    revalidatePath('/core')
    revalidatePath('/dashboard')

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('save-own-data error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
