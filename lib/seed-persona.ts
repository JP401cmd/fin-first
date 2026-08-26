/**
 * Shared seeding logic for persona data.
 * Used by both admin seed endpoint and onboarding flow.
 *
 * Optimized with batched parallel deletes (5 progress-stappen, batch0..batch4)
 * en phased parallel inserts (4 vaste phases + 2 conditionele) om DB-round-trips
 * te minimaliseren.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonaData, PersonaAsset, PersonaDebt } from '@/lib/test-personas'
import {
  blindIndex,
  encryptField,
  isFieldEncryptionConfigured,
} from '@/lib/crypto/field-encryption'
import { SERVICE_WIPE_TABLES, FULL_ERASE_SERVICE_TABLES } from '@/lib/user-data-tables'

type ProgressCallback = (step: string, table: string, action: string, count?: number) => void

/**
 * Aantal voortgangsstappen (`onProgress`-aanroepen) dat één seed-run doorloopt.
 * De voortgangsbalk deelt `currentStep / totalSteps`, dus dit getal MOET exact
 * gelijk zijn aan het werkelijke aantal `onProgress`-aanroepen — anders schiet
 * de balk boven 100% (te laag total) of blijft die te vroeg op 100% hangen.
 *
 * Was hardgecodeerd als 6 (admin) / 7 (onboarding) terwijl er feitelijk 9-11
 * stappen zijn → balk liep tot ~183%. Nu afgeleid uit dezelfde conditionals die
 * de code hieronder ook gebruikt, zodat teller en aanroepen niet wegdriften.
 *
 * MOET in sync blijven met de `onProgress`-aanroepen verderop:
 *  - `deleteAllUserData` → {@link SEED_DELETE_STEPS} vaste stappen (batch0..batch4)
 *  - `seedPersonaData`   → {@link SEED_INSERT_BASE_STEPS} vaste stappen (phase1..phase4)
 *                          + 1 als de persona `balance_snapshots` heeft (phase4b)
 *                          + 1 als de persona `appSettings` heeft        (phase5)
 */
export const SEED_DELETE_STEPS = 5
export const SEED_INSERT_BASE_STEPS = 4

export function countSeedSteps(persona: PersonaData): number {
  let steps = SEED_DELETE_STEPS + SEED_INSERT_BASE_STEPS
  // Spiegelt exact de `if`-guards rond de conditionele onProgress-aanroepen in
  // seedPersonaData (phase4b / phase5). Bij wijziging dáár: ook hier bijwerken.
  if (persona.balance_snapshots && persona.balance_snapshots.length > 0) steps++
  if (persona.appSettings) steps++
  return steps
}

// ── Helper: relative date from today ──────────────────────────

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function monthsAgoDate(months: number): string {
  const d = new Date()
  d.setDate(1) // Set day to 1st BEFORE changing month to avoid overflow (e.g. Mar 31 → Feb 31 → Mar 3)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().split('T')[0]
}

// ── Helper: persona-asset → DB insert-rij ─────────────────────

/**
 * Transformeer één `PersonaAsset` naar de `assets`-insert-rij. Pure functie zodat
 * de seed-laag en de regressietest exact dezelfde mapping delen (geen
 * her-implementatie die kan wegdriften). Borgt o.a. dat `sale_config` — de SSoT
 * voor verkoop/liquidatie — meegeseed wordt (anders valt een geconfigureerde
 * asset bij resolve terug op de default `wanneer_nodig`).
 */
export function buildSeedAssetRow(a: PersonaAsset, userId: string, sortOrder: number) {
  return {
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
    sort_order: sortOrder,
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
    has_holdings_tracking: a.has_holdings_tracking ?? false,
    // Woonbalans-app opt-in op eigen_huis-assets. Zonder deze mapping bleef de
    // vlag NULL bij seeding ondanks dat de persona 'm op true zet, waardoor de
    // equity-/woonbalans-band in de Hypotheekplanner leeg rendert
    // (hypotheekplanner-tab.tsx filtert op has_woonbalans_tracking === true).
    // Spiegelt has_holdings_tracking hierboven.
    has_woonbalans_tracking: a.has_woonbalans_tracking ?? false,
    sale_config: a.sale_config ?? null,
    // Deelneming-velden (asset_type='deelneming'): zonder deze mapping bleven
    // kvk_number/ownership_percentage/annual_dividend bij seeding altijd NULL,
    // waardoor de Box 2-aanslag geen datapad had (bug WF-BELAST-13).
    kvk_number: a.kvk_number ?? null,
    ownership_percentage: a.ownership_percentage ?? null,
    annual_dividend: a.annual_dividend ?? null,
  }
}

/**
 * Transformeer één persona-bankrekening naar de bijbehorende `assets`-insert-rij
 * (het cash-asset). Pure functie — net als `buildSeedAssetRow` — zodat de seed-
 * insert én de schema-preflight exact dezelfde kolomset delen. `assets` heeft
 * hiermee twee producers (deze + `buildSeedAssetRow`); zonder een gedeelde builder
 * bleef deze — als éérste ingevoegde — set stil buiten de preflight (review-H1).
 * De encryptievelden volgen dezelfde configuratie-conditie als de rest van de seed.
 */
export function buildSeedCashAssetRow(
  ba: PersonaData['bank_accounts'][number],
  userId: string,
  budgetsActive: boolean,
) {
  const encrypted =
    isFieldEncryptionConfigured() && ba.iban
      ? { account_number_encrypted: encryptField(ba.iban), account_number_hash: blindIndex(ba.iban) }
      : {}
  return {
    user_id: userId,
    name: ba.name,
    asset_type: 'cash' as const,
    current_value: ba.balance,
    purchase_value: ba.balance,
    expected_return: 0,
    monthly_contribution: 0,
    institution: ba.bank_name,
    // GEEN `account_number: ba.iban` meer. Die plaintext-kolom wordt gedropt
    // zodra de live bankkoppeling-tests rond zijn; een seed die 'm nog vult is
    // dan de enige schrijver die de DROP tegenhoudt. Het rekeningnummer reist
    // uitsluitend nog als `account_number_encrypted` + `account_number_hash`
    // (hieronder), en élke lezer haalt het al langs die weg op.
    ...encrypted,
    is_active: ba.is_active,
    sort_order: ba.sort_order,
    ownership: 'personal' as const,
    net_worth_inclusion_pct: 100,
    is_liquid: true,
    subtype: ba.account_type,
    has_budget_tracking: budgetsActive,
  }
}

/**
 * Transformeer één persona-bankrekening naar de `bank_accounts`-insert-rij.
 *
 * Bestaat als EXPLICIETE builder omdat de vorige vorm — `{ user_id, ...a, … }` —
 * de plaintext `iban`-kolom stilzwijgend meeschreef: `PersonaBankAccount` draagt
 * een `iban`-veld, dus de spread vulde de kolom zonder haar naam ooit te noemen.
 * Een schrijver die geen enkele grep op `iban:` oplevert is precies de soort die
 * een kolom-drop later laat klappen. Nu staat elke kolom er met de hand, en is
 * de afwezigheid van `iban` een testbaar feit ({@link buildSeedBankAccountRow}
 * heeft een eigen assertie in `seed-persona.test.ts`).
 *
 * De persona blijft de leesbare IBAN als BRON dragen — hij gaat alleen nog
 * versleuteld de database in, onder dezelfde configuratie-conditie als de rest
 * van de seed (zie {@link buildSeedCashAssetRow}). Zonder sleutels in de omgeving
 * krijgt de rij géén rekeningnummer; dat is bewust, want zonder sleutel is er
 * geen kolom die het veilig kan dragen.
 */
export function buildSeedBankAccountRow(
  ba: PersonaData['bank_accounts'][number],
  userId: string,
  linkedAssetId: string | null,
) {
  const encrypted =
    isFieldEncryptionConfigured() && ba.iban
      ? { iban_encrypted: encryptField(ba.iban), iban_hash: blindIndex(ba.iban) }
      : {}
  return {
    user_id: userId,
    name: ba.name,
    bank_name: ba.bank_name,
    account_type: ba.account_type,
    balance: ba.balance,
    is_active: ba.is_active,
    sort_order: ba.sort_order,
    ...encrypted,
    linked_asset_id: linkedAssetId,
  }
}

// ── Helper: persona-debt → DB insert-rij ──────────────────────

/**
 * Transformeer één `PersonaDebt` naar de `debts`-insert-rij. Pure functie —
 * net als `buildSeedAssetRow` — zodat de seed-laag en de regressietest exact
 * dezelfde mapping delen (geen her-implementatie die kan wegdriften). Borgt
 * o.a. dat `has_hypotheekplanner_tracking` — de per-schuld opt-in voor de
 * Hypotheekplanner-app — meegeseed wordt (anders bleef de vlag NULL ondanks
 * dat de persona 'm op true zet, waardoor de planner leeg rendert;
 * hypotheekplanner-tab.tsx filtert op has_hypotheekplanner_tracking === true).
 */
export function buildSeedDebtRow(d: PersonaDebt, userId: string, sortOrder: number) {
  return {
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
    sort_order: sortOrder,
    subtype: d.subtype || null,
    is_tax_deductible: d.is_tax_deductible ?? null,
    fixed_rate_end_date: d.fixed_rate_end_date || null,
    nhg: d.nhg ?? null,
    credit_limit: d.credit_limit ?? null,
    repayment_type: d.repayment_type || null,
    draagkrachtmeting_date: d.draagkrachtmeting_date || null,
    // Hypotheekplanner-app opt-in op mortgage-schulden. Spiegelt
    // has_woonbalans_tracking op de gekoppelde eigen_huis-asset; samen gaten ze
    // de equity-/woonbalans-band in de planner (bug: vlaggen werden bij seeding
    // niet weggeschreven).
    has_hypotheekplanner_tracking: d.has_hypotheekplanner_tracking ?? false,
  }
}

// ── Helper: delete from table ─────────────────────────────────

/**
 * FAIL-FAST: een gefaalde delete gooit en stopt de hele wipe/seed. Stil
 * doorgaan (voorheen alleen console.warn) betekende dat een seed bovenop
 * niet-gewiste data inserte — zo bleven persona-bankrekeningen en
 * -transacties als "echte" bezittingen achter op een account (13 jul 2026).
 * Elke consumer (onboarding-reset, persona-seeds, account-delete) vangt de
 * throw al af en meldt de fout aan de gebruiker.
 */
async function deleteTable(supabase: SupabaseClient, table: string, userId: string): Promise<number> {
  // budget_amounts has no user_id column; cascade via budgets
  if (table === 'budget_amounts') {
    const { data: budgetIds, error: lookupError } = await supabase
      .from('budgets')
      .select('id')
      .eq('user_id', userId)
    if (lookupError) {
      throw new Error(`[seed] Wissen van budget_amounts mislukt (budgets-lookup): ${lookupError.message}`)
    }
    const ids = (budgetIds ?? []).map((b) => b.id)
    if (ids.length === 0) return 0
    const { count, error } = await supabase
      .from('budget_amounts')
      .delete({ count: 'exact' })
      .in('budget_id', ids)
    if (error) {
      throw new Error(`[seed] Wissen van budget_amounts mislukt: ${error.message}`)
    }
    return count ?? 0
  }

  const { count, error } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq('user_id', userId)
  if (error) {
    throw new Error(`[seed] Wissen van ${table} mislukt: ${error.message}`)
  }
  return count ?? 0
}

/**
 * Best-effort service-role wipe voor persoonlijke/log-tabellen ZONDER eigen-rij
 * DELETE-policy (net_worth_history, feedback en — bij full-erase — de retentie-
 * tabellen). Via de sessie-client zouden deze een stille no-op zijn; de service-
 * role omzeilt RLS. Bewust throw-vrij: een gefaalde log-wipe mag het AVG-
 * verwijderrecht van de gebruiker niet blokkeren (de DB-cascade uit migratie
 * 20260721140000 is het vangnet). Fouten worden server-side gelogd.
 */
async function serviceWipeTable(service: SupabaseClient, table: string, userId: string): Promise<number> {
  try {
    const { count, error } = await service
      .from(table)
      .delete({ count: 'exact' })
      .eq('user_id', userId)
    if (error) {
      console.error(`[seed] service-wipe van ${table} mislukt: ${error.message}`)
      return 0
    }
    return count ?? 0
  } catch (err) {
    console.error(`[seed] service-wipe van ${table} gooide:`, err)
    return 0
  }
}

/**
 * Opties voor {@link deleteAllUserData}.
 * - `service`: service-role-client om de RLS-afgeschermde persoonlijke tabellen
 *   (net_worth_history, feedback) te wissen die de sessie-client niet kan raken.
 *   Zonder deze client worden die tabellen overgeslagen (dev/seed-paden).
 * - `fullErase`: bij een VOLLEDIGE accountverwijdering ook de retentie-/log-
 *   tabellen per gebruiker wissen (ai_token_usage, ai_usage, error_logs,
 *   web_vitals) zodat er geen identifier achterblijft. Vereist `service`.
 */
export interface DeleteAllUserDataOptions {
  service?: SupabaseClient
  fullErase?: boolean
}

/**
 * Delete all user data from all financial tables.
 * Uses batched parallel deletes respecting FK constraints:
 * 1a) deepest leaves (goal_contributions, category_corrections)
 * 1b) leaf tables (goals, snapshots, events, etc.)
 * 2) mid-level (actions, transactions, budget_amounts)
 * 2c) aanvullende user-scoped tabellen (koppelingen, calculators, legacy holdings)
 * 3) parent tables (recommendations, debts, assets, bank_accounts, budgets)
 *
 * De verzameling gewiste tabellen wordt bewaakt door de dekkings-vitest
 * lib/user-data-tables.test.ts (elke user-scoped tabel valt in precies één
 * partitie). Zie lib/user-data-tables.ts voor de single source.
 */
export async function deleteAllUserData(
  supabase: SupabaseClient,
  userId: string,
  onProgress?: ProgressCallback,
  opts?: DeleteAllUserDataOptions,
): Promise<Record<string, number>> {
  const summary: Record<string, number> = {}

  // Batch 0: tables with no FK to other user tables + holding children (FK to *_holdings)
  // investment_transactions, crypto_transactions, holding_alerts must be deleted before *_holdings
  // target_allocations has user_id only (no FK to holdings)
  const batch0Results = await Promise.all([
    deleteTable(supabase, 'investment_transactions', userId),
    deleteTable(supabase, 'crypto_transactions', userId),
    deleteTable(supabase, 'holding_alerts', userId),
    deleteTable(supabase, 'target_allocations', userId),
    deleteTable(supabase, 'user_feature_visits', userId),
    deleteTable(supabase, 'next_step_completions', userId),
  ])
  const batch0Tables = ['investment_transactions', 'crypto_transactions', 'holding_alerts', 'target_allocations', 'user_feature_visits', 'next_step_completions']
  for (let i = 0; i < batch0Tables.length; i++) {
    summary[batch0Tables[i]] = batch0Results[i]
  }

  // Batch 0b: investment_holdings + crypto_holdings (FK to assets, must be deleted before assets)
  const [investmentHoldingsResult, cryptoHoldingsResult] = await Promise.all([
    deleteTable(supabase, 'investment_holdings', userId),
    deleteTable(supabase, 'crypto_holdings', userId),
  ])
  summary.investment_holdings = investmentHoldingsResult
  summary.crypto_holdings = cryptoHoldingsResult

  onProgress?.('Gebruikersdata verwijderen...', 'batch0', 'delete',
    batch0Results.reduce((a, b) => a + b, 0) + investmentHoldingsResult + cryptoHoldingsResult)

  // Batch 1a: deepest leaf tables (FK to goals, budgets)
  const batch1aResults = await Promise.all([
    deleteTable(supabase, 'goal_contributions', userId),
    deleteTable(supabase, 'category_corrections', userId),
  ])
  const batch1aTables = ['goal_contributions', 'category_corrections']
  for (let i = 0; i < batch1aTables.length; i++) {
    summary[batch1aTables[i]] = batch1aResults[i]
  }

  // Batch 1b: leaf tables (no FK dependencies to other user tables)
  const batch1bResults = await Promise.all([
    deleteTable(supabase, 'recommendation_feedback', userId),
    deleteTable(supabase, 'budget_rollovers', userId),
    deleteTable(supabase, 'recurring_transactions', userId),
    deleteTable(supabase, 'valuations', userId),
    deleteTable(supabase, 'net_worth_snapshots', userId),
    deleteTable(supabase, 'balance_snapshots', userId),
    deleteTable(supabase, 'life_events', userId),
    deleteTable(supabase, 'goals', userId),
    deleteTable(supabase, 'news_editions', userId),
  ])
  const batch1bTables = ['recommendation_feedback', 'budget_rollovers', 'recurring_transactions', 'valuations', 'net_worth_snapshots', 'balance_snapshots', 'life_events', 'goals', 'news_editions']
  for (let i = 0; i < batch1bTables.length; i++) {
    summary[batch1bTables[i]] = batch1bResults[i]
  }
  onProgress?.('Basisgegevens verwijderen...', 'batch1', 'delete',
    batch1aResults.reduce((a, b) => a + b, 0) + batch1bResults.reduce((a, b) => a + b, 0))

  // Batch 2: mid-level (FK to recommendations, budgets)
  const batch2Results = await Promise.all([
    deleteTable(supabase, 'actions', userId),
    deleteTable(supabase, 'transactions', userId),
    deleteTable(supabase, 'budget_amounts', userId),
    // spend_limits vóór budgets (batch 3): budget-potten cascaden weliswaar mee,
    // maar tegenpartij-potten (budget_id NULL) zouden een reset anders overleven —
    // en de tabel staat in SESSION_WIPE_TABLES (AVG-wis, zie lib/user-data-tables.ts).
    deleteTable(supabase, 'spend_limits', userId),
  ])
  const batch2Tables = ['actions', 'transactions', 'budget_amounts', 'spend_limits']
  for (let i = 0; i < batch2Tables.length; i++) {
    summary[batch2Tables[i]] = batch2Results[i]
  }
  onProgress?.('Transacties & acties verwijderen...', 'batch2', 'delete', batch2Results.reduce((a, b) => a + b, 0))

  // Batch 2b: Bank connection tables (FK chain: bank_sync_log → bank_connection_accounts → bank_connections/bank_accounts)
  // Must be deleted before bank_accounts (batch 3) because bank_connection_accounts.bank_account_id has ON DELETE NO ACTION
  const syncLogResult = await deleteTable(supabase, 'bank_sync_log', userId)
  summary.bank_sync_log = syncLogResult
  const connAccountsResult = await deleteTable(supabase, 'bank_connection_accounts', userId)
  summary.bank_connection_accounts = connAccountsResult
  const connectionsResult = await deleteTable(supabase, 'bank_connections', userId)
  summary.bank_connections = connectionsResult

  // Batch 2c: aanvullende user-scoped tabellen die een reset eerder OVERLEEFDEN
  // (o.a. exchange_connections met API-keys!, wallet_addresses, broker_connections,
  // custom_calculators). Allemaal via de sessie-client wisbaar (eigen-rij DELETE-
  // policy geverifieerd). FK-veilige sub-orde: children vóór parents, en álle
  // vóór batch 3 omdat de koppelings-/legacy-tabellen CASCADE-en naar `assets`.
  // Geen eigen onProgress-tick (SEED_DELETE_STEPS blijft 5, voortgangsbalk-teller).
  const batch2cChildren = await Promise.all([
    deleteTable(supabase, 'calculator_likes', userId),
    deleteTable(supabase, '_legacy_holding_transactions', userId),
  ])
  summary.calculator_likes = batch2cChildren[0]
  summary._legacy_holding_transactions = batch2cChildren[1]

  const batch2cTables = [
    'custom_calculators',
    '_legacy_holdings',
    'exchange_connections',
    'wallet_addresses',
    'broker_connections',
    'external_data_sources',
    'ai_calculator_usage',
    'news_feedback',
    'questionnaire_sessions',
    'report_configs',
    'user_own_ibans',
  ]
  const batch2cResults = await Promise.all(
    batch2cTables.map((t) => deleteTable(supabase, t, userId)),
  )
  for (let i = 0; i < batch2cTables.length; i++) {
    summary[batch2cTables[i]] = batch2cResults[i]
  }

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

  onProgress?.('Hoofdtabellen verwijderen...', 'batch3', 'delete',
    syncLogResult + connAccountsResult + connectionsResult + batch3Results.reduce((a, b) => a + b, 0))

  // Batch 4: per-user app_settings rows (news cache, briefing prefs, notifications history,
  // sovereignty level, monthly check-ins, partner notif prefs, household privacy, reminders…).
  // These are scattered across many keys, all containing the user id. A single LIKE wipes them.
  const { count: settingsCount, error: settingsErr } = await supabase
    .from('app_settings')
    .delete({ count: 'exact' })
    .like('key', `%${userId}%`)
  if (settingsErr) {
    throw new Error(`[seed] Wissen van app_settings mislukt: ${settingsErr.message}`)
  }
  summary.app_settings = settingsCount ?? 0
  onProgress?.('App-instellingen wissen...', 'batch4', 'delete', settingsCount ?? 0)

  // Batch 5 (service-role): persoonlijke tabellen ZONDER eigen-rij DELETE-policy
  // die de sessie-client niet kan wissen (net_worth_history, feedback). Alleen
  // uitgevoerd als de aanroeper een service-client meegeeft (account-delete,
  // onboarding-reset). Bij een VOLLEDIGE accountverwijdering (`fullErase`) ook de
  // retentie-/log-tabellen zodat er geen identifier achterblijft (AVG-wissing).
  if (opts?.service) {
    const serviceTables = opts.fullErase ? FULL_ERASE_SERVICE_TABLES : SERVICE_WIPE_TABLES
    for (const table of serviceTables) {
      summary[table] = await serviceWipeTable(opts.service, table, userId)
    }
  }

  return summary
}

/**
 * Fout die de seed-preflight gooit wanneer de verbonden DB een kolom mist die de
 * seed schrijft (schema-drift). De boodschap is bewust gecureerd (geen rauwe
 * Postgres-melding, ADR 0044) en veilig om aan de superadmin te tonen.
 */
export class SeedSchemaError extends Error {
  constructor(
    public readonly table: string,
    public readonly column: string,
  ) {
    super(
      `Schema-drift: kolom "${column}" ontbreekt op tabel "${table}". De seed is ` +
        `afgebroken vóór het wissen van je data. Pas de ontbrekende migratie(s) toe ` +
        `(supabase/migrations) en herlaad de PostgREST-schemacache, en probeer opnieuw.`,
    )
    this.name = 'SeedSchemaError'
  }
}

/**
 * Preflight vóór de destructieve wipe (fail-safe tegen schema-drift).
 *
 * `deleteAllUserData` wist eerst álle accountdata en pas dáárna volgen de inserts;
 * ontbreekt een kolom die de seed schrijft, dan faalt de insert en blijft het
 * account leeg-maar-niet-hersteld achter (de infra-S1 uit de UAT-run van 17 jul).
 * Deze check SELECT't per drift-gevoelige tabel (assets, debts — de type-rijke
 * tabellen waar migraties kolommen aan toevoegen) exact de kolomset die de seed
 * gaat schrijven, afgeleid uit dezelfde builder-functies (geen hardcoded lijst die
 * kan wegdriften). PostgREST geeft 42703 als een kolom ontbreekt — vóórdat er iets
 * gewist is. Gooit dan `SeedSchemaError` zodat de aanroeper de wipe kan overslaan.
 */
export async function assertSeedSchema(
  supabase: SupabaseClient,
  userId: string,
  persona: PersonaData,
): Promise<void> {
  const probes: { table: string; columns: string[] }[] = []

  // `assets` heeft TWEE producers: buildSeedAssetRow (persona.assets) én
  // buildSeedCashAssetRow (persona.bank_accounts, als eerste ingevoegd). Probe de
  // UNIE van beide kolomsets en gate op beide bronnen — anders blijft de eerste
  // post-wipe insert (cash-assets) ongedekt (review-H1).
  const assetColumns = new Set<string>()
  if (persona.assets.length > 0) {
    for (const c of Object.keys(buildSeedAssetRow(persona.assets[0], userId, 0))) assetColumns.add(c)
  }
  if (persona.bank_accounts.length > 0) {
    for (const c of Object.keys(buildSeedCashAssetRow(persona.bank_accounts[0], userId, persona.budgets.length > 0))) {
      assetColumns.add(c)
    }
  }
  if (assetColumns.size > 0) probes.push({ table: 'assets', columns: [...assetColumns] })

  if (persona.debts.length > 0) {
    // Tweede debts-writer: de linked_asset_id-update (koppelt hypotheek aan huis).
    const debtColumns = new Set(Object.keys(buildSeedDebtRow(persona.debts[0], userId, 0)))
    debtColumns.add('linked_asset_id')
    probes.push({ table: 'debts', columns: [...debtColumns] })
  }

  for (const probe of probes) {
    // limit(0): puur een kolom-existentiecheck, haalt geen rijen op.
    const { error } = await supabase.from(probe.table).select(probe.columns.join(', ')).limit(0)
    if (error) {
      // Haal de ontbrekende kolomnaam best-effort uit de PostgREST-melding
      // ("column assets.x does not exist" of "Could not find the 'x' column").
      const colMatch =
        error.message?.match(/column\s+"?[a-z0-9_]*\.?([a-z0-9_]+)"?\s+does not exist/i) ||
        error.message?.match(/'([a-z0-9_]+)'\s+column/i)
      throw new SeedSchemaError(probe.table, colMatch ? colMatch[1] : 'onbekend')
    }
  }
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

  const profileData: Record<string, unknown> = {
    id: userId,
    full_name: persona.profile.full_name,
    date_of_birth: persona.profile.date_of_birth,
    household_type: persona.profile.household_type,
    temporal_balance: persona.profile.temporal_balance,
    updated_at: new Date().toISOString(),
  }

  // FIRE parameters (optional, per-persona)
  if (persona.profile.expected_return != null) profileData.expected_return = persona.profile.expected_return
  if (persona.profile.inflation_rate != null) profileData.inflation_rate = persona.profile.inflation_rate
  if (persona.profile.fire_end_strategy) profileData.fire_end_strategy = persona.profile.fire_end_strategy
  if (persona.profile.fire_end_age != null) profileData.fire_end_age = persona.profile.fire_end_age
  if (persona.profile.fire_legacy_amount != null) profileData.fire_legacy_amount = persona.profile.fire_legacy_amount
  if (persona.profile.retirement_expense_method) profileData.retirement_expense_method = persona.profile.retirement_expense_method
  if (persona.profile.retirement_expense_custom_amount != null) profileData.retirement_expense_custom_amount = persona.profile.retirement_expense_custom_amount

  // Withdrawal strategy
  if (persona.profile.withdrawal_strategy) profileData.withdrawal_strategy = persona.profile.withdrawal_strategy
  if (persona.profile.guardrail_floor != null) profileData.guardrail_floor = persona.profile.guardrail_floor
  if (persona.profile.guardrail_ceiling != null) profileData.guardrail_ceiling = persona.profile.guardrail_ceiling
  if (persona.profile.guardrail_cut_step != null) profileData.guardrail_cut_step = persona.profile.guardrail_cut_step
  if (persona.profile.guardrail_raise_step != null) profileData.guardrail_raise_step = persona.profile.guardrail_raise_step

  // Profile income/expense estimates
  if (persona.profile.net_monthly_income != null) profileData.net_monthly_income = persona.profile.net_monthly_income
  if (persona.profile.estimated_monthly_expenses != null) profileData.estimated_monthly_expenses = persona.profile.estimated_monthly_expenses

  // Budgeting active — derived from whether persona has budgets
  profileData.budgeting_active = persona.budgets.length > 0

  // Onboarding completed — personas represent post-onboarding state
  profileData.onboarding_completed = true

  // Feature preferences (JSONB)
  profileData.feature_preferences = {
    ...(typeof persona.profile.feature_preferences === 'object' ? persona.profile.feature_preferences : {}),
  }

  // Marginaal tarief (optional, per-persona — null means auto-derived)
  if (persona.profile.marginaal_tarief != null) profileData.marginaal_tarief = persona.profile.marginaal_tarief

  // Rebalancing threshold (optional, per-persona)
  if (persona.profile.rebalance_threshold != null) profileData.rebalance_threshold = persona.profile.rebalance_threshold

  // Widget dashboard preferences (optional, per-persona)
  if (persona.profile.widget_prefs) profileData.widget_prefs = persona.profile.widget_prefs

  // Active modules (module system)
  profileData.active_modules = persona.profile.active_modules

  // Reset de wekelijkse briefing-snapshot bij (her)seed. Een stale/lage snapshot
  // van vóór de reseed zou tegen het nieuwe (verse) vrijheidstotaal worden
  // afgezet en een onmogelijke week-delta tonen ("41261 dagen vrijheid erbij") —
  // het 'delta ≈ totaal'-lek uit KRUIS-17. Null wist het meetpunt; de eerste
  // /overzicht-load van de nieuwe persona schrijft een verse week-snapshot.
  profileData.briefing_snapshot = null

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profileData)
  if (profileError) throw new Error(`Profiel update mislukt: ${profileError.message}`)
  summary.profiles = 1

  // ── Phase 1a: Cash assets first (bank_accounts need their IDs) ──

  // Field-encryption is OPTIONAL during seeding so local dev / CI without
  // ENCRYPTION_KEY_V1 doesn't crash. Production seeds (and any environment
  // where the keys are configured) will populate the encrypted columns so
  // the seeded persona is testable end-to-end through the post-PR2 code
  // paths that no longer read the plaintext IBAN column.
  //
  // We only spread the encrypted/hash fields into the row literal when keys
  // are present — that way an env without the migration applied yet (e.g. a
  // dev DB that hasn't run `db push`) doesn't error on "column does not
  // exist" for unrelated test data.
  const cashAssetRows = persona.bank_accounts.map((ba) =>
    // Gedeelde builder met de schema-preflight (assertSeedSchema) — geen tweede,
    // stil-wegdriftende kolomset. account_number_encrypted/hash volgen dezelfde
    // encryptie-conditie als voorheen (isFieldEncryptionConfigured() && iban).
    buildSeedCashAssetRow(ba, userId, persona.budgets.length > 0),
  )

  let cashAssetIds: string[] = []
  if (cashAssetRows.length > 0) {
    const { data: cashAssets, error: cashErr } = await supabase
      .from('assets')
      .insert(cashAssetRows)
      .select('id')
    if (cashErr) throw new Error(`Cash assets insert mislukt: ${cashErr.message}`)
    cashAssetIds = (cashAssets ?? []).map((a) => a.id)
  }

  // ── Phase 1b: Independent inserts (parallel) ─────────────────

  const accountRows = persona.bank_accounts.map((ba, i) =>
    buildSeedBankAccountRow(ba, userId, cashAssetIds[i] ?? null),
  )

  const assetRows = persona.assets.map((a, i) => buildSeedAssetRow(a, userId, i))

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
    // `{}` = de DB-default; behoudt de standaard-doel-marker waar de persona 'm zet
    // (bv. `standaardDoel: 'vrijheidsgetal'` → live FIRE-tracker, bevinding C10).
    metadata: g.metadata ?? {},
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
    is_indexed: e.is_indexed ?? false,
    metadata: e.metadata ?? {},
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
  summary.assets = (insertedAssets?.length ?? 0) + cashAssetIds.length
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

  // Link verkoop-life-events to the asset they liquidate via linked_asset_id.
  // Positionele koppeling: eventsResult bewaart de insert-volgorde van
  // persona.life_events. Spiegelt de hypotheek→asset-koppeling hierboven, zodat de
  // v2-grootboek-engine het juiste asset uit het grootboek liquideert.
  const insertedEvents = eventsResult.data
  if (insertedEvents) {
    const eventLinkPromises = []
    for (let i = 0; i < persona.life_events.length; i++) {
      const eventDef = persona.life_events[i]
      const assetId = eventDef.linked_asset_name ? assetNameToId[eventDef.linked_asset_name] : undefined
      if (assetId && insertedEvents[i]) {
        eventLinkPromises.push(
          supabase
            .from('life_events')
            .update({ linked_asset_id: assetId })
            .eq('id', insertedEvents[i].id)
            .then(),
        )
      }
    }
    if (eventLinkPromises.length > 0) await Promise.all(eventLinkPromises)
  }

  // ── Phase 2: Dependent inserts (parallel where possible) ────

  // Debts need asset IDs for linking
  const debtNameToId: Record<string, string> = {}
  async function insertDebts() {
    if (persona.debts.length === 0) {
      summary.debts = 0
      return
    }

    const debtRows = persona.debts.map((d, i) => buildSeedDebtRow(d, userId, i))
    const { data: insertedDebts, error: debtErr } = await supabase
      .from('debts')
      .insert(debtRows)
      .select('id, name')
    if (debtErr) throw new Error(`Schulden insert mislukt: ${debtErr.message}`)
    summary.debts = insertedDebts?.length ?? 0

    if (insertedDebts) {
      for (let i = 0; i < insertedDebts.length; i++) {
        debtNameToId[insertedDebts[i].name] = insertedDebts[i].id
      }
    }

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
    // Delete all existing budgets for this user first, then plain insert.
    // This avoids ON CONFLICT mismatches with the composite unique index
    // (user_id, slug, COALESCE(parent_id, ...)) from migration 20260319000001.
    await supabase.from('budgets').delete().eq('user_id', userId)

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

  // ── Phase 3: Transactions (needs account IDs + budget slug→ID map) ──

  const accountIds = insertedAccounts?.map((a: { id: string }) => a.id) ?? []

  if (accountIds.length > 0) {
    const txRows = persona.transactions.map((t) => ({
      user_id: userId,
      account_id: accountIds[t.accountIndex ?? 0] ?? accountIds[0],
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

  // ── Phase 4: Valuations, Holdings ────────────────────

  // Valuations
  if (persona.valuations && persona.valuations.length > 0) {
    const valuationRows = persona.valuations.map((v) => ({
      user_id: userId,
      entity_type: v.entity_type,
      entity_id: assetNameToId[v.assetName],
      valuation_date: monthsAgoDate(v.monthsAgo),
      value: v.value,
    }))
    // Filter out any with missing entity_id
    const validRows = valuationRows.filter((r) => r.entity_id)
    if (validRows.length > 0) {
      const { error: valErr } = await supabase.from('valuations').insert(validRows)
      if (valErr) throw new Error(`Valuations insert mislukt: ${valErr.message}`)
    }
    summary.valuations = validRows.length
  }

  // Holdings + Holding Transactions
  // Routes per asset_type: 'crypto' → crypto_holdings + crypto_transactions,
  // anders → investment_holdings + investment_transactions.
  // (Migration 20260502000003 splitste de oude `holdings`/`holding_transactions` tabellen.)
  if (persona.holdings && persona.holdings.length > 0) {
    const assetNameToType: Record<string, string> = {}
    for (const a of persona.assets) {
      assetNameToType[a.name] = a.asset_type
    }

    let investmentHoldingCount = 0
    let cryptoHoldingCount = 0
    let investmentTxCount = 0
    let cryptoTxCount = 0

    for (const h of persona.holdings) {
      const assetId = assetNameToId[h.assetName]
      if (!assetId) continue
      const assetType = assetNameToType[h.assetName] ?? 'investment'
      const isCrypto = assetType === 'crypto'

      let holdingData: { id: string } | null = null

      if (isCrypto) {
        const cryptoRow: Record<string, unknown> = {
          user_id: userId,
          asset_id: assetId,
          symbol: h.ticker ?? h.name,
          name: h.name,
          units: h.units,
          avg_purchase_price: h.avg_purchase_price,
          current_price: h.current_price,
          is_active: true,
        }
        if (h.is_favorite != null) cryptoRow.is_favorite = h.is_favorite

        const { data, error } = await supabase
          .from('crypto_holdings')
          .insert(cryptoRow)
          .select('id')
          .single()
        if (error) throw new Error(`Crypto holding "${h.name}" insert mislukt: ${error.message}`)
        holdingData = data
        cryptoHoldingCount++
      } else {
        const investmentRow: Record<string, unknown> = {
          user_id: userId,
          asset_id: assetId,
          ticker: h.ticker ?? h.name,
          isin: h.isin,
          name: h.name,
          units: h.units,
          avg_purchase_price: h.avg_purchase_price,
          current_price: h.current_price,
          purchase_date: monthsAgoDate(h.purchase_date_monthsAgo),
          is_active: true,
        }
        if (h.asset_class) investmentRow.asset_class = h.asset_class
        if (h.sector !== undefined) investmentRow.sector = h.sector
        if (h.geography) investmentRow.geography = h.geography
        if (h.is_favorite != null) investmentRow.is_favorite = h.is_favorite
        if (h.currency) investmentRow.currency = h.currency
        if (h.ter != null) investmentRow.ter = h.ter
        if (h.ter_source) investmentRow.ter_source = h.ter_source

        const { data, error } = await supabase
          .from('investment_holdings')
          .insert(investmentRow)
          .select('id')
          .single()
        if (error) throw new Error(`Investment holding "${h.name}" insert mislukt: ${error.message}`)
        holdingData = data
        investmentHoldingCount++
      }

      if (!holdingData) throw new Error(`Holding "${h.name}" insert returned no data`)

      if (h.transactions.length > 0) {
        const txRows = h.transactions.map((ht) => ({
          holding_id: holdingData.id,
          user_id: userId,
          type: ht.type,
          units: ht.units,
          price_per_unit: ht.price_per_unit,
          total_amount: ht.total_amount,
          date: monthsAgoDate(ht.monthsAgo),
          notes: ht.notes,
        }))
        const targetTable = isCrypto ? 'crypto_transactions' : 'investment_transactions'
        const { error: htErr } = await supabase.from(targetTable).insert(txRows)
        if (htErr) throw new Error(`Holding transacties insert mislukt (${targetTable}): ${htErr.message}`)
        if (isCrypto) cryptoTxCount += txRows.length
        else investmentTxCount += txRows.length
      }
    }
    summary.investment_holdings = investmentHoldingCount
    summary.crypto_holdings = cryptoHoldingCount
    summary.investment_transactions = investmentTxCount
    summary.crypto_transactions = cryptoTxCount
  }

  // Target Allocations (for rebalancing)
  if (persona.target_allocations && persona.target_allocations.length > 0) {
    const taRows = persona.target_allocations.map((ta) => ({
      user_id: userId,
      view_mode: ta.view_mode,
      category: ta.category,
      target_pct: ta.target_pct,
    }))
    const { error: taErr } = await supabase
      .from('target_allocations')
      .upsert(taRows, { onConflict: 'user_id,view_mode,category' })
    if (taErr) throw new Error(`Target allocations upsert mislukt: ${taErr.message}`)
    summary.target_allocations = taRows.length
  }

  onProgress('Waarderingen & holdings toevoegen...', 'phase4', 'insert',
    (summary.valuations ?? 0)
    + (summary.investment_holdings ?? 0)
    + (summary.crypto_holdings ?? 0)
    + (summary.investment_transactions ?? 0)
    + (summary.crypto_transactions ?? 0)
    + (summary.target_allocations ?? 0))

  // ── Phase 4b: Balance snapshots (per-entiteit, voedt sparkline) ──
  // Vereist alle entity-IDs (cash, regular assets, debts) — wordt daarom
  // pas gedraaid nadat assets+debts compleet zijn ingeladen. Onbekende
  // namen worden stilzwijgend overgeslagen zodat oude persona's zonder
  // deze data niet breken.
  if (persona.balance_snapshots && persona.balance_snapshots.length > 0) {
    const cashAssetNameToId: Record<string, string> = {}
    for (let i = 0; i < persona.bank_accounts.length; i++) {
      const id = cashAssetIds[i]
      if (id) cashAssetNameToId[persona.bank_accounts[i].name] = id
    }
    const assetNameToSubtype: Record<string, string> = {}
    for (const a of persona.assets) assetNameToSubtype[a.name] = a.asset_type
    for (const ba of persona.bank_accounts) assetNameToSubtype[ba.name] = 'cash'
    const debtNameToSubtype: Record<string, string> = {}
    for (const d of persona.debts) debtNameToSubtype[d.name] = d.debt_type

    const balanceRows = persona.balance_snapshots
      .map((s) => {
        let entityId: string | undefined
        let entitySubtype: string | undefined
        if (s.entity_type === 'asset') {
          entityId = assetNameToId[s.entityName] ?? cashAssetNameToId[s.entityName]
          entitySubtype = assetNameToSubtype[s.entityName]
        } else {
          entityId = debtNameToId[s.entityName]
          entitySubtype = debtNameToSubtype[s.entityName]
        }
        if (!entityId) return null
        return {
          user_id: userId,
          snapshot_date: monthsAgoDate(s.monthsAgo),
          entity_type: s.entity_type,
          entity_id: entityId,
          entity_name: s.entityName,
          entity_subtype: entitySubtype ?? null,
          balance: s.balance,
          net_worth_inclusion_pct: 100,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (balanceRows.length > 0) {
      // Insert in batches om eventuele payload-limits te respecteren.
      let bsCount = 0
      for (let i = 0; i < balanceRows.length; i += 100) {
        const batch = balanceRows.slice(i, i + 100)
        const { error: bsErr } = await supabase
          .from('balance_snapshots')
          .upsert(batch, { onConflict: 'user_id,snapshot_date,entity_type,entity_id' })
        if (bsErr) throw new Error(`Balance snapshots insert mislukt (batch ${Math.floor(i / 100)}): ${bsErr.message}`)
        bsCount += batch.length
      }
      summary.balance_snapshots = bsCount
    } else {
      summary.balance_snapshots = 0
    }
    onProgress('Balans-snapshots toevoegen...', 'phase4b', 'insert', summary.balance_snapshots)
  }

  // ── Phase 5: App settings (scenarios, preferences) ──────────

  // Seed app_settings for personas with saved scenarios
  if (persona.appSettings) {
    let appSettingsCount = 0
    for (const [keyTemplate, value] of Object.entries(persona.appSettings)) {
      const key = keyTemplate.replace('PLACEHOLDER', userId)
      const { error: settingsErr } = await supabase
        .from('app_settings')
        .upsert(
          { key, value },
          { onConflict: 'key' },
        )
      if (settingsErr) throw new Error(`App settings upsert mislukt (key: ${key}): ${settingsErr.message}`)
      appSettingsCount++
    }
    summary.app_settings = appSettingsCount
    onProgress('App-instellingen toevoegen...', 'phase5', 'insert', appSettingsCount)
  }

  // ── Phase 6: App-setup feature-visit markers ─────────────────
  // Personas met content voor een app worden als-voltooid gemarkeerd zodat
  // ze geen verplichte setup-gate krijgen na seeding. Symmetrisch met de
  // backfill-logica in `lib/app-setup-status.ts`: aanwezigheid van content
  // ⇒ setup-completed. Slugs zijn de constanten uit APP_SETUP_SLUGS;
  // hard-coded hier om een import-cycle met de UI-laag te vermijden.
  const markerRows: { user_id: string; feature_slug: string }[] = []
  if (persona.budgets.length > 0) {
    markerRows.push({ user_id: userId, feature_slug: 'budgetteren_setup_completed' })
  }
  const hasAandelenTracking = persona.assets.some(
    (a) => a.asset_type === 'investment' && a.has_holdings_tracking === true,
  )
  if (hasAandelenTracking) {
    markerRows.push({ user_id: userId, feature_slug: 'aandelen_holdings_setup_completed' })
  }
  const hasCryptoTracking = persona.assets.some(
    (a) => a.asset_type === 'crypto' && a.has_holdings_tracking === true,
  )
  if (hasCryptoTracking) {
    markerRows.push({ user_id: userId, feature_slug: 'crypto_holdings_setup_completed' })
  }
  const hasHypotheekplannerTracking = persona.debts.some(
    (d) => d.debt_type === 'mortgage' && d.has_hypotheekplanner_tracking === true,
  )
  if (hasHypotheekplannerTracking) {
    markerRows.push({ user_id: userId, feature_slug: 'hypotheekplanner_setup_completed' })
  }
  const hasRentalTracking = persona.assets.some(
    (a) => a.asset_type === 'real_estate' && a.has_rental_tracking === true,
  )
  if (hasRentalTracking) {
    markerRows.push({ user_id: userId, feature_slug: 'verhuurrendement_setup_completed' })
  }
  if (markerRows.length > 0) {
    const { error: visitErr } = await supabase
      .from('user_feature_visits')
      .upsert(markerRows, { onConflict: 'user_id,feature_slug', ignoreDuplicates: true })
    if (visitErr) {
      // Tabel kan ontbreken op legacy DBs — niet fataal voor persona-seed.
      console.warn(`[seed-persona] feature-visit markers niet geschreven: ${visitErr.message}`)
    } else {
      summary.user_feature_visits = markerRows.length
    }
  }

  return summary
}
