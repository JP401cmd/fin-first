import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import type { WidgetPref, WidgetSize } from '@/lib/widget-catalog'
import { WIDGET_CATALOG, getWidgetSizes } from '@/lib/widget-catalog'

/** Server-side size-sanitering: mini wordt nooit gepersisteerd (→ quarter) en
 *  'xl' (Double) is opt-in — alleen geldig als de canonieke matenbron 'm toestaat.
 *
 *  LET OP: dit MOET `getWidgetSizes` zijn en niet `getWidgetDef(id)?.sizes`.
 *  Dynamische id's (`spend_limit:*`, `budget_fav:*`, `holding_fav:*`) hebben per
 *  ontwerp geen catalog-def, dus met `getWidgetDef` viel 'xl' hier server-side
 *  STIL terug naar 'half' — de gebruiker koos Double, kreeg Half, zonder enige
 *  foutmelding. `getWidgetSizes` is de enige bron die de prefix-takken kent. */
function sanitizeSize(id: string, size: unknown): WidgetSize {
  if (size === 'quarter' || size === 'full') return size
  if (size === 'mini') return 'quarter'
  if (size === 'xl' && getWidgetSizes(id).includes('xl')) return 'xl'
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

    // Validate widget ids against catalog + dynamische prefixen
    const validIds = new Set(WIDGET_CATALOG.map(w => w.id))
    const sanitized: WidgetPref[] = body.widgets
      .filter(w =>
        validIds.has(w.id) ||
        w.id.startsWith('budget_fav:') ||
        w.id.startsWith('holding_fav:') ||
        w.id.startsWith('spend_limit:')
      )
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
