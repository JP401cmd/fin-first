// GET /api/integrations/connections
//
// JSON-versie van `loadConnectionsData()` voor de globale sync-rapport-modal in
// de header. De modal kan niet leunen op de bestaande server-pagina
// (`/mijn/koppelingen`) omdat hij client-side gemount wordt en zijn data
// optimistisch refresht na elke sync-actie.
//
// Geen body, geen query-params — de modal wil altijd de volledige actuele state
// van de ingelogde gebruiker.

import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { loadConnectionsData } from '@/lib/connections-data'

export async function GET() {
  const supabase = await createClient()

  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip
  // (ADR 0051). loadConnectionsData() doet zelf nog een interne getUser()-call
  // om de RLS-scoping op te bouwen — dat is gedeelde code buiten deze route en
  // blijft ongewijzigd (bespaart alleen de onbevoegde-aanvraag-roundtrip hier).
  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  try {
    const data = await loadConnectionsData(supabase)
    return NextResponse.json(data, {
      headers: {
        // De modal-data is per-user en mag niet gecached worden door de browser
        // of CDN — `last_synced_at` muteert direct na elke sync-actie.
        'cache-control': 'no-store',
      },
    })
  } catch (err) {
    return serverError(err, 'integrations-connections:GET')
  }
}
