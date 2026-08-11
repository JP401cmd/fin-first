// lib/household/budget-share.ts
//
// HET HUISHOUD-AANDEEL VAN EEN BUDGET, VOOR DE GRONDSLAG
// ───────────────────────────────────────────────────────────────────────────
// De SELECT-policy op `budgets` is huishoud-verbreed:
//   auth.uid() = user_id  OR  (ownership = 'shared' AND household_id = user_household_id())
// `getBudgets` (lib/server-data/base.ts) levert dus óók de GEDEELDE budgetten van
// de partner. Zonder weging telt hetzelfde gedeelde budget bij beide partners
// voor 100 % — op huishoudniveau 200 %.
//
// Voor UITGAVEN was die 100 %-weging bestaand gedrag (zie het aandachtspunt
// gedeelde-bezitting-ongewogen). Voor INKOMEN is het NIEUW: tot ADR 0103 kwam
// het inkomen uit transacties en telde het daar niet dubbel. De budgetgrondslag
// zou die dubbeltelling dus introduceren — en wel meteen in de FIRE-projectie,
// de spaarquote, de hefboomscores én het bruto Box 1-inkomen. Deze module
// voorkomt dat.
//
// GEEN EIGEN WEEGREGEL. De fractie komt uit `shareFractionFor`
// (lib/budget-perspective.ts) — dezelfde functie waar `attributedFraction` in
// lib/household/perspective-loader.ts en `unlinkedCashFractionFor` in
// lib/unlinked-cash.ts op uitkomen. Eén begrip van "mijn aandeel", drie ingangen.
//
// Deze module spiegelt `resolveUnlinkedCashShare` regel voor regel, inclusief de
// FAST PATH (geen gedeeld budget in de set → géén extra query, aandeel 100 %) en
// de FAIL-CLOSED terugval bij een gefaalde huishoud-leesronde.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Perspective } from '@/lib/household-data'
import { shareFractionFor } from '@/lib/budget-perspective'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { FAIL_CLOSED_SHARE_PCT, isUuid } from '@/lib/unlinked-cash'
import { resolveBudgetBasisFromProfile } from '@/lib/cashflow-settings'
import type { BudgetBasisResult, BudgetBasisRow } from '@/lib/budget-basis'
import { getRealizedBudgetAmounts } from '@/lib/budget-realized'

/** Minimale rijvorm voor de weging: id + eigenaarschap. */
export type BudgetShareRow = {
  id: string
  ownership?: string | null
}

/**
 * De kolommen die `computeBudgetBasis` nodig heeft. Eén literal (geen parameter):
 * PostgREST leidt de rijvorm af uit de letterlijke select-string, dus een
 * `string`-variabele degradeert elke consument naar `GenericStringError`.
 */
export const BUDGET_BASIS_COLUMNS =
  'id, parent_id, budget_type, name, default_limit, interval, ownership, is_archived, merged_into, created_at'

/**
 * Budgetrijen voor de GRONDSLAG via een RLS-client (sessie).
 *
 * **Voeg hier NOOIT een `.eq('user_id', …)` aan toe.** De SELECT-policy op
 * `budgets` is huishoud-verbreed (`View own or shared budgets`), en de live
 * loaders lezen via `getBudgets` (`select('*')`, géén user-filter) dus mét de
 * gedeelde rijen van de partner. Een eigen user-filter zou die wegsnijden en de
 * grondslag laten driften met /overzicht — precies het defect dat de
 * snapshot-routes hadden: partner B zag €1.500/mnd gedeeld inkomen op zijn
 * dashboard en €0 daarvan in zijn snapshot van die nacht.
 *
 * BEWUST een aparte query naast de bestaande `.eq('user_id', …)`-budgetquery van
 * die routes: díe voedt óók `yearlyMustExpensesFromBudgets` en de
 * health-score-budgetten. Haar scope verbreden zou die twee stilzwijgend
 * meeverschuiven; dit is de kleinste wijziging die alleen de grondslag raakt.
 */
export function selectBudgetsForBasis(supabase: SupabaseClient) {
  return supabase.from('budgets').select(BUDGET_BASIS_COLUMNS)
}

/**
 * Idem, maar voor de SERVICE-ROLE-context (de snapshot-cron): daar is
 * `auth.uid()` NULL, dus de policy scoopt niets en een RLS-leunende query zou de
 * budgetten van álle gebruikers optellen. De scope moet met de hand mee — exact
 * zoals de policy 'm voor een sessie-client zou toepassen.
 *
 * Spiegelt `selectUnlinkedBankAccountsForUser` (lib/unlinked-cash.ts), inclusief
 * de UUID-controle vóór interpolatie: de `or`-grammatica van PostgREST is
 * komma-/haakje-gescheiden, dus een waarde met leestekens zou het predicaat
 * kunnen herschrijven. Degradeert fail-closed naar alleen-eigen-rijen.
 */
export function selectBudgetsForBasisForUser(
  supabase: SupabaseClient,
  userId: string,
  householdId: string | null,
) {
  const base = selectBudgetsForBasis(supabase)
  if (!householdId || !isUuid(householdId) || !isUuid(userId)) {
    return base.eq('user_id', userId)
  }
  return base.or(`user_id.eq.${userId},and(ownership.eq.shared,household_id.eq.${householdId})`)
}

/**
 * Het aandeel waarmee GEDEELDE budgetten in deze grondslag tellen.
 * `mySharePct` (0-100) komt uit `PerspectiveContext.mySharePct` → `households.split_mode`.
 */
export type BudgetShare = {
  perspective: Perspective
  /** 0-100. */
  mySharePct: number
}

/** Aandeel voor een context zonder huishouden: alles is van jou. */
export const SOLO_BUDGET_SHARE: BudgetShare = {
  perspective: 'personal',
  mySharePct: 100,
}

/** Zit er een gedeeld budget in de set? Zo nee, is er niets te wegen. */
export function hasSharedBudget(rows: ReadonlyArray<BudgetShareRow> | null | undefined): boolean {
  return (rows ?? []).some((row) => (row.ownership ?? 'personal') === 'shared')
}

/**
 * De deelfractie-map (budget-id → 0-1) die `computeBudgetBasis` verwacht.
 *
 * Alleen budgetten die daadwerkelijk een fractie ≠ 1 krijgen komen in de map;
 * `computeBudgetBasis` behandelt een ontbrekend id als fractie 1. Dat houdt de
 * map leeg voor élke solo-gebruiker en maakt de weging aantoonbaar inert waar ze
 * niets doet.
 */
export function budgetShareFractionById(
  rows: ReadonlyArray<BudgetShareRow> | null | undefined,
  share: BudgetShare,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows ?? []) {
    const fraction = shareFractionFor(share.perspective, row.ownership ?? undefined, share.mySharePct)
    if (fraction !== 1) out[row.id] = fraction
  }
  return out
}

/**
 * Het aandeel voor deze set budgetrijen, via een RLS-client (sessie).
 *
 * FAST PATH: geen gedeeld budget → géén roundtrip. Faalt het laden van de
 * huishoud-context terwijl er wél een gedeelde rij is, dan valt het aandeel
 * fail-closed terug op {@link FAIL_CLOSED_SHARE_PCT} (50): liever de helft te
 * weinig inkomen dan het inkomstenbudget van je partner er volledig bovenop.
 */
export async function resolveBudgetShare(
  supabase: SupabaseClient,
  rows: ReadonlyArray<BudgetShareRow> | null | undefined,
  perspective: Perspective = 'personal',
): Promise<BudgetShare> {
  if (!hasSharedBudget(rows)) return { perspective, mySharePct: 100 }
  try {
    const ctx = await loadPerspectiveContext(supabase)
    return { perspective, mySharePct: ctx.hasHousehold ? ctx.mySharePct : 100 }
  } catch (error) {
    console.error('[budget-share] huishoud-aandeel laden mislukt:', error)
    return { perspective, mySharePct: FAIL_CLOSED_SHARE_PCT }
  }
}

/**
 * DE ingang voor server-loaders: profielrij + budgetrijen → de budgetgrondslag
 * per kant, gewogen op het huishoud-aandeel.
 *
 * Eén functie zodat de DERTIEN aanroepers (core-, dashboard-, horizon-loader,
 * beide cashflow-KPI-loaders, lever-scores, de doelen-loader, goal-current-value,
 * spend-limits, /api/report, /api/guide-progress en de twee sessie-snapshot-
 * routes) de weging niet elk apart kunnen vergeten — precies het defect dat bij
 * de losse bankrekeningen al één keer is gemaakt.
 *
 * De snapshot-cron is de veertiende grondslag-aanroeper en loopt bewust langs
 * deze functie heen, maar sinds migratie 20260811180000 op dezelfde GRONDSLAG.
 * Twee redenen om daar niet in te trekken: `resolveBudgetShare` leest het
 * huishoud-aandeel uit de SESSIE (`auth.getUser()`) en zou op een
 * service-role-client op de fail-closed 50 % uitkomen, en
 * `getRealizedBudgetAmounts` is `cache()`-gewrapt op de supabase-client die de
 * cron over álle gebruikers deelt. De cron combineert daarom de vooraf gebatchte
 * `householdShareByUser` met `fetchRealizedBudgetAmounts(supabase, scope)` — zelfde
 * rekenweg, andere ingang.
 */
export async function loadBudgetBasis(
  supabase: SupabaseClient,
  profile: Record<string, unknown> | null | undefined,
  rows: BudgetBasisRow[],
  perspective: Perspective = 'personal',
): Promise<{ income: BudgetBasisResult; expenses: BudgetBasisResult }> {
  // De twee ophalingen zijn onafhankelijk; het aandeel heeft bovendien meestal
  // een fast path zonder query. `getRealizedBudgetAmounts` is `cache()`-gewrapt,
  // dus de zeven aanroepers delen binnen één render dezelfde drie RPC's.
  const [share, realized] = await Promise.all([
    resolveBudgetShare(supabase, rows, perspective),
    getRealizedBudgetAmounts(supabase),
  ])
  return resolveBudgetBasisFromProfile(profile, rows, {
    shareFractionById: budgetShareFractionById(rows, share),
    realized,
  })
}
