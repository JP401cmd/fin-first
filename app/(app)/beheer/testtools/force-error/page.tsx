import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { ForceErrorClient } from './force-error-client'

export const metadata: Metadata = { title: 'Foutpagina forceren — Beheer' }
export const dynamic = 'force-dynamic'

/**
 * /beheer/testtools/force-error — dataloze superadmin-testtool die de
 * app-brede error-boundary (`app/(app)/error.tsx`) live triggerbaar maakt
 * voor UAT WF-NAV-26. Zonder deze route is dat scenario alleen te testen door
 * tijdelijk broncode aan te passen, wat een live-run verbiedt.
 *
 * Twee lagen toegangscontrole, conform de "Prod surface"-lijn van de
 * security-checklist (één laag was daar de les):
 *  1. `app/(app)/beheer/layout.tsx` redirect elke niet-superadmin naar
 *     /overzicht — die gate dekt de hele beheersectie.
 *  2. Deze eigen `isSuperAdmin`-check → `notFound()`. Bewust 404 en niet 403:
 *     een 403 bevestigt dat de route bestaat, een 404 verraadt niets.
 *
 * Bewust GEEN dev-only guard (DEV_ONLY_PATHS in lib/supabase/proxy.ts): dat
 * mechanisme is voor dev-harness-API's die in productie niet mogen bestaan.
 * Deze pagina moet juist óp productie bereikbaar zijn — daar draait de
 * live UAT-run. Ze is dataloos en zonder side-effects, dus het bezwaar tegen
 * prod-debugroutes (data- of gedragsblootstelling) geldt hier niet.
 */
export default async function BeheerForceErrorPage() {
  const supabase = await createClient()
  const isAdmin = await isSuperAdmin(supabase)

  if (!isAdmin) {
    notFound()
  }

  return <ForceErrorClient />
}
