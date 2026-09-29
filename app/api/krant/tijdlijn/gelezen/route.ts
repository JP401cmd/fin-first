import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { krantBronVoor } from '@/lib/krant/tijdlijn-bron'

/**
 * PUT /api/krant/tijdlijn/gelezen — "tot hier gelezen" voor de tijdlijn
 * (Krant 1C fase 2). Zet `nieuwsprofiel.tijdlijn_gelezen_tot` op nu; voedt
 * "nieuw sinds je laatste bezoek" en de nieuwsstip, op elk apparaat gelijk.
 * Geen body: het tijdstip is altijd de servertijd.
 *
 * Eigen-rij-voorkeur (CLAUDE.md datapad (1)): own-row upsert via de
 * SESSIE-client, zoals /api/appearance. De kolomgrant van migratie
 * 20261004120000 staat precies deze kolom (plus user_id/updated_at) toe;
 * krant_variant en afgeleid_at kan een sessie hier niet raken.
 * Alleen voor wie de tijdlijn leest (security G3, 29-09): buiten de bèta maakt
 * niemand zo een nieuwsprofiel-rij aan.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PUT() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { bron } = await krantBronVoor(supabase, user.id)
  if (bron !== 'tijdlijn') return forbidden()

  const nu = new Date().toISOString()
  const { error } = await supabase
    .from('nieuwsprofiel')
    .upsert({ user_id: user.id, tijdlijn_gelezen_tot: nu, updated_at: nu }, { onConflict: 'user_id' })
  if (error) return serverError(error, 'krant-tijdlijn-gelezen:PUT')
  return NextResponse.json({ gelezenTot: nu })
}
