import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { APP_SETUP_SLUGS } from '@/lib/app-setup-status'

/**
 * POST /api/crypto-holdings/setup — Eerste-keer setup voor de
 * Crypto-holdings-app.
 *
 * Body: { sources: string[], inputMethod: 'manual' | 'csv' | 'api' }
 *
 * Wat deze route doet:
 *  1. Slaat bron-voorkeur + inputMethod op in `profiles.crypto_input_method`
 *     en `profiles.crypto_sources` (jsonb). Gracieuze fallback bij
 *     ontbrekende kolommen — zelfde patroon als aandelen-setup.
 *  2. Markeert alle crypto-assets met `has_holdings_tracking = true`.
 *  3. Schrijft de feature-visit-marker.
 */

const bodySchema = z.object({
  sources: z.array(z.string()).min(1),
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

  const { sources, inputMethod } = parsed.data

  try {
    const profileUpdate: Record<string, unknown> = {
      crypto_input_method: inputMethod,
      crypto_sources: sources,
    }
    const { error: profErr } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user.id)
    if (profErr) {
      const msg = profErr.message ?? ''
      const onlyMissing =
        msg.includes('crypto_input_method') || msg.includes('crypto_sources')
      if (!onlyMissing) {
        throw new Error(`Profile-update mislukt: ${msg}`)
      }
      console.warn('[crypto-holdings-setup] profile-kolommen ontbreken, voortzetten zonder voorkeur')
    }

    await supabase
      .from('assets')
      .update({ has_holdings_tracking: true })
      .eq('user_id', user.id)
      .eq('asset_type', 'crypto')

    await supabase
      .from('user_feature_visits')
      .upsert(
        { user_id: user.id, feature_slug: APP_SETUP_SLUGS.crypto_holdings },
        { onConflict: 'user_id,feature_slug', ignoreDuplicates: true },
      )
      .then(
        () => undefined,
        () => undefined,
      )

    revalidatePath('/core/assets/crypto')

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    console.error('[crypto-holdings-setup] error:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
