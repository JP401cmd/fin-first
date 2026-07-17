import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'

/**
 * POST /api/hypotheekplanner/setup — Eerste-keer setup voor de
 * Hypotheekplanner-app.
 *
 * Body: { mortgageId: string (uuid), strategy: 'aflossen' | 'beleggen' | 'mix' }
 *
 * Wat deze route doet:
 *  1. Markeert de gekozen mortgage met `has_hypotheekplanner_tracking = true`
 *     en alle andere mortgages op false (max één planner-mortgage tegelijk).
 *  2. Schrijft de strategy-voorkeur op de mortgage in
 *     `debts.hypotheekplanner_strategy`. Bij ontbrekende kolom: gracieuze
 *     degradatie — strategie blijft impliciet via UI-state.
 *  3. Schrijft de feature-visit-marker.
 */

const bodySchema = z.object({
  mortgageId: z.string().uuid(),
  strategy: z.enum(['aflossen', 'beleggen', 'mix']),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  let parsed
  try {
    parsed = bodySchema.safeParse(await req.json())
  } catch {
    return Response.json({ error: 'Ongeldige body' }, { status: 400 })
  }
  if (!parsed.success) {
    return Response.json(
      { error: 'Ongeldige invoer', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { mortgageId, strategy } = parsed.data

  try {
    // ── 1. Tracking-flags op debts ─────────────────────────────
    const { error: clearErr } = await supabase
      .from('debts')
      .update({ has_hypotheekplanner_tracking: false })
      .eq('user_id', user.id)
      .eq('debt_type', 'mortgage')
    if (clearErr) throw new Error(`Mortgages bijwerken mislukt: ${clearErr.message}`)

    const update: Record<string, unknown> = { has_hypotheekplanner_tracking: true }
    // Strategy-veld is optioneel-bestaande kolom; retry zonder bij missing-column.
    update.hypotheekplanner_strategy = strategy
    const { error: markErr } = await supabase
      .from('debts')
      .update(update)
      .eq('user_id', user.id)
      .eq('id', mortgageId)
    if (markErr) {
      const msg = markErr.message ?? ''
      if (msg.includes('hypotheekplanner_strategy')) {
        // Kolom ontbreekt — retry zonder
        const { error: retryErr } = await supabase
          .from('debts')
          .update({ has_hypotheekplanner_tracking: true })
          .eq('user_id', user.id)
          .eq('id', mortgageId)
        if (retryErr) throw new Error(`Hypotheek markeren mislukt: ${retryErr.message}`)
      } else {
        throw new Error(`Hypotheek markeren mislukt: ${msg}`)
      }
    }

    // ── 2. Feature-visit-marker ────────────────────────────────
    await supabase
      .from('user_feature_visits')
      .upsert(
        { user_id: user.id, feature_slug: APP_SETUP_SLUGS.hypotheekplanner },
        { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
      )
      .then(
        () => undefined,
        () => undefined,
      )

    revalidatePath('/core/debts/mortgage')
    revalidatePath('/core/assets/eigen_huis')

    return Response.json({ success: true })
  } catch (err) {
    return serverError(err, 'hypotheekplanner-setup:POST')
  }
}
