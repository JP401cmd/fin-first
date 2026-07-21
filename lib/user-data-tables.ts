/**
 * Single source of truth voor het AVG-datamodel — [Arch F3], ADR 0059.
 *
 * WELKE public-tabellen bevatten gebruikersdata, en hoe worden ze behandeld bij
 * verwijderen (Recht 1), reset (Recht 2) en export (Recht 3)? Zowel
 * `deleteAllUserData` (lib/seed-persona.ts), de export-routes als de
 * dekkings-vitest (lib/user-data-tables.test.ts) consumeren deze lijsten, zodat
 * "wat wordt gewist" en "wat wordt geëxporteerd" niet uit elkaar lopen.
 *
 * DRIFT-BAKEN: {@link ALL_USER_SCOPED_TABLES} is de canonieke inventaris van álle
 * public-tabellen met een `user_id`-kolom. De vitest dwingt af dat élke tabel
 * daarin in PRECIES ÉÉN partitie hieronder valt (SESSION_WIPE ∪ SERVICE_WIPE ∪
 * RETENTION_ALLOWLIST). Voeg je een user-scoped tabel toe, dan faalt de test tot
 * je 'm hebt ingedeeld met een bewuste wis-/bewaarbeslissing — precies de drift
 * die dit dossier blootlegde.
 *
 * REGENEREREN van de inventaris (bij een nieuwe/verwijderde user_id-tabel):
 *   SELECT c.table_name
 *     FROM information_schema.columns c
 *    WHERE c.table_schema = 'public' AND c.column_name = 'user_id'
 *    ORDER BY 1;
 * (Draai via de Supabase-console/MCP; neem het resultaat over in
 * ALL_USER_SCOPED_TABLES en deel de nieuwe tabel in.)
 *
 * NB `budget_amounts` en `app_settings` bevatten GEEN `user_id`-kolom en staan
 * daarom bewust NIET in de inventaris: deleteAllUserData wist ze speciaal
 * (budget_amounts via de bovenliggende budgets; app_settings via de per-user
 * `key`-LIKE). Zie de opmerkingen daar.
 */

/**
 * Persoonlijke/financiële data mét een eigen-rij DELETE-RLS-policy → veilig te
 * wissen via de SESSIE-client (geen service-role nodig). Bij zowel reset als
 * full-delete gewist. Óók de basis voor de gebruikers-export (eigen rijen).
 * Volgorde is puur documentair; deleteAllUserData bepaalt de FK-veilige batch-orde.
 */
export const SESSION_WIPE_TABLES: readonly string[] = [
  // ── Bestaande wipe (bewezen werkend) ──────────────────────────────────────
  'investment_transactions',
  'crypto_transactions',
  'holding_alerts',
  'target_allocations',
  'user_feature_visits',
  'next_step_completions',
  'investment_holdings',
  'crypto_holdings',
  'goal_contributions',
  'category_corrections',
  'recommendation_feedback',
  'budget_rollovers',
  'recurring_transactions',
  'valuations',
  'net_worth_snapshots',
  'balance_snapshots',
  'life_events',
  'goals',
  'news_editions',
  'actions',
  'transactions',
  'bank_sync_log',
  'bank_connection_accounts',
  'bank_connections',
  'recommendations',
  'debts',
  'assets',
  'bank_accounts',
  'budgets',
  // ── Aanvullingen (dit dossier): stonden een reset in de weg ───────────────
  'exchange_connections', // bevatte API-keys — overleefde een reset!
  'wallet_addresses',
  'broker_connections',
  'custom_calculators',
  'external_data_sources',
  'calculator_likes',
  'ai_calculator_usage',
  'news_feedback',
  'questionnaire_sessions',
  'report_configs',
  'user_own_ibans',
  '_legacy_holdings',
  '_legacy_holding_transactions',
] as const

/**
 * Persoonlijke data ZONDER eigen-rij DELETE-policy (alleen service-role kan
 * wissen). Óók bij reset gewist (persoonlijk), maar dat vereist dat de aanroeper
 * een service-client meegeeft. Via de sessie-client zou de delete een stille
 * no-op zijn — daarom expliciet gescheiden.
 */
export const SERVICE_WIPE_TABLES: readonly string[] = [
  'net_worth_history', // alleen service_role-policy
  'feedback', // geen eigen-rij DELETE-policy
] as const

/**
 * Operationele/log-/telemetrie-tabellen met user-data die bij RESET bewust
 * BEHOUDEN blijven (operationeel), door de retentie-cron op leeftijd worden
 * gepurged, en bij FULL ACCOUNT-DELETE alsnog per gebruiker gewist worden zodat
 * er geen identifier achterblijft (AVG-wissing). De waarde documenteert waarom.
 */
export const RETENTION_ALLOWLIST: Record<string, string> = {
  ai_token_usage: 'Kosten/facturatie-analyse (retentie 24 mnd). Bij full-delete per gebruiker gewist.',
  ai_usage: 'Legacy kosten-analyse (retentie 24 mnd). Bij full-delete per gebruiker gewist.',
  error_logs: 'Operationele foutlogs (retentie 12 mnd). Bij full-delete per gebruiker gewist.',
  web_vitals: 'RUM-telemetrie (eigen retentie-cron). FK is ON DELETE SET NULL → geanonimiseerd bij delete.',
  household_members: 'Huishoud-lidmaatschap: behouden bij reset; bij full-delete gewist via ON DELETE CASCADE.',
}

/**
 * Extra tabellen die het FULL ACCOUNT-DELETE-pad via service-role wist zodat er na
 * de AVG-wissing geen orphan-UUID achterblijft. = SERVICE_WIPE_TABLES + de
 * user-scoped RETENTION_ALLOWLIST-tabellen die niet vanzelf cascaden of een
 * identifier zouden laten staan. `household_members` cascade't al via auth.users;
 * `web_vitals` wordt expliciet gewist (SET NULL zou een NULL-rij laten staan,
 * maar de rijen van deze gebruiker horen bij wissing weg).
 */
export const FULL_ERASE_SERVICE_TABLES: readonly string[] = [
  ...SERVICE_WIPE_TABLES,
  'ai_token_usage',
  'ai_usage',
  'error_logs',
  'web_vitals',
] as const

/**
 * Tabellen in de gebruikers-export (Recht 3, art. 20 dataportabiliteit) die via
 * de SESSIE-client (eigen rijen, RLS) leesbaar zijn. `profiles` (eigen rij) wordt
 * in de route apart toegevoegd. Bewust dezelfde bron als de wipe → geen drift
 * tussen "wat wordt gewist" en "wat kan ik downloaden".
 */
export const EXPORT_SESSION_TABLES: readonly string[] = SESSION_WIPE_TABLES

/**
 * Volledige persoonlijke tabellen-set voor de ADMIN-export (service-role,
 * audit-gelogd): alles wat bij een inzageverzoek hoort, inclusief de tabellen
 * zonder eigen-rij leesrecht.
 */
export const ADMIN_EXPORT_TABLES: readonly string[] = [
  ...SESSION_WIPE_TABLES,
  ...SERVICE_WIPE_TABLES,
] as const

/**
 * Canonieke inventaris: álle public-tabellen met een `user_id`-kolom
 * (geverifieerd tegen information_schema, 2026-07-21). Drift-baken voor de
 * dekkings-vitest. Zie de regenereer-query in de header-docstring.
 */
export const ALL_USER_SCOPED_TABLES: readonly string[] = [
  '_legacy_holding_transactions',
  '_legacy_holdings',
  'actions',
  'ai_calculator_usage',
  'ai_token_usage',
  'ai_usage',
  'assets',
  'balance_snapshots',
  'bank_accounts',
  'bank_connection_accounts',
  'bank_connections',
  'bank_sync_log',
  'broker_connections',
  'budget_rollovers',
  'budgets',
  'calculator_likes',
  'category_corrections',
  'crypto_holdings',
  'crypto_transactions',
  'custom_calculators',
  'debts',
  'error_logs',
  'exchange_connections',
  'external_data_sources',
  'feedback',
  'goal_contributions',
  'goals',
  'holding_alerts',
  'household_members',
  'investment_holdings',
  'investment_transactions',
  'life_events',
  'net_worth_history',
  'net_worth_snapshots',
  'news_editions',
  'news_feedback',
  'next_step_completions',
  'questionnaire_sessions',
  'recommendation_feedback',
  'recommendations',
  'recurring_transactions',
  'report_configs',
  'target_allocations',
  'transactions',
  'user_feature_visits',
  'user_own_ibans',
  'valuations',
  'wallet_addresses',
  'web_vitals',
] as const
