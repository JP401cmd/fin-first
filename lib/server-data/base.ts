// lib/server-data/base.ts
//
// GEDEELDE BASISDATA-LAAG (FASE 2 · Task 2.1)
// ───────────────────────────────────────────────────────────────────────────
// Eén `cache()`-gewrapte fetcher per gedeelde tabel, zodat alle server-loaders
// (dashboard, horizon, lever-scores, will, aandachtspunten) én de shell-layout
// hun overlappende tabel-queries DELEN i.p.v. ieder een eigen `select(...)` te
// draaien. React `cache()` dedupliceert op (functie, argumenten)-identiteit;
// omdat elke loader vroeger een ANDERE kolom-selectie deed, deelden ze niets.
// Hier wint per tabel de RUIMSTE bestaande kolomset (single-row/kleine tabellen
// mogen `*`), zodat elke consumer een subset leest en het gedrag byte-identiek
// blijft — alleen de query draait nog maar één keer per request.
//
// KERNPRINCIPES
//   • Argument = ALLEEN `supabase`. De cache-key is daarmee stabiel (de
//     `createClient()` uit lib/supabase/server.ts is zelf `cache()`-gewrapt →
//     één instantie per RSC-render, dus layout + page + loaders raken dezelfde
//     cache-entry).
//   • RLS-scoping — HARDE VOORWAARDE. De queries filteren NIET expliciet op
//     `user_id`/`id`: de authenticated Supabase-client is al door RLS
//     (auth.uid()) beperkt tot de eigen rijen — exact zoals dashboard-/
//     horizon-data-loader dat al deden. De vroegere expliciete
//     `.eq('user_id', …)` in lever-scores/layout is vervallen. NUANCE (geen
//     lek, wél gedrag): de RLS-policies zijn owner-OF-household-shared, dus
//     voor huishoud-accounts met gedeelde entiteiten tellen lever-scores en
//     sidebar nu ook `ownership='shared'`-rijen mee — exact zoals het
//     dashboard dat altijd al deed (single-source-alignment; partner-privé
//     blijft door RLS geblokkeerd). Dat betekent: deze fetchers MOGEN
//     UITSLUITEND met de anon/authenticated RLS-client (createClient uit
//     lib/supabase/server.ts) worden aangeroepen — NOOIT met
//     getServiceClient(): die passeert RLS en zou rijen van álle gebruikers
//     teruggeven.
//   • Rauwe PostgREST-resultaatvorm. Elke fetcher `return`t het awaited
//     `{ data, error }`-object, zodat consumers hun bestaande `.data ?? []` /
//     `.error`-afleidingen ONGEWIJZIGD houden.
//   • Consume, don't recompute. Hier zit GEEN rekenlogica — puur laad-ordening
//     en dedupe. Aggregaties/type-maps blijven in de loaders.
//
// NIET hier thuis: perspectief/household-overlays (loadPerspectiveDataServer),
// dashboard-specifieke tabellen (net_worth_snapshots, life_events, actions,
// recommendations, goals, investment_holdings, budget_rollovers/_amounts) en de
// recurring-detectie-fetch in lib/vaste-lasten-summary.ts (eigen kolomset +
// venster). Die blijven loader-lokaal.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'

// ── 1. Assets ──────────────────────────────────────────────────────────────
/**
 * Actieve bezittingen van de ingelogde gebruiker (RLS-gescoped).
 *
 * Ruimste kolomset: dashboard- én horizon-data-loader lazen al `select('*')`;
 * alle andere consumers (lever-scores: `current_value, asset_type,
 * net_worth_inclusion_pct`; aandachtspunten: `asset_type, current_value,
 * is_active`; layout: 8 tracking-kolommen) lezen strikte subsets. `*` dekt ze
 * allemaal, dus elke consumer blijft byte-identiek.
 *
 * BEWUST géén `.limit(...)`: dashboard (de numeriek leidende loader) had er
 * nooit één. Horizon/aandachtspunten hadden `.limit(500)` — dat verdwijnt hier;
 * voor ≤500 actieve assets (elke reële/geteste situatie) is dat byte-identiek.
 */
export const getActiveAssets = cache(async (supabase: SupabaseClient) =>
  supabase.from('assets').select('*').eq('is_active', true),
)

// ── 2. Debts ───────────────────────────────────────────────────────────────
/**
 * Actieve schulden van de ingelogde gebruiker (RLS-gescoped).
 *
 * Ruimste kolomset: dashboard/horizon/lever-scores lazen al `select('*')` (o.a.
 * `computeDebtAflossingMonthly` heeft de aflossing-velden nodig). De trimmede
 * selects (will `id,name,current_balance`; aandachtspunten `id,name,
 * current_balance,interest_rate,is_active`) zijn subsets.
 *
 * BEWUST géén `.limit(...)`: horizon/aandachtspunten hadden `.limit(200)` — dat
 * vervalt; voor ≤200 actieve schulden byte-identiek.
 */
export const getActiveDebts = cache(async (supabase: SupabaseClient) =>
  supabase.from('debts').select('*').eq('is_active', true),
)

// ── 3. Profile (eigen rij) ─────────────────────────────────────────────────
/**
 * De eigen profielrij (RLS geeft precies één rij → `.single()`), met ALLE
 * kolommen. Union van 4+ deel-selects (dashboard 34 kolommen, horizon 28 +
 * twee defensieve legacy-probes, lever-scores 9, layout 15) + de losse
 * pot_rules-/monthly_savings_override-probes. Egress verwaarloosbaar: één rij.
 *
 * Vervangt óók de horizon-legacy-probes (withdrawal_strategy/guardrail_*,
 * monthly_savings_override): `select('*')` levert een ontbrekende legacy-kolom
 * simpelweg NIET op (geen kolom-fout, anders dan een expliciete `.select('kol')`
 * op een oude DB) → downstream `?? default` blijft werken. Op de huidige DB
 * (alle migraties toegepast) is dit byte-identiek; de enige nuance is dat op een
 * hypothetische legacy-DB de kolom-fout-warnings wegvallen (geen numeriek effect).
 */
export const getOwnProfile = cache(async (supabase: SupabaseClient) =>
  supabase.from('profiles').select('*').single(),
)

// ── 4. Budgets ─────────────────────────────────────────────────────────────
/**
 * Alle budgetten (parent + child) van de ingelogde gebruiker (RLS-gescoped),
 * met ALLE kolommen. Kleine tabel; `*` dekt elke deel-select (dashboard 10
 * kolommen, horizon 7, lever-scores 5, aandachtspunten `id,slug,parent_id`).
 *
 * `.order('sort_order')` (spiegelt de aandachtspunten-query): alle consumers
 * filteren/mappen/aggregeren zelf, dus de sortering is voor de afgeleide GETALLEN
 * inert. Ze maakt de rij-volgorde deterministisch waar dashboard voorheen op de
 * ongespecificeerde DB-volgorde leunde.
 */
export const getBudgets = cache(async (supabase: SupabaseClient) =>
  supabase.from('budgets').select('*').order('sort_order', { ascending: true }),
)

// ── 5. Niet-gekoppelde bankrekeningen ──────────────────────────────────────
/**
 * Actieve bankrekeningen die NIET aan een asset gekoppeld zijn
 * (`linked_asset_id IS NULL`) — de legacy/transitie-liquiditeit die náást de
 * assets-tabel bij het netto vermogen wordt geteld (RLS-gescoped).
 *
 * Ruimste kolomset = horizon (`id, name, balance`); dashboard (`id, balance`)
 * en lever-scores (`balance`) zijn subsets.
 */
export const getUnlinkedBankAccounts = cache(async (supabase: SupabaseClient) =>
  supabase
    .from('bank_accounts')
    .select('id, name, balance')
    .eq('is_active', true)
    .is('linked_asset_id', null),
)

// ── 6. Transactie-vensters (raw rows) ──────────────────────────────────────
// Ruimste kolomset over alle tx-consumers: `amount, date, budget_id,
// transaction_type`. De consumers slicen zelf op teken (amount ≷ 0) en
// datum-subvenster in JS — byte-identiek aan de vroegere per-venster/per-teken
// SQL-filters, want die vensters zijn subsets van de vensters hieronder.
//
// Maandgrenzen via de tijdzone-veilige `localMonthBounds`/
// `localMonthStartMonthsAgo` (lib/month-range.ts). Dat levert exact dezelfde
// YYYY-MM-01 grenzen op als het vroegere `Date.UTC(y, m, 1).toISOString()`-
// patroon (beide altijd dag-01 op UTC-middernacht → geen NL-terugschuif), maar
// zonder het TZ-lint-verbod op `toISOString()`.
//
// OVERDRACHTSPUNT naar T2.2: de aggregatie-consumers stappen dáár over op
// SQL-aggregaten; hier blijft het de gedeelde raw-row-fetch.

/**
 * Transacties in de HUIDIGE kalendermaand `[monthStart, monthEnd)`.
 * Voedt: dashboard current-month, horizon current-month, lever-scores
 * budget-tx + maand-inkomen, aandachtspunten budget-benchmark.
 */
export const getCurrentMonthTx = cache(async (supabase: SupabaseClient) => {
  const { start, end } = localMonthBounds(new Date())
  return supabase
    .from('transactions')
    .select('amount, date, budget_id, transaction_type')
    .gte('date', start)
    .lt('date', end)
})

/**
 * Transacties in het rollende 12-maands-venster
 * `[localMonthStartMonthsAgo(now, 11), monthEnd)`.
 * Voedt (via JS-filtering op teken/datum): income12, earliest-income-datum,
 * 6-maands in/uit, sovereignty-venster en vorige-maand-vergelijking.
 *
 * BEWUST géén `.limit(...)`: de gemigreerde consumers hadden hier geen limiet.
 * (Dashboard's aparte `.limit(2000)` uitgaven-12m-fetch blijft loader-lokaal,
 * zodat die afkap byte-identiek behouden blijft — T2.2 heft 'm samen met de
 * SQL-aggregatie op.)
 */
export const getTx12m = cache(async (supabase: SupabaseClient) => {
  const now = new Date()
  return supabase
    .from('transactions')
    .select('amount, date, budget_id, transaction_type')
    .gte('date', localMonthStartMonthsAgo(now, 11))
    .lt('date', localMonthBounds(now).end)
})
