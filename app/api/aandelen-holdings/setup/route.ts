import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'

/**
 * POST /api/aandelen-holdings/setup — Eerste-keer setup voor de
 * Aandelen-holdings-app.
 *
 * Body: { brokers: string[], inputMethod: 'manual' | 'csv' | 'api' }
 *
 * Wat deze route doet:
 *  1. Slaat broker-voorkeur + inputMethod op in `profiles.aandelen_input_method`
 *     en `profiles.aandelen_brokers` (jsonb). Bij ontbrekende kolommen
 *     (migratie nog niet toegepast) wordt gracieus gedegradeerd — alleen
 *     de feature-visit-marker wordt dan gezet zodat de gate verdwijnt.
 *  2. Markeert alle investment-assets met `has_holdings_tracking = true` —
 *     conform de bestaande tracking-flag-semantiek.
 *  3. Schrijft de feature-visit-marker.
 */

const bodySchema = z.object({
  brokers: z.array(z.string()).min(1),
  inputMethod: z.enum(['manual', 'csv', 'api']),
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

  const { brokers, inputMethod } = parsed.data

  try {
    // ── 1. Voorkeur opslaan op profile ─────────────────────────
    // Bij ontbrekende kolommen retry zonder die kolom; de marker blijft
    // staan ook als de voorkeuren niet bewaard worden.
    const profileUpdate: Record<string, unknown> = {
      aandelen_input_method: inputMethod,
      aandelen_brokers: brokers,
    }
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

    // ── 2. Tracking-flags op investment-assets ─────────────────
    await supabase
      .from('assets')
      .update({ has_holdings_tracking: true })
      .eq('user_id', user.id)
      .eq('asset_type', 'investment')

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
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[aandelen-holdings-setup] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
