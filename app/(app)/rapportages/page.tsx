import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadRapportagesData } from '@/lib/rapportages-data-loader'
import { RapportagesClient } from './rapportages-client'

/**
 * Rapportage-hub — serverpagina.
 *
 * Het archief én de abonnementsstand komen uit `loadRapportagesData` en gaan als
 * props mee (ADR 0058: lezen via loader). Dat is hier niet alleen conventie: de
 * hub moet een vergrendelde rapportvorm vóór de klik kunnen tonen, en dat kan
 * alleen als de server vertelt of de AI-add-on er is.
 *
 * `getCachedUser` i.p.v. `auth.getUser()`: de layout haalt de user al zo op, dus
 * dit deelt diezelfde React-`cache()` — geen tweede JWT-roundtrip.
 */
export default async function RapportagesPage() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  if (!user) redirect('/login')

  const data = await loadRapportagesData(supabase, user.id)

  return <RapportagesClient data={data} />
}
