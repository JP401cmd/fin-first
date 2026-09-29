import { NextResponse } from 'next/server'
import { errorResponse, forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { isCloudAllowed } from '@/lib/ai/privacy-gate'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { verversEigenTijdlijn } from '@/lib/krant/tijdlijn-vernieuwen'
import { maakAiStap } from '@/lib/krant/tijdlijn-ai'

/**
 * POST /api/krant/tijdlijn/vernieuwen — de knop "Vernieuwen" op /nieuws
 * (Krant 1C fase 2, U11). Geen body.
 *
 * Het id komt uit de sessie (auth.getUser); de verversing schrijft met de
 * service-role omdat krant_edities/items geen INSERT-policy voor sessies
 * hebben — uitsluitend voor dát id (lib/krant/tijdlijn-vernieuwen.ts).
 *
 * Krant 1E (ADR 0190): voor een lezer die de Krant MET AI koos, draait de
 * AI-laag mee. De PRIVACY-POORT staat hier, vóór de laag bestaat
 * (`isCloudAllowed(…, 'nieuws')`: kill-switch én de keuze lokaal/cloud voor
 * nieuws). Weigert hij, dan krijgt de laag `cloudToegestaan: false` en wordt
 * het een gewone verversing zonder AI — geen 403: de lezer vroeg om vernieuwen,
 * niet om AI. Een leesfout op de poort telt als "nee" (fail-closed). De overige
 * poorten (tier, Krant-account, bezwaar, quotum, tegoed) zitten in de laag zelf.
 *
 *   200 { status: 'ververst', items, leeg, ai? } | { status: 'niets-nieuws' }
 *   429 { error, code: 'te_snel' }          hoogstens één verversing per 10 minuten
 *   403                                      deze lezer leest de tijdlijn niet (B40 / bèta-vlag)
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// 90 s (eindreview Y5): de modelcall is begrensd op de resterende tijd min een
// marge voor guards en schrijven, zodat een gekilde functie nooit eindigt met
// een geclaimde rem, een betaalde call en niets geschreven.
export const maxDuration = 90

export async function POST() {
  const startMs = Date.now()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  try {
    const cloudToegestaan = await isCloudAllowed(supabase, user.id, 'nieuws').catch(() => false)
    const aiStap = maakAiStap({ cloudToegestaan, deadline: startMs + maxDuration * 1000 })
    const uitkomst = await verversEigenTijdlijn(getServiceClient(), user.id, { aiStap })
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
