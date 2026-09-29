import { NextResponse } from 'next/server'
import { errorResponse, forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { verversEigenTijdlijn } from '@/lib/krant/tijdlijn-vernieuwen'

/**
 * POST /api/krant/tijdlijn/vernieuwen — de knop "Vernieuwen" op /nieuws
 * (Krant 1C fase 2, U11). Geen body.
 *
 * Het id komt uit de sessie (auth.getUser); de verversing schrijft met de
 * service-role omdat krant_edities/items geen INSERT-policy voor sessies
 * hebben — uitsluitend voor dát id (lib/krant/tijdlijn-vernieuwen.ts).
 *
 *   200 { status: 'ververst', items, leeg } | { status: 'niets-nieuws' }
 *   429 { error, code: 'te_snel' }          hoogstens één verversing per 10 minuten
 *   403                                      deze lezer leest de tijdlijn niet (B40 / bèta-vlag)
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  try {
    const uitkomst = await verversEigenTijdlijn(getServiceClient(), user.id)
    if (uitkomst.status === 'geen-tijdlijn') return forbidden()
    if (uitkomst.status === 'te-snel') {
      const res = errorResponse('Je hebt net vernieuwd. Probeer het over een paar minuten opnieuw.', 429, 'te_snel')
      const wacht = Math.max(1, Math.ceil((new Date(uitkomst.opnieuwVanaf).getTime() - Date.now()) / 1000))
      res.headers.set('Retry-After', String(wacht))
      return res
    }
    return NextResponse.json(uitkomst)
  } catch (err) {
    return serverError(err, 'krant-tijdlijn-vernieuwen:POST')
  }
}
