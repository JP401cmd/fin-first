import { DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'

/**
 * De FIRE-/optionele profielvelden die `POST /api/onboarding/reset` terugzet.
 *
 * Waarom dit een aparte module is: `route.ts` mag geen niet-Next-exports dragen
 * (Next.js route-export-check 71002), maar zowel de unit-test als de
 * regressiesuite moet tegen de ECHTE payload kunnen asserten in plaats van tegen
 * een handmatige kopie. Eén bron dus, hier.
 *
 * ── Waarom niet alles op `null` (de oude vorm) ──────────────────────────────
 * Tot 5 sep 2026 zette dit blok alle negen velden in één atomaire `.update()` op
 * `null`, met het commentaar "columns may not exist yet" en zónder
 * foutafhandeling. Die aanname was aantoonbaar onjuist: de kolommen bestáán, ze
 * zijn NOT NULL. Elke reset liep daardoor stuk op Postgres 23502 → PostgREST
 * 400, stil ingeslikt, terwijl de UI een geslaagde reset toonde. Eén SET-clausule
 * is één statement, dus de wél-nullable velden faalden als collateral damage mee:
 * de FIRE-aannames van het vorige leven bleven integraal staan.
 *
 * Gemeten tegen `information_schema.columns` en `pg_constraint` op de LIVE
 * database, 05-09-2026:
 *   - `fire_end_strategy`          NOT NULL, default 'deplete'
 *   - `fire_end_age`               NOT NULL, default 90            (CHECK 60..120)
 *   - `retirement_expense_method`  NOT NULL, default 'essential_budgets'
 *   - `fire_stop_anchor`           NOT NULL, default 'solved'      (ADR 0129)
 *   - `fire_stop_age`              nullable, default null
 *   - de overige zes velden zijn nullable.
 *
 * Die NOT NULL-staat staat in GEEN gecommit migratiebestand: versie
 * `20260227221838` (`add_fire_end_strategy_columns`) is wél geregistreerd in
 * `supabase_migrations.schema_migrations` maar het bestand ontbreekt in
 * `supabase/migrations/` (migratieregisterdrift, herbevestigd 05-09-2026). Lees
 * de NOT NULL-feiten hierboven dus niet terug uit de repo — ze zijn tegen de
 * live database gemeten.
 *
 * De gekozen oplossing zet de NOT NULL-velden op hun kolom-default in plaats van
 * op `null`. Dat IS een schone onboarding-start: exact de staat van een vers
 * account. De verplichtingen in het schema blijven staan.
 *
 * `fire_stop_anchor` en `fire_stop_age` horen bij elkaar in één update: de CHECK
 * `profiles_fire_stop_anchor_age_consistent` eist
 * `(fire_stop_anchor = 'age') = (fire_stop_age IS NOT NULL)`. Anker 'solved'
 * verlangt dus een lege stopleeftijd — het paar is niet los te resetten.
 */
export const FIRE_RESET_FIELDS: Record<string, unknown> = {
  // Nullable kolommen: terug naar "niet ingevuld".
  estimated_monthly_expenses: null,
  expected_return: null,
  inflation_rate: null,
  fire_legacy_amount: null,
  retirement_expense_custom_amount: null,
  widget_prefs: null,

  // NOT NULL-kolommen: terug naar de kolom-default, niet naar null.
  fire_end_strategy: DEFAULT_FIRE_STRATEGY.strategy,
  fire_end_age: DEFAULT_FIRE_STRATEGY.endAge,
  retirement_expense_method: 'essential_budgets',
  fire_stop_anchor: 'solved',
  // Hoort onlosmakelijk bij het anker hierboven (zie de CHECK in de kop).
  fire_stop_age: null,
}

/**
 * De kolommen uit `FIRE_RESET_FIELDS` die op de live database NOT NULL zijn en
 * dus nooit op `null` gezet mogen worden. Bestaat zodat de tests de regressie
 * kunnen vastzetten zonder de lijst opnieuw over te typen.
 */
export const FIRE_RESET_NOT_NULL_COLUMNS = [
  'fire_end_strategy',
  'fire_end_age',
  'retirement_expense_method',
  'fire_stop_anchor',
] as const
