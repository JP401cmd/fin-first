import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/sync/daily-open
 *
 * Server-side dag-gate voor de "eerste-open-van-de-dag" prijs-sync. Cross-device
 * via `profiles.last_price_sync_at` (i.t.t. localStorage, dat per apparaat is).
 *
 * Claimt de dag ATOMISCH met één conditionele UPDATE: alleen als er vandaag (UTC,
 * consistent met de snapshot_date-key) nog niet geclaimd is, wordt
 * `last_price_sync_at` op nu gezet en antwoordt de route `{ due: true }` — het
 * signaal voor de client om de prijs-sync + het history-punt te starten. Is de
 * dag al geclaimd (andere tab/apparaat vandaag), dan raakt de UPDATE geen rij en
 * antwoordt de route `{ due: false }`. Zo synct maar één opener per dag, zonder
 * race tussen tabs/apparaten.
 *
 * LET OP — geen `.select()` achter deze update (productie-incident 17 jul 2026):
 * PostgREST past bij `Prefer: return=representation` de `or=`-filter toe op de
 * teruggave-projectie; met `select=id` bestaat de filterkolom daar niet en faalt
 * de hele claim met 42703 ("column … does not exist" — misleidend, de kolom
 * bestaat wél). Daarom `{ count: 'exact' }` zonder representation: de count van
 * geraakte rijen vertelt of wíj de dag claimden, zonder het kapotte pad.
 *
 * Eigen-rij only — RLS op profiles dwingt af dat een gebruiker alleen de eigen rij
 * leest/schrijft (auth.uid() = id). Geen service-role. Spiegelt app/api/appearance.
 *
 * Bewuste keuze: de dag wordt geclaimd VÓÓR de sync draait. Faalt de sync daarna,
 * dan wordt er die dag niet opnieuw client-side gesynct — de dagelijkse prijs-cron
 * (18:00 UTC) is het vangnet. Dat is de juiste trade-off: geen dubbele/herhaalde
 * client-syncs op één dag.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const now = new Date()
  // UTC-dag, consistent met net_worth_snapshots.snapshot_date.
  const todayStart = `${now.toISOString().split('T')[0]}T00:00:00.000Z`

  // Atomische claim: zet last_price_sync_at alleen als 'ie null is of vóór
  // vandaag ligt. count > 0 ⇒ wij raakten de rij ⇒ wij claimden de dag ⇒ due.
  const { count, error } = await supabase
    .from('profiles')
    .update({ last_price_sync_at: now.toISOString() }, { count: 'exact' })
    .eq('id', user.id)
    .or(`last_price_sync_at.is.null,last_price_sync_at.lt.${todayStart}`)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ due: (count ?? 0) > 0 })
}
