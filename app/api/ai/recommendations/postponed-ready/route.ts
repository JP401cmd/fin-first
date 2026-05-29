import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/ai/recommendations/postponed-ready
 *
 * Telt postponed-voorstellen waarvan de terugkomdatum
 * (`postponed_until`) verstreken is. Gebruikt door de chat-FAB om een
 * badge te tonen ("Will heeft N uitgestelde voorstellen klaar voor
 * herbeoordeling") en discoverability te bieden voor de
 * `?prompt=herbekijk-uitgesteld` flow.
 *
 * Lichtgewicht: alleen count, geen titels. De chat-zelf krijgt de
 * volledige lijst via buildRecommendationContext.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ count: 0 }, { status: 401 })
  }

  const nowIso = new Date().toISOString()
  const { count, error } = await supabase
    .from('recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'postponed')
    .lte('postponed_until', nowIso)

  if (error) {
    return Response.json({ count: 0 })
  }

  return Response.json({ count: count ?? 0 })
}
