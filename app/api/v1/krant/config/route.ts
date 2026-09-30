import { NextResponse } from 'next/server'
import { vereisBearer } from '@/lib/supabase/bearer'
import { KRANT_V1_CONTRACT_VERSIE, KRANT_V1_MIN_APP_VERSIE } from '@/lib/krant/contract'

/**
 * GET /api/v1/krant/config — contractversie en de oudste app-versie die de
 * server bedient (Krant 3A, ADR 0187).
 *
 * Bewust NIET publiek: ook hier Bearer + module `nieuws`. De app logt in bij
 * Supabase Auth (e-mailcode), niet bij ons, dus een te oude app kan altijd nog
 * inloggen en leert het hier alsnog; zo blijft er onder `/api/v1/` geen enkel
 * pad zonder token (de proxy-poort kent geen uitzonderingen).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await vereisBearer(request, { muteren: false })
  if (!auth.ok) return auth.response
  return NextResponse.json({ contractVersie: KRANT_V1_CONTRACT_VERSIE, minAppVersie: KRANT_V1_MIN_APP_VERSIE })
}
