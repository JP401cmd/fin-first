import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Check if TrueLayer integration is enabled in app_settings.
 * Returns false by default (feature is opt-in via admin toggle).
 */
export async function isTrueLayerEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'truelayer_enabled')
    .single()

  return data?.value === 'true'
}
