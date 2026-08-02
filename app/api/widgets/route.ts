import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import type { WidgetPref, WidgetSize } from '@/lib/widget-catalog'
import { WIDGET_CATALOG, getWidgetDef } from '@/lib/widget-catalog'

/** Server-side size-sanitering: mini wordt nooit gepersisteerd (→ quarter) en
 *  'xl' (Double) is opt-in — alleen geldig als de catalog-def 'm toestaat. */
function sanitizeSize(id: string, size: unknown): WidgetSize {
  if (size === 'quarter' || size === 'full') return size
  if (size === 'mini') return 'quarter'
  if (size === 'xl' && getWidgetDef(id)?.sizes.includes('xl')) return 'xl'
  return 'half'
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return unauthorized()

    const body = await request.json() as { widgets: WidgetPref[] }
    if (!Array.isArray(body.widgets)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Validate widget ids against catalog + dynamic budget_fav: prefix
    const validIds = new Set(WIDGET_CATALOG.map(w => w.id))
    const sanitized: WidgetPref[] = body.widgets
      .filter(w => validIds.has(w.id) || w.id.startsWith('budget_fav:') || w.id.startsWith('holding_fav:'))
      .map(w => ({
        id: w.id,
        enabled: Boolean(w.enabled),
        size: sanitizeSize(w.id, w.size),
        order: Number(w.order) || 0,
      }))

    const { data, error } = await supabase
      .from('profiles')
      .update({ widget_prefs: { widgets: sanitized } })
      .eq('id', user.id)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('No profile updated')

    // Invalidate server-side cache for pages that render widget preferences
    revalidatePath('/dashboard')
    revalidatePath('/')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[widgets PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// sendBeacon uses POST, not PUT — delegate to the same logic
export const POST = PUT
