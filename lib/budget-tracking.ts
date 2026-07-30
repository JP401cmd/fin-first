import type { SupabaseClient } from '@supabase/supabase-js'
import { syncBudgetingActive } from '@/lib/budgeting-active'
import { syncBankAccountCompanion } from '@/lib/bank-account-companion'

/**
 * De budgetteringsas van één cash-bezit aan- of uitzetten — de ENE schrijver.
 *
 * Drie dingen die nooit los van elkaar gemuteerd mogen worden:
 *
 *  1. `assets.has_budget_tracking` — de bron;
 *  2. de gekoppelde `bank_accounts`-companion (`syncBankAccountCompanion`) — de
 *     rij die `/core/cash` en `/core/cash/import` lezen;
 *  3. de module-gate `profiles.budgeting_active` (`syncBudgetingActive`).
 *
 * Deze functie bestaat omdat er sinds fase 4 twee routes dezelfde keuze
 * schrijven: `POST /api/assets/toggle-budget` (bewerkscherm/rekeningscherm) en
 * `POST /api/bank-connect/auth-link` (het voorgevinkte "neem deze rekening mee in
 * mijn budgetten" in de koppelwizard, besluit B2). Twee routes die elk hun eigen
 * drieluik schrijven is precies hoe de twee vlaggen eerder uiteen zijn gelopen —
 * een bekend terugkerend defect.
 *
 * De select gebruikt de PostgREST-alias `iban:account_number`: op `assets` heet
 * de kolom `account_number` (er bestaat GEEN `assets.iban`), en de companion
 * verwacht 'm als `iban`. Die alias is een gepinde regressie
 * (`app/api/assets/toggle-budget/route.test.ts`) — niet "opschonen".
 */
export const BUDGET_TRACKING_ASSET_SELECT =
  'id, has_budget_tracking, name, iban:account_number, institution, subtype, ownership, household_id, current_value'

export type BudgetTrackingAsset = {
  id: string
  has_budget_tracking: boolean | null
  name: string
}

export type SetBudgetTrackingResult =
  | { ok: true; asset: BudgetTrackingAsset; budgetingActive: boolean }
  | { ok: false; error: unknown }

/**
 * Zet `has_budget_tracking` op één cash-bezit en sync companion + module-gate mee.
 *
 * `user_id` staat expliciet in de update: de UPDATE-policy op `assets` is
 * eigen-rij, maar een expliciete clause maakt een misconfiguratie zichtbaar in
 * plaats van stil.
 *
 * De twee sync-stappen zijn best-effort — de toggle zelf is dan al doorgevoerd en
 * mag niet terugvallen in een 500. Een gefaalde gate-write levert `false`: dat is
 * de veilige kant voor client-navigatie hierna (naar de schattingen-prompt in
 * plaats van naar lege budget-oppervlakken).
 */
export async function setBudgetTracking(
  supabase: SupabaseClient,
  userId: string,
  assetId: string,
  enabled: boolean,
): Promise<SetBudgetTrackingResult> {
  const { data, error } = await supabase
    .from('assets')
    .update({ has_budget_tracking: enabled })
    .eq('id', assetId)
    .eq('user_id', userId)
    .select(BUDGET_TRACKING_ASSET_SELECT)
    .single()

  if (error) return { ok: false, error }

  await syncBankAccountCompanion(supabase, userId, data, enabled).catch(() => undefined)

  const budgetingActive = await syncBudgetingActive(supabase, userId).catch((gateErr) => {
    // Wél server-side loggen: een geruisloos geslikte gate-desync is een bekend
    // terugkerend defect. De fout zelf bereikt de client niet.
    console.error('[budget-tracking] budgeting_active sync mislukt:', gateErr)
    return false
  })

  return {
    ok: true,
    asset: { id: data.id, has_budget_tracking: data.has_budget_tracking, name: data.name },
    budgetingActive,
  }
}
