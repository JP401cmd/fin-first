import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'

/**
 * POST /api/verhuurrendement/setup — Eerste-keer setup voor de
 * Verhuurrendement-app.
 *
 * Body: {
 *   selectedAssetIds: string[] (uuid),
 *   reportingFrequency: 'monthly' | 'quarterly' | 'yearly'
 * }
 *
 * Wat deze route doet:
 *  1. Markeert geselecteerde real-estate-assets met `has_rental_tracking = true`
 *     en alle andere real-estate-assets op false (absolute selectie).
 *  2. Slaat reporting-frequency op profile (`rental_reporting_frequency`).
 *     Gracieuze fallback bij ontbrekende kolom.
 *  3. Schrijft de feature-visit-marker.
 */

const bodySchema = z.object({
  selectedAssetIds: z.array(z.string().uuid()).min(1),
  reportingFrequency: z.enum(['monthly', 'quarterly', 'yearly']),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
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

  const { selectedAssetIds, reportingFrequency } = parsed.data

  try {
    // ── 1. Tracking-flags op real-estate-assets ────────────────
    const { error: clearErr } = await supabase
      .from('assets')
      .update({ has_rental_tracking: false })
      .eq('user_id', user.id)
      .eq('asset_type', 'real_estate')
    if (clearErr) throw new Error(`Real-estate-assets bijwerken mislukt: ${clearErr.message}`)

    const { error: markErr } = await supabase
      .from('assets')
      .update({ has_rental_tracking: true })
      .eq('user_id', user.id)
      .in('id', selectedAssetIds)
    if (markErr) throw new Error(`Panden markeren mislukt: ${markErr.message}`)

    // ── 2. Reporting-frequency op profile (graceful) ───────────
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ rental_reporting_frequency: reportingFrequency })
      .eq('id', user.id)
    if (profErr && !profErr.message?.includes('rental_reporting_frequency')) {
      console.warn('[verhuurrendement-setup] profile-update mislukt:', profErr.message)
    }

    // ── 3. Feature-visit-marker ────────────────────────────────
    await supabase
      .from('user_feature_visits')
      .upsert(
        { user_id: user.id, feature_slug: APP_SETUP_SLUGS.verhuurrendement },
        { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
      )
      .then(
        () => undefined,
        () => undefined,
      )

    revalidatePath('/core/assets/real_estate')

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[verhuurrendement-setup] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
