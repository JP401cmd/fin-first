import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * PUT /api/recurring/[id] — Update name and/or category override for a
 * recurring transaction.
 *
 * Body (all optional):
 *   name             string
 *   category_override  'subscription' | 'vaste_kosten' | 'excluded' | null
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { name, category_override } = body

    // Validate category_override when provided
    const validOverrides = ['subscription', 'vaste_kosten', 'excluded', null]
    if (category_override !== undefined && !validOverrides.includes(category_override)) {
      return NextResponse.json({ error: 'Ongeldige categorie' }, { status: 400 })
    }

    // Build update object — only include fields that were explicitly sent
    const update: Record<string, unknown> = {}
    if (name !== undefined) update.name = name
    if (category_override !== undefined) update.category_override = category_override

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Niets om te wijzigen' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('recurring_transactions')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[PUT /api/recurring]', error)
      return NextResponse.json({ error: 'Wijziging mislukt' }, { status: 500 })
    }

    return NextResponse.json({ success: true, recurring: data })
  } catch (err) {
    console.error('[PUT /api/recurring]', err)
    return NextResponse.json({ error: 'Interne fout' }, { status: 500 })
  }
}
