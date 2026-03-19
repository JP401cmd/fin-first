import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { WidgetPref } from '@/lib/widget-catalog'
import { WIDGET_CATALOG } from '@/lib/widget-catalog'

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
        size: w.size === 'full' ? 'full' : w.size === 'quarter' ? 'quarter' : w.size === 'mini' ? 'quarter' : 'half',
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
    revalidatePath('/will')
    revalidatePath('/')

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[widgets PUT]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
