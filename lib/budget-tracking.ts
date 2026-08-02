import type { SupabaseClient } from '@supabase/supabase-js'
import { syncBudgetingActive } from '@/lib/budgeting-active'
import { syncBankAccountCompanion } from '@/lib/bank-account-companion'
import { resolveAssetAccountNumber } from '@/lib/asset-account-number'

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
 * De select haalt BEIDE rekeningnummer-kolommen op; `resolveAssetAccountNumber`
 * (`lib/asset-account-number.ts`) bepaalt welke wint. Drie dingen die hier
 * vastliggen en gepind zijn in `app/api/assets/toggle-budget/route.test.ts`:
 *
 *  1. **Er bestaat GEEN `assets.iban`.** Hier stond een PostgREST-alias
 *     `iban:account_number` die de rij ongewijzigd als `CompanionAssetInput`
 *     doorgaf. De companion verwacht het veld nog steeds als `iban`, dus de
 *     mapping gebeurt nu expliciet bij de aanroep hieronder.
 *  2. **`account_number_encrypted` moet erbij.** Sinds
 *     `20260802093000_auto_link_cash_asset_encrypted_iban.sql` vult de
 *     auto-link-trigger bij een bankkoppeling uitsluitend de versleutelde
 *     kolommen. Las deze select alleen plaintext, dan kreeg élke via de bank
 *     aangemaakte cash-bezitting géén IBAN op de companion — en een companion
 *     zonder IBAN valt uit de eigen-rekeningherkenning, waarna interne
 *     overboekingen als échte inkomst én uitgave meetellen.
 *  3. **`account_number` blijft erbij tot de drop.** `AssetForm` slaat een
 *     bewerkte cash-bezitting client-side op en schrijft daar alléén de
 *     plaintext-kolom; die is voor handmatig ingevoerde nummers dus de verse
 *     waarde. Zie de drop-instructie in `resolveAssetAccountNumber`.
 *
 * De waarde gaat niet naar het scherm maar naar `syncBankAccountCompanion`, die
 * 'm via `ibanWriteColumns` naar de drie IBAN-kolommen van de companion-rij
 * schrijft. Daarom ontsleutelen we hier écht in plaats van de blind index te
 * gebruiken: er wordt niets vergeleken, er wordt een waarde doorgeschreven — en
 * `bank_accounts.iban` (plaintext, nog niet gedropt) moet coherent blijven.
 */
export const BUDGET_TRACKING_ASSET_SELECT =
  'id, has_budget_tracking, name, account_number, account_number_encrypted, institution, subtype, ownership, household_id, current_value'

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

  // Best-effort, maar niet geruisloos (securityreview 30 juli): een geslikte
  // companion-fout laat de rekening uit `/core/cash` en de import verdwijnen
  // terwijl `has_budget_tracking` al aanstaat — dezelfde klasse stille desync als
  // een gefaalde gate-write hieronder, en sinds het SC-13-herstel óók bereikbaar
  // vanuit de bankkoppeling. De fout bereikt de client nog steeds niet.
  // `iban` expliciet gemapt: er bestaat geen `assets.iban`, en de companion
  // verwacht het rekeningnummer onder die naam. `resolveAssetAccountNumber` gooit
  // bewust niet — een throw zou hier buiten de best-effort `.catch()` hieronder
  // vallen (synchroon, vóór de promise) en de route alsnog in een 500 laten
  // eindigen terwijl de asset-vlag al weggeschreven is.
  const companionAsset = { ...data, iban: resolveAssetAccountNumber(data) }

  await syncBankAccountCompanion(supabase, userId, companionAsset, enabled).catch((companionErr) => {
    console.error('[budget-tracking] companion-sync mislukt:', companionErr)
  })

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
