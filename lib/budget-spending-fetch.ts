// lib/budget-spending-fetch.ts
//
// De OPHAALKANT van de canonieke bestedingssom (lib/budget-spending.ts).
//
// `spendingContribution`/`buildBudgetSpendingMap` zijn pure functies met een
// harde eis aan hun invoer: ze hebben `transaction_type` nodig om transfers uit
// te sluiten, `is_income` als tweede inkomst-marker naast het teken, en
// `is_split` + de bijbehorende `transaction_splits`-regels om de ouderrij over
// te slaan zonder haar bedrag kwijt te raken. Een aanroeper die een smallere
// kolomset ophaalt krijgt STIL een andere grondslag - precies de bugklasse die
// deze convergentie opruimt. Daarom staat de kolomlijst hier een keer, en niet
// als losse string in vijf queries.
//
// TWEE INGANGEN, EEN CONTRACT:
//  - Oppervlakken op de gedeelde basisdata-laag (dashboard-loader, KPI-laag,
//    aandachtspunten) lezen hun maandrijen uit `getCurrentMonthTx`
//    (lib/server-data/base.ts) - die kolomset IS hierop verbreed - en halen de
//    split-regels op met `getCurrentMonthSplits`, die `cache()` deelt en zonder
//    split-ouders geen query doet. Zo blijft het querybudget van
//    `loadCashflowKpis` (bewaakt in lib/cashflow-kpis.parity.test.ts) intact.
//  - Routes met een eigen venster of een eigen client (de snapshot-routes,
//    de check-in-route) zetten `BUDGET_SPENDING_TX_COLUMNS` in hun eigen select
//    en roepen `fetchSpendingSplits` aan met de rijen die ze al hebben.
//
// RLS: `getCurrentMonthSplits` leunt op RLS en MOET dus met de
// anon/authenticated client (lib/supabase/server.ts) draaien. Een
// service-role-context (de snapshot-cron) scoopt zelf op user_id en gebruikt
// daarom `fetchSpendingSplits` met de rijen die hij al heeft.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCurrentMonthTx } from '@/lib/server-data/base'
import type { SpendingSplitRow } from '@/lib/budget-spending'

/**
 * De transactie-kolommen die de canonieke bestedingssom nodig heeft. Gebruik
 * deze constante in elke `select(...)` die rijen naar `spendingContribution`,
 * `buildBudgetSpendingMap` of `buildBudgetCategories` voert.
 */
export const BUDGET_SPENDING_TX_COLUMNS =
  'id, amount, budget_id, transaction_type, is_income, is_split'

/**
 * PostgREST-rijfilter dat bij die kolomlijst hoort: rijen MÉT een budget_id, ÓF
 * split-ouders — want die dragen er per definitie geen.
 *
 * WAAROM DIT EEN CONSTANTE IS EN GEEN LOSSE `.not('budget_id','is',null)`: die
 * naïeve vorm hield precies de split-ouders buiten, en dus de transacties
 * waarvan de deelbedragen wél op budgetten geboekt staan. Ze weglaten is óók
 * geen oplossing — op een venster van twaalf maanden zónder `.limit()` kapt
 * PostgREST stil af op `max_rows` (supabase/config.toml = 1000) en verdwijnen er
 * willekeurige rijen uit de som, zonder foutmelding.
 *
 * Woonde tot 31 aug 2026 in lib/ai/context/budget-spending-source.ts. Verhuisd:
 * API-routes horen niet uit de AI-contextlaag te importeren, en dit is een
 * eigenschap van het bestedingscontract, niet van de AI. Die module
 * her-exporteert 'm, zodat de bestaande context-aanroepers ongewijzigd blijven —
 * één definitie, twee ingangen.
 */
export const BUDGET_OR_SPLIT_FILTER = 'budget_id.not.is.null,is_split.is.true'

/**
 * Split-regels bij de gegeven transactierijen.
 *
 * Neemt de OUDERRIJEN als invoer (niet een venster) zodat de scoping van de
 * aanroeper — RLS óf een expliciete `.eq('user_id', …)` in een
 * service-role-context — één op één wordt overgenomen: er kan per constructie
 * geen split van een andere gebruiker binnenkomen.
 *
 * Zonder gesplitste transacties draait er GEEN query (het normale geval: op
 * productie staat één split, en die hangt aan een transactie zonder budget).
 */
export async function fetchSpendingSplits(
  supabase: SupabaseClient,
  // Bewust de MINIMALE rijvorm en niet `SpendingTxRow`: deze functie leest
  // uitsluitend `id` en `is_split`, en accepteert zo ook de iets lossere
  // rijvormen van de snapshot-routes (`HealthScoreTransaction`) zonder cast.
  transactions: ReadonlyArray<{ id?: string; is_split?: boolean | null }>,
): Promise<SpendingSplitRow[]> {
  const splitTxIds = transactions
    .filter((t) => t.is_split === true && typeof t.id === 'string')
    .map((t) => t.id as string)
  if (splitTxIds.length === 0) return []

  const { data } = await supabase
    .from('transaction_splits')
    .select('budget_id, amount')
    .in('transaction_id', splitTxIds)

  return (data ?? []) as SpendingSplitRow[]
}

/**
 * De split-regels bij de transacties van de HUIDIGE kalendermaand.
 *
 * Zonder split-ouders in die maand draait er helemaal geen query, en de functie
 * is `cache()`-gededupeerd zodat dashboard-loader, KPI-laag en
 * aandachtspunten-loader binnen één request hooguit één keer de split-tabel
 * raken.
 *
 * `rows` is OPTIONEEL en bestaat om één reden: heeft de aanroeper de maandrijen
 * al (uit `getCurrentMonthTx`), geef ze dan mee. Zonder dat argument haalt deze
 * functie ze zelf op, en dat is precies één tabel-query extra zodra `cache()`
 * niet dedupt — wat buiten een Next-request (bv. in vitest) het geval is. Het
 * querybudget van `loadCashflowKpis` wordt hard bewaakt
 * (lib/cashflow-kpis.parity.test.ts: `nieuwQueries` moet 3 blijven), dus daar is
 * meegeven verplicht in de praktijk. De rijen zijn hoe dan ook dezelfde: het
 * argument verandert de UITKOMST niet, alleen wie de fetch doet.
 */
export const getCurrentMonthSplits = cache(
  async (
    supabase: SupabaseClient,
    rows?: ReadonlyArray<{ id?: string; is_split?: boolean | null }>,
  ): Promise<SpendingSplitRow[]> => {
    if (rows) return fetchSpendingSplits(supabase, rows)
    const { data } = await getCurrentMonthTx(supabase)
    return fetchSpendingSplits(supabase, (data ?? []) as Array<{ id?: string; is_split?: boolean | null }>)
  },
)
