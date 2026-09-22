import { NextResponse } from 'next/server'
import { forbidden, serverError, unauthorized } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { laadTesteditie } from '@/lib/krant/testeditie'
import { magTesteditieZien } from '@/lib/krant/testeditie-toegang'

/**
 * GET /api/krant/testeditie — de EIGEN schaduweditie van de aanroeper, met
 * alles wat één regel herleidbaar maakt (sjabloon, slots, het ruwe impactbereik,
 * wat mist, waarom). Keuze 12 op kaart 1B: itemcontrole vóór 1C, zichtbaar voor
 * SUPERADMIN (22 sep: versmald van testaccounts+superadmin — zie
 * lib/krant/testeditie-toegang.ts).
 *
 * GEEN beheer-route en geen uitzondering op ADR 0146:
 *  - er is geen parameter voor een andere gebruiker; het id komt uit
 *    `auth.getUser()`;
 *  - de lezing loopt over de sessie-client, dus onder de own-row-RLS van
 *    migratie 20260922120000 — een superadmin krijgt hier zijn eigen editie,
 *    nooit die van een ander;
 *  - er komt geen service-role aan te pas.
 * De motivering en de bewaking staan in lib/krant/testeditie.ts en
 * lib/krant/testeditie.gate.test.ts.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!(await magTesteditieZien(supabase, user.id))) return forbidden()

  try {
    const editie = await laadTesteditie(supabase, user.id)
    return NextResponse.json({ editie })
  } catch (err) {
    return serverError(err, 'krant-testeditie:GET')
  }
}
