import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * POST /api/aandelen-holdings/setup — Eerste-keer setup voor de
 * Aandelen-holdings-app.
 *
 * Body: {
 *   selectedAssetIds: string[] (uuid),
 *   brokers?: string[],
 *   inputMethod?: 'manual' | 'csv' | 'api'
 * }
 *
 * Wat deze route doet:
 *  1. Slaat — indien meegegeven — broker-voorkeur + inputMethod op in
 *     `profiles.aandelen_input_method` en `profiles.aandelen_brokers` (jsonb).
 *     Sinds de versimpelde setup (aug 2026, alleen bezittingen-selectie)
 *     stuurt de gate deze velden niet meer mee; ze blijven optioneel
 *     geaccepteerd voor oudere clients. Bij ontbrekende kolommen wordt
 *     gracieus gedegradeerd.
 *  2. Markeert de geselecteerde investment-assets met `has_holdings_tracking = true`
 *     en alle andere investment-assets op false (absolute selectie).
 *  3. Schrijft de feature-visit-marker.
 */

const bodySchema = z.object({
  selectedAssetIds: z.array(z.string().uuid()).min(1),
  brokers: z.array(z.string()).optional(),
  inputMethod: z.enum(['manual', 'csv', 'api']).optional(),
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

  const { selectedAssetIds, brokers, inputMethod } = parsed.data

  try {
    // ── 1. Voorkeur opslaan op profile (alleen als een client ze meestuurt) ──
    // Bij ontbrekende kolommen retry zonder die kolom; de marker blijft
    // staan ook als de voorkeuren niet bewaard worden.
    if (brokers !== undefined || inputMethod !== undefined) {
      const profileUpdate: Record<string, unknown> = {}
      if (inputMethod !== undefined) profileUpdate.aandelen_input_method = inputMethod
      if (brokers !== undefined) profileUpdate.aandelen_brokers = brokers
      const { error: profErr } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id)
      if (profErr) {
        const msg = profErr.message ?? ''
        const onlyMissing =
          msg.includes('aandelen_input_method') || msg.includes('aandelen_brokers')
        if (!onlyMissing) {
          throw new Error(`Profile-update mislukt: ${msg}`)
        }
        // Migratie ontbreekt — best-effort: skip profile-update, ga door.
        console.warn('[aandelen-holdings-setup] profile-kolommen ontbreken, voortzetten zonder voorkeur')
      }
    }

    // ── 2. Tracking-flags op investment-assets (clear-all-then-mark-selected) ──
    const { error: clearErr } = await supabase
      .from('assets')
      .update({ has_holdings_tracking: false })
      .eq('user_id', user.id)
      .eq('asset_type', 'investment')
    if (clearErr) throw new Error(`Beleggingen bijwerken mislukt: ${clearErr.message}`)

    const { error: markErr } = await supabase
      .from('assets')
      .update({ has_holdings_tracking: true })
      .eq('user_id', user.id)
      .in('id', selectedAssetIds)
    if (markErr) throw new Error(`Beleggingen markeren mislukt: ${markErr.message}`)

    // ── 3. Feature-visit-marker ────────────────────────────────
    await supabase
      .from('user_feature_visits')
      .upsert(
        { user_id: user.id, feature_slug: APP_SETUP_SLUGS.aandelen_holdings },
        { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
      )
      .then(
        () => undefined,
        () => undefined,
      )

    revalidatePath('/core/assets/investment')

    return Response.json({ success: true })
  } catch (err) {
    return serverError(err, 'aandelen-holdings-setup:POST')
  }
}
