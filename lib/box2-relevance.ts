import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Bepaalt of Box 2 (aanmerkelijk belang) relevant is voor de gebruiker.
 *
 * Spiegelt de detectie-breedte van /api/household/box2 (zie
 * app/api/household/box2/route.ts): Box 2 wordt berekend uit drie bronnen —
 * deelneming-assets, DGA-vorderingen (asset_type 'vordering' + subtype
 * 'dga_lening') en DGA-schulden (debt_type 'dga_schuld', voor de Wet
 * excessief lenen). Een eerdere versie checkte alléén op deelneming-assets,
 * waardoor de Box 2-empty-state een echte excessief-lenen-heffing verborg
 * voor een DGA die wél DGA-leningen registreert maar geen losse deelneming.
 *
 * Query is user-scoped (RLS dekt dit al; eq('user_id') houdt het expliciet),
 * en stopt bij het eerste resultaat (`limit(1)`) — puur een ja/nee-gate.
 */
export async function hasBox2Relevance(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const [assetsRes, debtsRes] = await Promise.all([
    supabase
      .from('assets')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .or('asset_type.eq.deelneming,and(asset_type.eq.vordering,subtype.eq.dga_lening)')
      .limit(1),
    supabase
      .from('debts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('debt_type', 'dga_schuld')
      .limit(1),
  ])
  return (assetsRes.data?.length ?? 0) > 0 || (debtsRes.data?.length ?? 0) > 0
}
