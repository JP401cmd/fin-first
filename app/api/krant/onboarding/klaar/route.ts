import { NextResponse } from 'next/server'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedUser } from '@/lib/supabase/cached-user'
import { getServiceClient } from '@/lib/supabase/service'
import { krantOnboardingToegang, stappenNaKlaar } from '@/lib/krant/aanmelden'
import { verversEigenTijdlijn, type VernieuwUitkomst } from '@/lib/krant/tijdlijn-vernieuwen'

/**
 * POST /api/krant/onboarding/klaar — de laatste stap van de Krant-onboarding
 * (Krant 2C, ADR 0192; keuze 1A van 2D). Geen body.
 *
 * 1. Zet op de EIGEN rij (sessie-client, RLS) `onboarding_completed = true` en
 *    voegt `'krant'` toe aan `completed_onboarding_steps`. NOOIT `'identity'`:
 *    die stap betekent "de onboarding van het Geheel is gedaan", en 2D leest
 *    hem om te beslissen of iemand na de overstap naar het Geheel nog door die
 *    onboarding moet. Een bestaande waarde laten we staan.
 * 2. Start de eerste verversing van de tijdlijn (`verversEigenTijdlijn`, met de
 *    id uit de SESSIE — dezelfde helper als de knop "Vernieuwen"). Die schrijft
 *    met de service-role, omdat krant_edities/items bewust geen INSERT-policy
 *    voor sessies hebben; elke query draagt daar een `.eq(…, userId)`. De
 *    AI-laag draait niet mee (geen `aiStap`): een Krant-account krijgt nooit AI.
 *    Mislukt de verversing, dan is de onboarding tóch af: de tijdlijncron en de
 *    knop op /nieuws halen het in.
 *
 * Achter de gesloten vlag: alleen voor een Krant-account dat de tijdlijn leest
 * (`krantOnboardingToegang`); voor ieder ander een 404, en dan is er niets
 * geschreven.
 *
 *   200 { ok: true, eersteVerversing: 'ververst' | 'niets-nieuws' | 'te-snel' | 'geen-tijdlijn' | 'mislukt' }
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  try {
    const supabase = await createClient()
    const user = await getVerifiedUser(supabase)
    if (!user) return unauthorized()

    const toegang = await krantOnboardingToegang(supabase, user.id)
    if (toegang === 'geen') return notFound()

    const { data: profiel, error: leesFout } = await supabase
      .from('profiles')
      .select('completed_onboarding_steps')
      .eq('id', user.id)
      .single()
    if (leesFout) throw leesFout

    const { error: schrijfFout } = await supabase
      .from('profiles')
      .update({ onboarding_completed: true, completed_onboarding_steps: stappenNaKlaar(profiel?.completed_onboarding_steps) })
      .eq('id', user.id)
    if (schrijfFout) throw schrijfFout

    let eersteVerversing: VernieuwUitkomst['status'] | 'mislukt'
    try {
      eersteVerversing = (await verversEigenTijdlijn(getServiceClient(), user.id)).status
    } catch (err) {
      console.error('[krant-onboarding:klaar] eerste verversing mislukt:', err)
      eersteVerversing = 'mislukt'
    }

    return NextResponse.json({ ok: true, eersteVerversing })
  } catch (err) {
    return serverError(err, 'krant-onboarding-klaar:POST')
  }
}
