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
//     UITZONDERING (perf, gemeten — zie de doc bij `getEarliestIncomeDate`):
//     voor een query ZONDER datumvenster met `ORDER BY date … LIMIT 1` kan de
//     planner de RLS-OR niet in een index-conditie duwen en valt hij terug op
//     de globale datum-index → kosten O(rijen van ándere gebruikers). Daar
//     staan expliciete kolom-predicaten wél, in twee takken (eigen + gedeeld)
//     die samen exact de RLS-verzameling dekken. Gevensterde varianten
//     (`getCurrentMonthTx`, `getTx12m`) hebben dit probleem NIET — die pakken
//     de bitmap op `idx_transactions_user_date` gewoon.
//   • Rauwe PostgREST-resultaatvorm. Elke fetcher `return`t het awaited
//     `{ data, error }`-object, zodat consumers hun bestaande `.data ?? []` /
//     `.error`-afleidingen ONGEWIJZIGD houden.
//   • Consume, don't recompute. Hier zit GEEN rekenlogica — puur laad-ordening
//     en dedupe. Aggregaties/type-maps blijven in de loaders.
//
// NIET hier thuis: perspectief/household-overlays (loadPerspectiveDataServer),
// dashboard-specifieke tabellen (life_events, actions, recommendations, goals,
// investment_holdings) en de recurring-detectie-fetch in
// lib/vaste-lasten-summary.ts (eigen kolomset + venster). Die blijven
// loader-lokaal.
//
// `budget_rollovers`/`budget_amounts` stonden op die uitsluitingslijst zolang
// alleen de dashboard-loader ze las (voor de heatmap-widget); sinds de Budget-KPI
// haar limiet via de canonieke `computeEffectiveLimit` bepaalt heeft óók
// `lib/cashflow-kpis.ts#loadCashflowKpis` ze nodig — zie punt 9. Zelfde route als
// `net_worth_snapshots` hierboven: een tweede lezer maakt er een gedeelde fetcher
// van, i.p.v. twee loaders die dezelfde rijen apart ophalen.
//
// `net_worth_snapshots` stond op die uitsluitingslijst zolang alleen de
// dashboard-loader het 12-maands-venster las; sinds de forecast-laag
// (lib/cashflow-kpis.ts, T2.5) diezelfde rijen nodig heeft, is het een gedeelde
// fetcher geworden — zie punt 8. De ANDERE snapshot-lezing
// (lib/core-data-loader.ts: 24 rijen, meer kolommen, geen datumvenster) is een
// eigen query en hoort hier bewust niet: die samenvoegen zou een kolomset en een
// venster verbreden zonder consument.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ASSET_CLIENT_COLUMNS } from '@/lib/asset-data'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { localMonthBounds, localMonthStartMonthsAgo } from '@/lib/month-range'
import { selectUnlinkedBankAccounts } from '@/lib/unlinked-cash'

// ── 1. Assets ──────────────────────────────────────────────────────────────
/**
 * Actieve bezittingen van de ingelogde gebruiker (RLS-gescoped).
 *
 * Ruimste kolomset = `ASSET_CLIENT_COLUMNS` (lib/asset-data.ts): elke kolom van
 * de `Asset`-interface behalve de drie account-nummer-kolommen. Alle consumers
 * (lever-scores: `current_value, asset_type, net_worth_inclusion_pct`;
 * aandachtspunten: `asset_type, current_value, is_active`; layout: 8
 * tracking-kolommen; dashboard/horizon: de hele `Asset`) lezen daar strikte
 * subsets van — geen enkele leest een rekeningnummer.
 *
 * BEWUST NIET `select('*')`: `lib/horizon-data-loader.ts` reikt deze rijen als
 * `HorizonPageData.assets` door naar `<HorizonPage>` (clientcomponent), dus
 * Next serialiseert ze volledig in de RSC-payload. `assets` heeft een
 * huishoud-gedeelde SELECT-policy, dus `*` zou bij een gedeelde bezitting
 * `account_number` (plaintext IBAN), `account_number_encrypted` (ciphertext) en
 * `account_number_hash` (blind index onder een server-only sleutel = stabiele
 * correlatiesleutel) van de PARTNER in de paginabron zetten.
 *
 * BEWUST géén `.limit(...)`: dashboard (de numeriek leidende loader) had er
 * nooit één. Horizon/aandachtspunten hadden `.limit(500)` — dat verdwijnt hier;
 * voor ≤500 actieve assets (elke reële/geteste situatie) is dat byte-identiek.
 */
export const getActiveAssets = cache(async (supabase: SupabaseClient) =>
  supabase.from('assets').select(ASSET_CLIENT_COLUMNS).eq('is_active', true),
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
 * en lever-scores (`balance`) zijn subsets. `ownership` komt daar sinds de
 * huishoud-weging bij: zonder die kolom is een gedeelde rekening niet van een
 * eigen rekening te onderscheiden en telt hij bij beide partners voor 100%.
 *
 * Het `is_active`/`linked_asset_id IS NULL`-predicaat is de GRONDSLAG (welk geld
 * telt náást de assets mee) en woont daarom in `lib/unlinked-cash.ts`, samen met
 * de optelling zelf en de service-role-variant voor de snapshot-cron. Deze
 * fetcher voegt alleen de ruimere kolomset en de request-dedupe toe.
 */
export const getUnlinkedBankAccounts = cache(async (supabase: SupabaseClient) =>
  selectUnlinkedBankAccounts(supabase),
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
 *
 * KOLOMSET VERBREED (30 aug 2026) met `id, is_income, is_split` — de kolommen
 * van het canonieke bestedingscontract (`BUDGET_SPENDING_TX_COLUMNS` in
 * lib/budget-spending-fetch.ts). Zonder die drie kan `buildBudgetSpendingMap`
 * haar split- en inkomst-regels niet toepassen, en dan bouwt elke consument
 * weer zijn eigen som — precies wat deze laag moet voorkomen. Verbreden i.p.v.
 * een tweede maand-fetch, omdat `loadCashflowKpis` een bewaakt querybudget
 * heeft (lib/cashflow-kpis.parity.test.ts) en een duplicaat-fetch dat zou
 * breken.
 *
 * VEILIG VOOR NIET-OMGEZETTE CONSUMENTEN: de extra kolommen zijn inert tenzij
 * je ze leest, en de enige die semantiek draagt (`is_split`) doet dat alleen op
 * een rij MÉT budget_id — terwijl een split-ouder in deze database juist
 * `budget_id = NULL` heeft en dus in élke bestedingssom al werd overgeslagen.
 */
export const getCurrentMonthTx = cache(async (supabase: SupabaseClient) => {
  const { start, end } = localMonthBounds(new Date())
  return supabase
    .from('transactions')
    .select('id, amount, date, budget_id, transaction_type, is_income, is_split')
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

/**
 * Vroegste datum van een positieve (inkomsten-)transactie — ALL-TIME, één rij.
 *
 * Voedt de inkomens-extrapolatie in de dashboard-loader (`incomeMonths` /
 * `dataMonths6`). Vroeger werd deze datum uit de 12-maands-slice (`getTx12m`)
 * gescand — begrensd door ZOWEL het 12-mnd-venster ALS de stille
 * `max_rows=1000`-afkap: voor gebruikers met >1000 positieve rijen in het venster
 * kon de gescande "vroegste" datum te recent zijn → `incomeMonths` te klein →
 * OVER-extrapolatie. Een `order(date asc).limit(1)`-query geeft per definitie één
 * rij (nooit afkap-gevoelig) en is door geen van beide begrenzingen geraakt.
 *
 * BEWUST géén transfer-filter: spiegelt de vroegere scan over ÁLLE positieve
 * rijen (`income12Rows` had géén isRealTx-filter).
 *
 * ── TWEE TAKKEN I.P.V. ÉÉN RLS-ONLY QUERY (perf, 11 aug 2026) ──────────────
 * Dit is de ENIGE fetcher hier die géén datumvenster heeft én `ORDER BY date
 * LIMIT 1` doet, en precies daar breekt de T2.1-conventie ("RLS scopet al,
 * dus geen expliciete `.eq('user_id')`"). Zónder kolom-predicaat op `user_id`
 * is de RLS-policy voor de planner een FILTER met een OR
 * (`uid = user_id OR (ownership='shared' AND household_id = user_household_id())`),
 * niet iets wat hij in een index-conditie kan duwen. Hij pakt dan de GLOBALE
 * `idx_transactions_date` en loopt vanaf de oudste rij ín de tabel vooruit tot
 * hij een rij van jóu tegenkomt. Gemeten onder gesimuleerde RLS op een laat
 * ingestroomde gebruiker: 23.134 rows removed / 12.202 buffers / 47 ms — kosten
 * die schalen met de rijen van ÁNDERE gebruikers, op élke paginalading van élke
 * route (deze fetcher hangt in `app/(app)/layout.tsx` via `loadLeverScores`).
 * In pg_stat_statements was dit met 101 ms mean / 623 s totaal de duurste
 * gemiddelde query van de app.
 *
 * De naïeve fix (`.eq('user_id', …)`) is snel maar VERSMALT de scope: de
 * SELECT-policy is `own OR household-shared`, dus partner-rijen met
 * `ownership='shared'` zouden wegvallen. Daarom splitsen we in twee takken die
 * elk hun eigen index krijgen, en nemen we het minimum:
 *
 *   tak A — eigen rijen   → `idx_transactions_user_date`            (34 buffers, 0,2 ms)
 *   tak B — gedeelde rijen→ `idx_transactions_household_shared_date` (4 buffers, 1,3 ms)
 *
 * SCOPE-BEWIJS (waarom dit géén datatoegang-wijziging is): beide takken draaien
 * onder dezelfde RLS-client, dus elke tak levert een DEELVERZAMELING van de
 * RLS-zichtbare rijen. Tak A = {zichtbaar} ∩ {user_id = ik} = al mijn eigen
 * rijen (die zijn per policy-tak 1 altijd zichtbaar). Tak B = {zichtbaar} ∩
 * {ownership='shared'} = de gedeelde rijen van mijn huishouden (policy-tak 2;
 * gedeelde rijen van een ánder huishouden blijven door RLS geblokkeerd — het
 * `household_id`-predicaat blijft van de policy komen, niet van ons). A ∪ B is
 * dus exact de RLS-zichtbare verzameling, en min(datum) over een unie is het
 * minimum van de twee deelminima. Niet verruimd, niet versmald.
 *
 * `.or('user_id.eq.…,ownership.eq.shared')` in één query is bewust NIET gekozen:
 * gemeten valt de planner dan terug op exact hetzelfde globale-datum-indexplan.
 *
 * De gebruiker komt uit `getCachedUser` (zelf `cache()`-gewrapt op dezelfde
 * client), dus dit kost géén extra auth-round-trip: de layout haalde 'm al op.
 */
export const getEarliestIncomeDate = cache(async (supabase: SupabaseClient) => {
  const user = await getCachedUser(supabase)
  if (!user) {
    // Geen sessie → RLS zou hoe dan ook niets teruggeven. Zelfde resultaatvorm
    // als PostgREST's `maybeSingle()` op nul rijen, zodat consumers hun
    // `(res.data as { date?: string | null } | null)?.date`-afleiding houden.
    return { data: null as { date: string } | null, error: null }
  }

  const [ownRes, sharedRes] = await Promise.all([
    supabase
      .from('transactions')
      .select('date')
      .eq('user_id', user.id)
      .gt('amount', 0)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('transactions')
      .select('date')
      .eq('ownership', 'shared')
      .gt('amount', 0)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  // ISO-datums (`YYYY-MM-DD`) zijn lexicografisch = chronologisch vergelijkbaar.
  const candidates = [ownRes.data?.date, sharedRes.data?.date].filter(
    (d): d is string => typeof d === 'string' && d.length > 0,
  )
  const earliest = candidates.length > 0 ? candidates.reduce((a, b) => (a <= b ? a : b)) : null

  return {
    data: earliest === null ? null : { date: earliest },
    // Eén falende tak maakt de andere niet ongeldig (de unie is dan onvolledig,
    // net als vroeger bij een falende enkele query). Eerste fout wint, zodat een
    // consumer die `.error` leest hetzelfde signaal krijgt als voorheen.
    error: ownRes.error ?? sharedRes.error,
  }
})

// ── 8. Netto-vermogen-snapshots (12-maands venster) ────────────────────────
/**
 * De maandelijkse netto-vermogen-snapshots binnen het rollende 12-maands-venster
 * `[localMonthStartMonthsAgo(now, 11), ∞)`, oplopend op datum, hooguit 12 rijen.
 *
 * Voedt op dit moment twee paden, en dat is precies waarom hij hier staat:
 *  · `lib/dashboard-data-loader.ts` — `netWorthHistory`, `savingsHistory`, de
 *    snapshot-`fire_age` en de net-worth-delta-fallback op de spaarquote;
 *  · `lib/cashflow-kpis.ts#loadForecastSectionData` — `savingsHistory` + diezelfde
 *    delta-fallback, zonder de rest van de dashboard-bundel (T2.5).
 *
 * De ondergrens is tijdzone-veilig via `localMonthStartMonthsAgo` (het TZ-lint
 * verbiedt `toISOString()` op maandgrenzen) en levert exact dezelfde
 * `YYYY-MM-01`-datum als het `Date.UTC(jaar, maand − 11, 1).toISOString()` dat de
 * dashboard-loader hier had: beide bouwen de grens uit de LOKALE jaar/maand van
 * `now` en zetten de dag op 01.
 *
 * BEWUST `.limit(12)` behouden: de snapshot-cron schrijft één rij per maand, dus
 * 12 dekt het venster — maar de kolom is niet uniek per maand en de dashboard-
 * loader las er altijd hooguit 12. Weglaten zou de historie-reeksen stil kunnen
 * verlengen bij een account met dubbele snapshots in één maand.
 */
export const getNetWorthSnapshots12m = cache(async (supabase: SupabaseClient) =>
  supabase
    .from('net_worth_snapshots')
    .select('snapshot_date, net_worth, fire_age, savings_rate')
    .gte('snapshot_date', localMonthStartMonthsAgo(new Date(), 11))
    .order('snapshot_date', { ascending: true })
    .limit(12),
)

// ── 9. Effectieve budgetlimiet: carry + periode-overrides ──────────────────
//
// De twee tabellen die `computeEffectiveLimit` (lib/budget-rollover.ts) nodig
// heeft om "wat is het budget déze maand" te beantwoorden. Twee lezers, en dat is
// precies waarom ze hier staan:
//  · `lib/dashboard-data-loader.ts` — de heatmap-"beschikbaar"-map én (sinds
//    31 aug 2026) de limiet-kant van `deriveBudgetTotals`;
//  · `lib/cashflow-kpis.ts#loadCashflowKpis` — diezelfde limiet-kant, zonder de
//    rest van de dashboardbundel (ADR 0083).
//
// De maandgrens wordt hier INTERN uit `new Date()` afgeleid (net als
// `getCurrentMonthTx`), zodat de cache-sleutel het enkele `supabase`-argument
// blijft. Dat levert dezelfde `YYYY-MM-01`-string als de `Date.UTC(jaar, maand,
// 1).toISOString()`-afleiding die de dashboard-loader zelf gebruikt — beide
// bouwen de grens uit de LOKALE jaar/maand van `now` met dag 01.

/**
 * De rollover-carry van de HUIDIGE periode (`'YYYY-MM'`), alle budgetten.
 *
 * Kolomset = de ruimste van de twee lezers (de dashboard-loader cast de rijen naar
 * `BudgetRollover`, dat `id`/`user_id`/`created_at` draagt).
 */
export const getBudgetRolloversCurrentPeriod = cache(async (supabase: SupabaseClient) =>
  supabase
    .from('budget_rollovers')
    .select('id, user_id, budget_id, period, carried_amount, rollover_type, created_at')
    .eq('period', localMonthBounds(new Date()).start.slice(0, 7)),
)

/**
 * De periode-limiet-overrides die op de huidige maand van toepassing KUNNEN zijn:
 * `effective_from <= <1e van deze maand>`. De keuze wélke override wint (de meest
 * recente per budget) blijft in `computeEffectiveLimit` — hier alleen het venster.
 *
 * `budget_amounts` heeft GEEN `user_id`-kolom; RLS scopet via het bovenliggende
 * budget (zie lib/user-data-tables.ts). Deze fetcher mag dus, net als alle andere
 * hier, UITSLUITEND met de anon/authenticated client draaien.
 */
export const getBudgetAmountOverridesUpToCurrentMonth = cache(async (supabase: SupabaseClient) =>
  supabase
    .from('budget_amounts')
    .select('budget_id, effective_from, amount')
    .lte('effective_from', localMonthBounds(new Date()).start),
)
