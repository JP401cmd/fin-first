import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError, badRequest } from '@/lib/api/respond'
import { PARAMETER_BANDS } from '@/lib/parameters-band'
import { END_AGE_MAX, END_AGE_MIN, STOP_ANCHOR_KINDS } from '@/lib/fire-strategy'
import { resolveOnboardingPlanColumns } from '@/lib/onboarding-plan'
import { NL_AOW_AGE, NL_AOW_MONTHLY } from '@/lib/horizon-data'
import { HORIZON_SETUP_COMPLETED_SLUG } from '@/lib/horizon-data-loader'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { type ModuleId, type IntentId } from '@/lib/module-registry'
import { extractFinancialData } from '@/lib/ai/extract-financial-data'
import { isCloudAllowed } from '@/lib/ai/privacy-gate'
import { checkTierGate } from '@/lib/require-tier'
import { checkCreditBudget } from '@/lib/ai/credit-gate'
import { recordAiUsage } from '@/lib/ai-credits'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AssetQuickInputSchema, DebtQuickInputSchema } from '@/lib/quick-add/validation'
import { buildAssetDraft, buildDebtDraft } from '@/lib/quick-add/build-drafts'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'
import { LINKED_DEBT_SUGGESTIONS, type AssetType } from '@/lib/asset-data'
import type { DebtType } from '@/lib/debt-data'
import type { GoalSlug } from '@/lib/goals/types'
import { GOAL_MODULE_PRESETS } from '@/lib/goals/catalog'
import { deleteEmptyOnboardingBankAccounts } from '@/lib/onboarding-bank-cleanup'
import { withRondleidingPending } from '@/lib/rondleiding/seed'

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

// `applyModuleSeeding` is VERWIJDERD (UR2-02, aug 2026). Deze helper duwde een
// placeholder-bezitting van € 0 in de save zodra `budgetteren` of
// `aandelenregistratie` actief was zonder bijpassend asset-type: een cash-rij
// "Lopende rekening" en/of een investment-rij "Beleggingsrekening".
//
// WAAROM WEG. Dat gebeurde óók — juist — wanneer de gebruiker de bezittingen-
// stap expliciet had overgeslagen. Het resultaat was "Totale waarde € 0 · 2
// bezittingen" op /core/assets voor iemand die aantoonbaar niets had ingevuld,
// plus een groen afgevinkte welkomst-stap "Zijn al je bezittingen
// geregistreerd?" (die leest `hasAssets` = bestaat er een rij). De app
// registreerde dus bezit dat de gebruiker nooit heeft bevestigd, en sprak
// daarmee haar eigen onboarding-belofte tegen. Dat is een datakwaliteits- en
// vertrouwensdefect, geen comfort-feature.
//
// WAT IN DE PLAATS KOMT: niets — de leegte is de waarheid. Beide setup-wizards
// vangen "nog geen rekening" al netjes op met een eigen lege staat die naar de
// juiste plek wijst:
//   · budgetteren → `components/app/app-setup/configs/budgetteren.config.tsx`
//     ("Je hebt nog geen cash-rekening. Voeg er één toe via …")
//   · aandelenregistratie → `.../aandelen-holdings.config.tsx`
//     ("Je hebt nog geen belegging geregistreerd. Voeg er eerst één toe …")
// De CLAUDE.md-fallbackregel ("een feature mag niet stilzwijgend breken omdat
// een andere module geen data heeft") is daarmee gedekt door een zichtbare,
// eerlijke lege staat in plaats van door een verzonnen rij in de database.
//
// Herintroduceer dit niet: `no-placeholder-assets.test.ts` bewaakt het.

// `applyModuleTrackingFlags` is verwijderd samen met de gedeprecate RPC-success-
// tak (probleem 4 / Keuze B). Het multi-step pad zet has_budget_tracking /
// has_holdings_tracking al INLINE op de asset-insert (zie de map() in stap 3),
// dus een aparte post-insert UPDATE is overbodig.

/**
 * Mag de server-side extractie-tak draaien — de ENIGE plek in deze route waar
 * gebruikerstekst een externe AI-provider bereikt (via `extractFinancialData` →
 * `getModel`)?
 *
 * WAAROM EEN BOOLEAN EN GEEN 403 OP DE ROUTE. Deze route is een
 * onboarding-OPSLAGroute die veel méér doet dan AI: profiel, bezittingen,
 * schulden, life events, doelen. Een tier-gate bovenaan `POST` zou de complete
 * onboarding blokkeren voor iedereen zonder AI-abonnement — dat is geen
 * beveiliging maar een kapotte productflow. De poort hoort dus om de AI-tak
 * heen, precies waar de privé-gate al zat: kan het uitlezen niet, dan slaan we
 * dat over en wordt de rest van de onboarding gewoon opgeslagen. De gebruiker
 * vult zijn bezittingen daarna handmatig aan.
 *
 * De volgorde binnen de poort is de vastgelegde: privé-modus → tier → credit.
 * Privé-modus eerst omdat dat de meest fundamentele keuze van de gebruiker is;
 * de credit-check als laatste omdat een call die de tier-gate toch al tegenhoudt
 * geen budget-lezing verdient.
 */
async function mayRunServerExtraction(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  if (!(await isCloudAllowed(supabase, userId, 'documenten'))) return false
  if (await checkTierGate(supabase, userId, 'ai')) return false
  const creditGate = await checkCreditBudget(supabase, userId, 'extraction')
  return creditGate.allowed
}

/**
 * Is `debtType` het schuld-type dat bij `assetType` hoort volgens de canonieke
 * `LINKED_DEBT_SUGGESTIONS`-bron? Eén plek voor de paar-validatie, gebruikt zowel
 * bij het bouwen van de paren (client-input) als bij de defensieve DB-guard.
 */
function isLinkedAssetDebtPair(assetType: string, debtType: string): boolean {
  return LINKED_DEBT_SUGGESTIONS[assetType as AssetType] === (debtType as DebtType)
}

/**
 * Twee-fasen koppeling bezitting ↔ gekoppelde schuld na de onboarding-insert.
 *
 * Tijdens onboarding heeft een bezitting nog geen DB-id, dus de client geeft
 * een opaak koppel-token mee: `client_ref` op de asset en `linked_client_ref`
 * op de bijbehorende schuld. Pas ná de insert bestaan de echte id's. Deze
 * helper resolved beide id's uit de ZOJUIST-INGEVOEGDE rijen van DEZE gebruiker
 * (RLS-scoped op `user_id`) en zet `debts.linked_asset_id`.
 *
 * Generiek over ALLE gekoppelde paren uit `LINKED_DEBT_SUGGESTIONS` — niet
 * alleen huis↔hypotheek, maar óók voertuig↔autolening en deelneming (BV)↔
 * DGA-schuld. Vroeger koppelde deze stap uitsluitend `mortgage`, waardoor een
 * tijdens onboarding gekoppelde RC-aan-BV of autolening als volledig LOSSE
 * schuld (linked_asset_id = null) in de database bleef staan — dat schond de
 * app-invariant dat een `dga_schuld` altijd aan een deelneming gekoppeld is
 * (verplicht in de reguliere debt-form) en brak de groepering "schuld onder de
 * bezitting" op /core.
 *
 * Beveiliging: de client levert nooit een echt asset-id — alleen een opaak
 * token. De asset-id wordt uitsluitend uit onze eigen (RLS-afgeschermde) rijen
 * gehaald en de UPDATE filtert expliciet op `user_id`. Een gebruiker kan dus
 * onmogelijk aan andermans asset koppelen.
 *
 * Idempotent: `sort_order` == array-index in beide insert-paden (RPC + fallback),
 * dus een herhaalde run zet exact dezelfde koppeling. Non-blocking: een mislukte
 * koppeling logt maar laat onboarding niet stranden (spiegelt DEBT_FAILED).
 *
 * Cruciaal voor correctheid: zonder deze koppeling filtert de eigen-woning-
 * strategie (`filterAssetsForFire`) de hypotheek NIET uit de FIRE-pot mee met
 * het huis → vertekend FIRE-doel.
 */
export async function linkOnboardingAssetDebtPairs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  quickAssets: AssetQuickInput[],
  quickDebts: DebtQuickInput[],
) {
  // Bouw paren: debt-index → asset-index, via de client-refs. Alleen geldige
  // bezitting↔schuld-combinaties uit LINKED_DEBT_SUGGESTIONS (defensief
  // dubbel-gecheckt op type).
  const pairs: Array<{ assetIndex: number; debtIndex: number }> = []
  quickDebts.forEach((debt, debtIndex) => {
    const ref = debt.linked_client_ref
    if (!ref) return
    const assetIndex = quickAssets.findIndex((a) => a.client_ref === ref)
    if (assetIndex < 0) return
    if (!isLinkedAssetDebtPair(quickAssets[assetIndex].asset_type, debt.debt_type)) return
    pairs.push({ assetIndex, debtIndex })
  })
  if (pairs.length === 0) return

  // Resolve id's uit onze eigen rijen. `sort_order` == array-index in beide
  // insert-paden, dus dat is de brug tussen client-input en DB-rij.
  const [{ data: assetRows }, { data: debtRows }] = await Promise.all([
    supabase.from('assets').select('id, sort_order, asset_type').eq('user_id', userId),
    supabase.from('debts').select('id, sort_order, debt_type').eq('user_id', userId),
  ])
  const assetBySort = new Map<number, { id: string; asset_type: string }>()
  for (const r of assetRows ?? []) assetBySort.set(Number(r.sort_order), { id: r.id, asset_type: r.asset_type })
  const debtBySort = new Map<number, { id: string; debt_type: string }>()
  for (const r of debtRows ?? []) debtBySort.set(Number(r.sort_order), { id: r.id, debt_type: r.debt_type })

  for (const { assetIndex, debtIndex } of pairs) {
    const asset = assetBySort.get(assetIndex)
    const debt = debtBySort.get(debtIndex)
    if (!asset || !debt) continue
    // Defensieve type-guard tegen een verkeerde sort_order-match.
    if (!isLinkedAssetDebtPair(asset.asset_type, debt.debt_type)) continue
    const { error } = await supabase
      .from('debts')
      .update({ linked_asset_id: asset.id })
      .eq('id', debt.id)
      .eq('user_id', userId)
    if (error) {
      console.error('[onboarding-save] bezitting↔schuld-koppeling mislukt (non-fatal):', error.message)
    }
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
    // Marker B: standaard-doel-key zodat het noodfonds-doel detecteerbaar is
    // voor de score/resolver (lib/emergency-fund.ts).
    metadata: goal.standaardDoel ? { standaardDoel: goal.standaardDoel } : {},
  })
  if (error) {
    console.error('[onboarding-save] goal insert failed:', error.message)
  }
}

/**
 * Bepaal retirement_expense_method + retirement_expense_custom_amount voor het
 * onboarding-profiel.
 *
 * Product-beslissing: standaard = 80% van huidige jaaruitgaven ("custom_amount").
 * Dit overschrijft de vroegere default ("current_income") zodat de /toekomst-
 * grafiek direct een realistische pensioenuitgave toont.
 *
 * Uitzondering: als de gebruiker in de onboarding-UI expliciet een methode heeft
 * gekozen (horizonData.retirement_expense_method aanwezig), respecteren we die.
 *
 * Guard: als de maanduitgaven onbekend zijn (niet ingevuld / uitgesteld), vallen
 * we terug op "current_income" met null custom_amount — geen 0 of garbage invullen.
 */
function resolveRetirementExpenseDefaults(
  explicitMethod: 'essential_budgets' | 'custom_amount' | 'current_income' | undefined,
  explicitCustomAmount: number | undefined,
  identityMethod: 'essential_budgets' | 'custom_amount' | 'current_income' | undefined,
  estimatedMonthlyExpenses: number | undefined,
): {
  retirement_expense_method: 'essential_budgets' | 'custom_amount' | 'current_income'
  retirement_expense_custom_amount: number | null
} {
  // Gebruiker koos expliciet een methode via de onboarding-UI → respecteer die keuze
  if (explicitMethod != null) {
    return {
      retirement_expense_method: explicitMethod,
      retirement_expense_custom_amount: explicitCustomAmount ?? null,
    }
  }
  // Legacy: identity bevat al een keuze (oudere clients)
  if (identityMethod != null) {
    return {
      retirement_expense_method: identityMethod,
      retirement_expense_custom_amount: explicitCustomAmount ?? null,
    }
  }
  // Default: 80% van huidige jaaruitgaven — maar alleen als expenses bekend zijn
  if (estimatedMonthlyExpenses != null && estimatedMonthlyExpenses > 0) {
    return {
      retirement_expense_method: 'custom_amount',
      // 80% van huidige jaaruitgaven (maand × 12 × 0.8)
      retirement_expense_custom_amount: Math.round(estimatedMonthlyExpenses * 12 * 0.8),
    }
  }
  // Expenses onbekend (overgeslagen stap) → generieke fallback zonder garbage-waarde
  return {
    retirement_expense_method: 'current_income',
    retirement_expense_custom_amount: null,
  }
}

/**
 * Build the RPC payload for the atomic save_onboarding_data function.
 * Structures all onboarding data into the format expected by the plpgsql function.
 *
 * widget_prefs is server-controlled: nieuwe gebruikers starten altijd met een
 * leeg dashboard ({ widgets: [] }). De gebruiker stelt later widgets in via
 * Instellingen — onboarding raakt het dashboard niet meer.
 *
 * **Budget-seeding (mei 2026):** onboarding seedt GEEN budgetten meer. De
 * gebruiker maakt een bewuste keuze via de Budgetteren-setup-gate
 * (`components/app/app-setup/configs/budgetteren.config.tsx`) bij eerste
 * binnenkomst van /core/assets/cash?tab=budgetteren. Voorheen werden hier
 * 6 parents + 24 children geseed; dat is verwijderd zodat de gate niet
 * direct gebackfilled wordt op een verse user.
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
  pensionData?: z.infer<typeof bodySchema>['pensionData'],
) {
  // LET OP (ADR 0129): dit pad is dood (`void buildRpcPayload` hieronder) en de
  // DB-RPC leest de ankerkolommen `fire_stop_anchor`/`fire_stop_age` niet. Het anker
  // ontbreekt hier dus bewust; wordt dit pad ooit gereactiveerd, dan hoort het
  // `planColumns`-blok van het multi-step pad hier óók in (en in de RPC).
  // Budgetten worden niet meer in onboarding geseed — zie comment hierboven.
  const parentBudgets: Record<string, unknown>[] = []
  const childBudgets: Record<string, unknown>[] = []

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
      // Pensioenuitgaven-default: 80% van huidige jaaruitgaven, tenzij de gebruiker
      // in de onboarding-UI expliciet een methode heeft gekozen (horizonData bevat dan
      // een retirement_expense_method). Alleen schrijven als expenses bekend is — bij
      // een overgeslagen/uitgestelde expenses-stap geen 0/garbage invullen.
      ...resolveRetirementExpenseDefaults(
        horizonData?.retirement_expense_method,
        horizonData?.retirement_custom_amount ?? identity.retirement_custom_amount,
        identity.retirement_expense_method,
        identity.estimated_monthly_expenses,
      ),
      fire_end_strategy: horizonData?.fire_end_strategy ?? identity.fire_end_strategy ?? 'deplete',
      fire_legacy_amount: horizonData?.fire_legacy_amount ?? identity.fire_legacy_amount ?? null,
      fire_end_age: horizonData?.fire_end_age ?? identity.fire_end_age ?? 90,
      temporal_balance: horizonData?.temporal_balance ?? identity.temporal_balance ?? 3,
      news_description: newsDescription ?? null,
      onboarding_intent: intent ?? null,
      // ── Standaardinstellingen nieuwe gebruiker (Notion "new user standaard
      // instellingen") ────────────────────────────────────────────────────
      // Eigen woning: "verkopen wanneer nodig, op basis van marktwaarde"
      // (downsize + on_depletion + marktwaarde-basis). parseHousingStrategy vult
      // de overige velden met DEFAULT_DOWNSIZE_CONFIG. Zonder eigen_huis-asset is
      // dit een no-op; mét eigen woning wordt die pas gemonetiseerd wanneer het
      // liquide vermogen krap wordt. Vervangt de eerdere exclude_from_fire-default.
      housing_strategy_config: { mode: 'downsize', trigger: 'on_depletion', saleValuationBasis: 'market' },
      // Onttrekkingsprofiel: afnemend (enum-spiegel 'static', zoals de
      // onttrekkings-UI schrijft). Verdeling bij toename: naar beleggen
      // (pot_rules.surplus_group; resolvePotRules vult de orde-regels aan).
      withdrawal_strategy: 'static',
      withdrawal_profile_config: { profiel: 'afnemend' },
      pot_rules: { surplus_group: 'beleggingen' },
    },
    budget_amounts: budgetAmounts,
    budgettering_mode: budgetteringMode ?? 'manual',
    parent_budgets: parentBudgets,
    child_budgets: childBudgets,
    // Geen bank_accounts meer in onboarding — cash-rekeningen worden als
    // `cash`-type asset toegevoegd via de QuickAddWizard. De RPC verwijdert
    // lege bestaande bank_accounts (zie `deleteEmptyOnboardingBankAccounts`) en
    // cash-assets aan het begin van die step; daarna worden cash-assets in
    // stap 7 (assets) ingevoegd.
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
    aow_monthly: (pensionData?.aowBedrag && pensionData.aowBedrag > 0)
      ? pensionData.aowBedrag
      : NL_AOW_MONTHLY,
  }
}

const bodySchema = z.object({
  identity: z.object({
    full_name: z.string().min(1),
    date_of_birth: z.string().min(1),
    household_type: z.enum(['solo', 'samen', 'gezin']),
    number_of_children: z.number().int().min(0).default(0),
    net_monthly_income: z.number().min(0).default(0),
    estimated_monthly_expenses: z.number().positive().optional(),
    // FIRE parameters (optional, with sensible defaults).
    // Banden uit de GEDEELDE bron (lib/parameters-band.ts) — dezelfde die
    // PUT /api/parameters en de bewerk-sheet gebruiken, en die sinds
    // 20260805120000 óók als CHECK-constraint op de kolom staat. Stonden hier
    // eerder ruimer (0,20 resp. 0,10): één kolom met twee normen, en na de
    // migratie zou een waarde daartussen hard falen op de constraint in plaats
    // van een nette validatiefout te geven.
    expected_return: z
      .number()
      .min(PARAMETER_BANDS.expected_return.min)
      .max(PARAMETER_BANDS.expected_return.max)
      .optional(),
    inflation_rate: z
      .number()
      .min(PARAMETER_BANDS.inflation_rate.min)
      .max(PARAMETER_BANDS.inflation_rate.max)
      .optional(),
    retirement_expense_method: z.enum(['essential_budgets', 'custom_amount', 'current_income']).optional(),
    retirement_custom_amount: z.number().min(0).optional(),
    fire_end_strategy: z.enum(['perpetual', 'legacy', 'deplete', 'pensioen']).optional(),
    fire_legacy_amount: z.number().positive().optional(),
    // Grens uit de ene bron (lib/fire-strategy) — spiegel van de DB-CHECK 60..120.
    fire_end_age: z.number().int().min(END_AGE_MIN).max(END_AGE_MAX).optional(),
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
    // De oude labels blijven geaccepteerd (drafts/clients van vóór de stap "Jouw
    // plan"); `resolveOnboardingPlanColumns` vertaalt ze naar een anker en schrijft
    // altijd een eind-vorm weg (ADR 0129).
    fire_end_strategy: z.enum(['perpetual', 'legacy', 'deplete', 'pensioen']).optional(),
    // Zelfde band als de DB-CHECK, `/api/fire-settings` en de plan-vragen (60–120):
    // één bron in lib/fire-strategy, geen tweede grens.
    fire_end_age: z.number().int().min(END_AGE_MIN).max(END_AGE_MAX).optional(),
    fire_legacy_amount: z.number().positive().optional(),
    // Het stop-anker (ADR 0129): allowlist uit de canonieke bron; de stopleeftijd
    // wordt in `resolveOnboardingPlanColumns` op halve jaren, 18–100 en
    // `age` ⟺ aanwezig getoetst (zelfde toets als /api/fire-settings).
    fire_stop_anchor: z.enum(STOP_ANCHOR_KINDS).optional(),
    fire_stop_age: z.number().nullable().optional(),
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
    /**
     * Standaard-doel-key (marker B) — meegeschreven als `goals.metadata.standaardDoel`
     * zodat het noodfonds-doel detecteerbaar is voor de gezondheidsscore/resolver
     * (lib/emergency-fund.ts). Optioneel/backward-compatibel.
     */
    standaardDoel: z.string().max(40).optional(),
  }).optional(),
  /** Parsed UPO pension data — optional, used to create pension life events and override AOW amount. */
  pensionData: z.object({
    aowBedrag: z.number().nullable(),
    regelingen: z.array(z.object({
      fondsNaam: z.string(),
      brutoBedrag: z.number(),
      ingangLeeftijd: z.number(),
      isGeindexeerd: z.boolean(),
      type: z.string(),
    })),
    nabestaandenpensioen: z.number().nullable(),
    samenvatting: z.string(),
  }).optional(),
  /**
   * Fields the user explicitly deferred via "Later invullen" during onboarding
   * (feature #830). Stored in `profiles.onboarding_deferred_fields` to surface
   * targeted post-onboarding suggestions via the coach-bubble.
   */
  deferredFields: z.array(z.enum(['income', 'assets', 'spaardoel'])).optional(),
  /**
   * Pre-extracted data from client-side review (avoids re-running AI extraction).
   *
   * DE AFGELEIDE VELDEN ZIJN OPTIONEEL, MAAR ZE TELLEN. Deze tak accepteerde
   * oorspronkelijk alleen naam/type/bedrag en vulde rendement, rente, aflossing,
   * liquiditeit en aftrekbaarheid met nullen. Dat kon zolang de client niets
   * beters had. Het on-device pad (lib/ai/local/local-extraction-resolver.ts)
   * lévert die velden nu wél — deterministisch uit TypeScript-lookups, niet uit
   * het model — en ze dan alsnog op nul zetten zou precies de winst weggooien
   * die het lokale pad oplevert: een hypotheek zonder rente en zonder aflossing
   * is in elke projectie een schuld die nooit afneemt.
   *
   * Blijven optioneel voor oudere clients; ontbreken ze, dan gelden de
   * historische defaults (zie de mapping verderop in deze route).
   */
  extractionData: z.object({
    assets: z.array(z.object({
      name: z.string(),
      asset_type: z.string(),
      estimated_value: z.number(),
      expected_return: z.number().optional(),
      monthly_contribution: z.number().optional(),
      is_liquid: z.boolean().optional(),
      subtype: z.string().nullable().optional(),
    })).optional(),
    debts: z.array(z.object({
      name: z.string(),
      debt_type: z.string(),
      estimated_balance: z.number(),
      interest_rate: z.number().optional(),
      monthly_payment: z.number().optional(),
      is_tax_deductible: z.boolean().nullable().optional(),
      subtype: z.string().nullable().optional(),
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
    return unauthorized()
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
    quickAssets: rawQuickAssets,
    quickDebts: rawQuickDebts,
    budgetteringMode,
    idempotencyKey,
    activeModules: rawActiveModules,
    newsDescription,
    extractionData,
    pensionData,
    intent: rawIntent,
    selectedGoalSlug: rawSelectedGoalSlug,
    selectedGoalSlugs: rawSelectedGoalSlugs,
    onboardingGoal,
    deferredFields,
  } = parsed.data

  // Het plan (ADR 0129): eind-vorm + stop-anker ÉÉN keer oplossen — horizonData
  // wint, identity is de backwards-compat-bron, 'deplete'/90 de laatste terugval.
  // Een legacy-label ('pensioen'/'nu-stoppen') wordt hier vertaald naar zijn anker;
  // een tegenstrijdig of ongeldig anker (age zonder leeftijd, stop ≥ eind, geen
  // halve jaren) is een client-fout → 400 via de error-envelope.
  const planColumns = resolveOnboardingPlanColumns({
    strategy: horizonData?.fire_end_strategy ?? identity.fire_end_strategy ?? 'deplete',
    anchor: horizonData?.fire_stop_anchor,
    stopAge: horizonData?.fire_stop_age,
    endAge: horizonData?.fire_end_age ?? identity.fire_end_age ?? 90,
  })
  if ('error' in planColumns) return badRequest(planColumns.error)

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

  // Alleen wat de gebruiker zélf heeft bevestigd wordt bezit. Geen module-
  // seeding meer: zie het blok bij `applyModuleSeeding` bovenaan dit bestand.
  const quickAssets: AssetQuickInput[] = rawQuickAssets ?? []
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
        // De afgeleide velden komen mee wanneer de client ze levert (het lokale
        // pad vult ze deterministisch — zie lib/ai/local/local-extraction-
        // defaults.ts). Ontbreken ze, dan gelden de historische defaults van
        // oudere clients; `??` en niet `||`, zodat een legitieme 0 (rendement
        // van contant geld) of `false` (niet liquide) niet stilzwijgend wordt
        // overschreven.
        extractedAssets = (extractionData.assets ?? []).map((a) => ({
          name: a.name,
          asset_type: a.asset_type,
          current_value: a.estimated_value,
          expected_return: a.expected_return ?? 0,
          monthly_contribution: a.monthly_contribution ?? 0,
          is_liquid: a.is_liquid ?? true,
          subtype: a.subtype ?? null,
          source: 'ai_extracted' as const,
        }))

        extractedDebts = (extractionData.debts ?? []).map((d) => ({
          name: d.name,
          debt_type: d.debt_type,
          current_balance: d.estimated_balance,
          interest_rate: d.interest_rate ?? 0,
          monthly_payment: d.monthly_payment ?? 0,
          is_tax_deductible: d.is_tax_deductible ?? null,
          subtype: d.subtype ?? null,
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
      } else if (newsDescription && (await mayRunServerExtraction(supabase, user.id))) {
        // Fallback: run extraction server-side (backwards compatibility)
        //
        // DRIE POORTEN, ÉÉN VOORWAARDE: privé-modus, AI-abonnement en
        // creditbudget zitten samen in `mayRunServerExtraction` (zie daar voor
        // de volgorde en de motivatie). Deze tak is het ENIGE pad in deze route
        // dat tekst van de gebruiker naar een AI-leverancier stuurt — de
        // model-call zit niet hier maar in extractFinancialData
        // (lib/ai/extract-financial-data.ts), en juist daarom miste de statische
        // scan deze route.
        //
        // PRIVÉ-MODUS: staat 'documenten' op lokaal, dan hoort de
        // onboarding-client het uitlezen zelf on-device te doen en het resultaat
        // als `extractionData` mee te sturen (de tak hierboven). Deed hij dat
        // niet, dan slaan we het uitlezen simpelweg over: de rest van de
        // onboarding wordt gewoon opgeslagen en de gebruiker vult zijn
        // bezittingen handmatig aan. Bewust GEEN 403 op de hele route — dat zou
        // de complete onboarding blokkeren om één optionele hulpstap — en
        // bewust ook geen stille cloud-call.
        //
        // Let op de eerlijke grens: de vrije tekst zelf wordt verderop nog wel
        // als `news_description` op het profiel bewaard. "Lokaal" betekent hier
        // dus: geen AI-leverancier ziet je tekst — niet: de tekst blijft op je
        // toestel. Dat verschil hoort ook zo in de UI-tekst te staan.
        const dob = new Date(identity.date_of_birth)
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))

        const extraction = await extractFinancialData(supabase, newsDescription, {
          age,
          householdType: identity.household_type,
          monthlyIncome: identity.net_monthly_income,
          monthlyExpenses: identity.estimated_monthly_expenses,
        })

        // Verbruik registreren in dezelfde maandbucket die `mayRunServerExtraction`
        // hierboven leest — anders is deze AI-call ongemeten en telt hij niet mee
        // voor de volgende gate. `recordAiUsage` gooit nooit: metering mag de
        // onboarding niet breken.
        await recordAiUsage(supabase, user.id, 'extraction')

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

    // ── Strategy: multi-step save (the RPC is DEPRECATED) ──────────────────
    // De atomische RPC `save_onboarding_data` is DEPRECATED en wordt bewust
    // NIET meer aangeroepen. Twee bugs maakten 'm onbruikbaar:
    //   1. Parameter-naam mismatch: de huidige DB-definitie verwacht
    //      `p_payload`, de caller stuurde `payload` → PostgreSQL zag dit als
    //      een aanroep zónder argumenten ("no-args signatuur"-fout).
    //   2. Kolom-bug in de functie-body: `INSERT INTO budgets (..., is_parent)`
    //      terwijl `budgets` geen `is_parent`-kolom heeft (wel `parent_id`).
    // Het multi-step fallback-pad hieronder is functioneel compleet (profiel,
    // assets, debts, hypotheek-koppeling, AOW/pensioen/eigen life-events,
    // news-only-inserts, spaardoel, horizon-flag, completion) en is nu het
    // primaire pad. Een DB-migratie om de RPC te herstellen is bewust vermeden
    // (lagere blast-radius — geen prod-DB-wijziging). `buildRpcPayload` blijft
    // staan als referentie voor de payload-vorm tot de RPC formeel verwijderd
    // wordt. Zie Notion "Na deploy issues" / probleem 4 (Keuze B).
    // De vroegere RPC-success-tak (applyModuleTrackingFlags, mortgage-linking,
    // news-only-inserts, onboarding-goal, horizon-flag) is verwijderd: al die
    // stappen bestaan al, een-op-een, in het multi-step pad hieronder. De
    // `void` houdt buildRpcPayload als referentie voor de payload-vorm.
    void buildRpcPayload

    // ── Multi-step save (primair pad, non-atomic) ──────────────────────

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
    // Onboarding-schattingen = handmatige bron ("eigen bedrag") — zie het
    // gelijknamige blok in het RPC-pad hierboven.
    if (identity.net_monthly_income > 0) profileData.income_source = 'manual'
    if (identity.estimated_monthly_expenses != null && identity.estimated_monthly_expenses > 0) {
      profileData.expenses_source = 'manual'
    }
    // Add FIRE parameters — horizonData takes priority, then identity (backwards compat)
    if (identity.expected_return != null) profileData.expected_return = identity.expected_return
    if (identity.inflation_rate != null) profileData.inflation_rate = identity.inflation_rate
    // Pensioenuitgaven-default: zie resolveRetirementExpenseDefaults() hierboven.
    const retirementDefaults = resolveRetirementExpenseDefaults(
      horizonData?.retirement_expense_method,
      horizonData?.retirement_custom_amount ?? identity.retirement_custom_amount,
      identity.retirement_expense_method,
      identity.estimated_monthly_expenses,
    )
    profileData.retirement_expense_method = retirementDefaults.retirement_expense_method
    profileData.retirement_expense_custom_amount = retirementDefaults.retirement_expense_custom_amount
    // ── Standaardinstellingen nieuwe gebruiker (Notion "new user standaard
    // instellingen") — expliciet wegschrijven (primair multi-step pad) ─────
    //   1. Eindstrategie: vermogen opeten tot leeftijd 90 (fire_end_strategy
    //      'deplete' + fire_end_age 90 — zie de ?? fallbacks hieronder; een
    //      expliciete gebruikerskeuze in de horizon-stap wint).
    //   2. Eigen woning: verkopen wanneer nodig, op basis van marktwaarde
    //      (downsize + on_depletion + saleValuationBasis 'market'). Vervangt de
    //      eerdere exclude_from_fire-default. parseHousingStrategy vult de rest.
    //   3. Onttrekkingsprofiel: afnemend (withdrawal_profile_config.profiel;
    //      enum-spiegel 'static' zoals de onttrekkings-UI schrijft).
    //   4. Verdeling bij toename: naar beleggen (pot_rules.surplus_group;
    //      resolvePotRules vult de orde-regels met de defaults aan).
    // Expliciet zodat elke nieuwe gebruiker deze actieve voorkeuren heeft,
    // onafhankelijk van latere default/fallback-drift.
    profileData.housing_strategy_config = { mode: 'downsize', trigger: 'on_depletion', saleValuationBasis: 'market' }
    // Het plan (ADR 0129) uit het ene opgeloste blok — zie `planColumns` hierboven.
    profileData.fire_end_strategy = planColumns.fire_end_strategy
    profileData.fire_legacy_amount = horizonData?.fire_legacy_amount ?? identity.fire_legacy_amount ?? null
    profileData.fire_end_age = planColumns.fire_end_age
    profileData.fire_stop_anchor = planColumns.fire_stop_anchor
    profileData.fire_stop_age = planColumns.fire_stop_age
    profileData.temporal_balance = horizonData?.temporal_balance ?? identity.temporal_balance ?? 3
    profileData.withdrawal_strategy = 'static'
    profileData.withdrawal_profile_config = { profiel: 'afnemend' }
    profileData.pot_rules = { surplus_group: 'beleggingen' }
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
    // Feature #830: deferred onboarding fields — stored in feature_preferences sub-key
    // (no DDL migration needed). Read current prefs first to avoid overwriting.
    if (deferredFields && deferredFields.length > 0) {
      try {
        const { data: currentPrefsRow } = await supabase
          .from('profiles')
          .select('feature_preferences')
          .eq('id', user.id)
          .single()
        const currentPrefs = (currentPrefsRow?.feature_preferences as Record<string, unknown>) ?? {}
        currentPrefs.deferred_onboarding_fields = deferredFields
        profileData.feature_preferences = currentPrefs
      } catch {
        profileData.feature_preferences = { deferred_onboarding_fields: deferredFields }
      }
    }
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
      'fire_stop_anchor',
      'fire_stop_age',
      'temporal_balance',
      'widget_prefs',
      'financial_context',
      'income_source',
      'expenses_source',
      'housing_strategy_config',
      'withdrawal_strategy',
      'withdrawal_profile_config',
      'pot_rules',
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

    // 2. Budget-seeding (mei 2026) — VERWIJDERD uit onboarding.
    // Budgetten worden bewust geseed door de Budgetteren-setup-gate bij
    // eerste bezoek aan /core/assets/cash?tab=budgetteren — niet hier in
    // onboarding. Zie `components/app/app-setup/configs/budgetteren.config.tsx`
    // en `app/api/budgetteren/setup/route.ts`. De feature-visit marker
    // `budgetteren_setup_completed` wordt pas dáár gezet, zodat de gate
    // verschijnt en de gebruiker zelf een template kiest.
    //
    // We ruimen wel eventuele bestaande budgets op zodat een herhaalde
    // onboarding-run (data-reset → opnieuw) niet stilzwijgend oude
    // budgets behoudt.
    await supabase.from('budgets').delete().eq('user_id', user.id)

    // 3. Insert assets via QuickAddInput → buildAssetDraft. Cash-rekeningen
    // zitten als `cash`-type tussen de quickAssets — geen aparte
    // bank_accounts-flow meer in onboarding.
    //
    // Cleanup-volgorde mirrort de RPC: eerst lege bank_accounts en cash-
    // assets verwijderen (van een vorige onboarding-poging), dan alle
    // non-cash, dan inserten.
    // Lege placeholder-rekeningen van een eerdere poging. Bewust NIET meer
    // `.eq('iban', '')`: dat is een filter óp de plaintext-kolom die Stage B laat
    // vallen. De vervangende sleutel (geen IBAN + geen transacties + geen
    // bankkoppeling) en waarom een kaal `iban_encrypted IS NULL` daar níét voor
    // volstaat, staan in `lib/onboarding-bank-cleanup.ts`.
    await deleteEmptyOnboardingBankAccounts(supabase, user.id)
    await supabase.from('assets').delete().eq('user_id', user.id).eq('asset_type', 'cash')
    // ONVOORWAARDELIJK, net als de cash-tak hierboven (UR2-02). Deze delete
    // stond tot aug 2026 ín de `quickAssets.length > 0`-tak, waardoor een
    // herstarte onboarding waarin de gebruiker bezittingen OVERSLAAT de
    // non-cash rijen van de vorige, gestrande poging liet staan. Dat viel niet
    // op zolang `applyModuleSeeding` de lijst altijd op ≥ 1 hield; nu die weg
    // is, is `quickAssets` echt leeg als de gebruiker overslaat en moet het
    // opruimen dus buiten de guard. De route is alleen bereikbaar zolang
    // `onboarding_completed` false is (idempotency-check hierboven), dus dit
    // raakt uitsluitend rijen van een nog niet afgeronde onboarding.
    await supabase.from('assets').delete().eq('user_id', user.id).neq('asset_type', 'cash')

    if (quickAssets.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      const hasBudgetteren = activeModules?.includes('budgetteren') ?? false
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
          // Budget-tracking wordt bij onboarding inline gezet (bewust gewenst:
          // budgetteren-module → cash-asset trackt direct, wizard pre-selecteert).
          has_budget_tracking: hasBudgetteren && draft.asset_type === 'cash',
          // Holdings-tracking bewust ALTIJD uit bij onboarding: dit is een
          // selectieve opt-in via de setup-wizard (/api/aandelen-holdings/setup).
          // Automatisch aanzetten zou de wizard overslaan én de backfill-gate
          // stilzwijgend als "voltooid" markeren — zie CLAUDE.md / bugkaart.
          has_holdings_tracking: false,
        }
      })
      const { error: assetErr } = await supabase.from('assets').insert(rows)
      if (assetErr) throw new Error(`Bezittingen opslaan mislukt: ${assetErr.message}`)
    }

    // 4. Insert debts via QuickAddInput → buildDebtDraft.
    if (quickDebts.length > 0) {
      await supabase.from('debts').delete().eq('user_id', user.id)
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
          // buildDebtDraft leidt start_date af uit de (hypotheek-)invoer of
          // valt terug op vandaag — niet hardcoden, anders gaat de echte
          // ingangsdatum van een lopende hypotheek verloren.
          start_date: draft.start_date,
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

    // 5. Bezitting ↔ gekoppelde schuld koppelen (fallback-pad). Zelfde twee-
    // fasen-mapping als het RPC-pad: na de asset+debt-insert zetten we
    // debts.linked_asset_id op ALLE gekoppelde paren (hypotheek↔woning,
    // autolening↔voertuig, DGA-schuld↔BV). Non-blocking. Zie
    // linkOnboardingAssetDebtPairs.
    await linkOnboardingAssetDebtPairs(supabase, user.id, quickAssets, quickDebts)

    // 6. Seed default AOW life event (uses aowTargetAge resolved above)
    // Delete existing AOW event first to prevent duplicates on retry
    await supabase.from('life_events').delete().eq('user_id', user.id).eq('event_type', 'aow')

    // If UPO pension data was uploaded, use the parsed AOW amount instead of default
    const aowMonthly = (pensionData?.aowBedrag && pensionData.aowBedrag > 0)
      ? pensionData.aowBedrag
      : NL_AOW_MONTHLY

    await supabase.from('life_events').insert({
      user_id: user.id,
      name: 'AOW',
      event_type: 'aow',
      target_age: aowTargetAge,
      monthly_income_change: aowMonthly,
      monthly_cost_change: 0,
      one_time_cost: 0,
      duration_months: 0,
      is_indexed: true,
      is_active: true,
      icon: 'Landmark',
      sort_order: 0,
      metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 },
    })

    // 6a. Insert pension life events from UPO upload (ouderdomspensioen regelingen)
    if (pensionData?.regelingen && pensionData.regelingen.length > 0) {
      const ouderdomsRegelingen = pensionData.regelingen.filter(
        (r) => r.type === 'ouderdomspensioen'
      )
      if (ouderdomsRegelingen.length > 0) {
        // Delete existing pension events first (prevent duplicates on retry)
        await supabase.from('life_events').delete().eq('user_id', user.id).eq('event_type', 'pension')

        const pensionEvents = ouderdomsRegelingen.map((r, i) => ({
          user_id: user.id,
          name: r.fondsNaam || 'Aanvullend pensioen',
          event_type: 'pension',
          target_age: r.ingangLeeftijd,
          monthly_income_change: r.brutoBedrag,
          monthly_cost_change: 0,
          one_time_cost: 0,
          duration_months: 0,
          is_indexed: r.isGeindexeerd,
          is_active: true,
          icon: 'Briefcase',
          sort_order: i + 1,
          metadata: { pensioenType: 'bedrijf', brutoBedrag: r.brutoBedrag, source: 'upo_upload' },
        }))
        const { error: pensionErr } = await supabase.from('life_events').insert(pensionEvents)
        if (pensionErr) console.error('UPO pension life events insert error:', pensionErr)
      }
    }

    // 6b. Insert user-created life events from horizon step (non-AOW, non-pension)
    if (horizonData?.life_events && horizonData.life_events.length > 0) {
      const userEvents = horizonData.life_events
        .filter((e) => e.event_type !== 'aow' && e.event_type !== 'pension') // AOW + pension already handled above
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
          sort_order: i + 1 + (pensionData?.regelingen?.filter(r => r.type === 'ouderdomspensioen').length ?? 0),
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

    // 6e. Markeer horizon-setup als voltooid — zelfde semantiek als het RPC-pad.
    // Non-blocking: zie uitleg in het RPC-pad hierboven.
    try {
      await supabase
        .from('user_feature_visits')
        .upsert(
          { user_id: user.id, feature_slug: HORIZON_SETUP_COMPLETED_SLUG },
          { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
        )
    } catch (horizonFlagErr) {
      console.warn('[onboarding-save] horizon-setup flag upsert failed (non-fatal):', horizonFlagErr)
    }

    // 7. Mark onboarding as completed LAST — only after all data is saved successfully
    // This ensures the idempotency guard doesn't block retries after partial failures
    //
    // In DEZELFDE update gaat de vlag "deze gebruiker heeft de rondleiding nog
    // tegoed" mee (ADR 0130). Bewust hier en niet in een aparte call: het
    // startsignaal van de rondleiding hoort exact zo vers te zijn als
    // `onboarding_completed` zelf — een tweede, mislukbare write zou een deel
    // van de nieuwe gebruikers zonder rondleiding laten landen.
    //
    // De kolom wordt eerst GELEZEN en dan gemerged: `module_guide_state` draagt
    // ook `welcome:guide`, de coachmarks en de coach-staat. Blind overschrijven
    // zou die wissen. Faalt de LEES, dan laten we de kolom met rust: mergen op
    // een lege basis zou bij een her-onboarding of retry alsnog de bestaande
    // sleutels wissen. De gebruiker mist dan hooguit de automatische rondleiding
    // (hij kan 'm zelf starten); het afronden van de onboarding mag hier nooit
    // op stuklopen.
    const { data: guideStateRow, error: guideStateReadErr } = await supabase
      .from('profiles')
      .select('module_guide_state')
      .eq('id', user.id)
      .maybeSingle()
    if (guideStateReadErr) {
      console.warn('[save-own-data] module_guide_state niet leesbaar — rondleiding-vlag overgeslagen', guideStateReadErr.code)
    }

    const { error: completeErr } = await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        ...(guideStateReadErr
          ? {}
          : { module_guide_state: withRondleidingPending(guideStateRow?.module_guide_state) }),
        updated_at: new Date().toISOString(),
      })
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
    return serverError(err, 'onboarding-save-own-data:POST')
  }
}
