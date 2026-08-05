import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { loadVariantenSweepSnapshot } from '@/lib/tax-lifetime/varianten-sweep-loader'

/**
 * GET /api/belasting/varianten-sweep — de INVOER van de fiscale variantensweep.
 *
 * Levert uitsluitend de serialiseerbare `VariantenSweepSnapshot`; er wordt hier
 * GEEN sweep gedraaid. De drie kernel-solves horen achter een expliciete
 * gebruikersactie en off-main-thread in de kernel-worker (zie
 * `lib/tax-lifetime/varianten-sweep.ts` → "Waar dit draait").
 *
 * ## Waarom een route en niet de page-render
 * `loadVariantenSweepSnapshot` kost op de optimizer-pagina één horizon-load plus
 * één kernel-solve: `computeHorizonFireSim` is React-`cache()`'d, maar op déze
 * route is die cache koud — de optimizer-loader gebruikt `loadHorizonData`, niet
 * de kernel-run. Aan de page-render hangen zou dus élke bezoeker een extra solve
 * in zijn TTFB kosten (plus de volledige `rawContext` in de RSC-payload van
 * iedere paginaweergave) voor een sectie die pas op verzoek rekent. Achter deze
 * route betaalt alleen de gebruiker die de sweep écht opvraagt, en blijft de
 * pagina exact zo snel als hij nu is.
 *
 * `snapshot: null` = de canonieke Horizon-run is niet mogelijk (geen
 * geboortedatum/profielrij/kern-fout). Dat is een NETTE uitkomst, geen fout: het
 * oppervlak toont dan zijn "nog geen toekomstplan"-staat.
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  try {
    // Geen `box1Jaar`-parameter: de sweep valt zelf terug op CURRENT_TAX_YEAR, in
    // lockstep met de rest van de belastinglaag. Het gebruikte jaar komt terug in
    // `VariantenSweepResultaat.box1Jaar` en wordt daar getoond.
    const snapshot = await loadVariantenSweepSnapshot(supabase)
    return NextResponse.json({ snapshot })
  } catch (err) {
    return serverError(err, 'belasting/varianten-sweep:GET')
  }
}
