import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Herberekent `profiles.budgeting_active` op basis van de actieve cash-assets
 * met `has_budget_tracking = true` — dé gate die alle budget-surfaces lezen
 * (budgets-client, dashboard-data-loader, assets-client).
 *
 * Eén gedeelde recompute voor álle schrijfpaden (rekening bewerken/verwijderen,
 * budgetteren-setup) zodat de twee vlaggen nooit uiteenlopen. De setup-route
 * vergat deze sync ooit, waardoor budgetteren "uit" bleef tot een handmatige
 * rekening-save (bug jun 2026).
 *
 * Retourneert de nieuwe waarde van budgeting_active.
 */
export async function syncBudgetingActive(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: trackingAssets } = await supabase
    .from('assets')
    .select('id')
    .eq('user_id', userId)
    .eq('asset_type', 'cash')
    .eq('has_budget_tracking', true)
    .eq('is_active', true)

  const active = (trackingAssets?.length ?? 0) > 0

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ budgeting_active: active })
    .eq('id', userId)
  if (updateError) {
    // Niet stil slikken: een gefaalde gate-write is precies de desync die deze
    // helper moet voorkomen. Callers kiezen zelf best-effort (catch) of hard falen.
    throw new Error(`budgeting_active bijwerken mislukt: ${updateError.message}`)
  }

  return active
}
