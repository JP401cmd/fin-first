// GET /api/integrations/connections
//
// JSON-versie van `loadConnectionsData()` voor de globale sync-rapport-modal in
// de header. De modal kan niet leunen op de bestaande server-pagina
// (`/identity/koppelingen`) omdat hij client-side gemount wordt en zijn data
// optimistisch refresht na elke sync-actie.
//
// Geen body, geen query-params — de modal wil altijd de volledige actuele state
// van de ingelogde gebruiker.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadConnectionsData } from '@/lib/connections-data'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
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
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
