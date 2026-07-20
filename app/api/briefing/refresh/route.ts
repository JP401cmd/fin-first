import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadAndComposeOverviewBriefing } from '@/lib/briefing/overview-briefing'
import {
  readBriefingSnapshot,
  canRefreshToday,
  applyManualRefresh,
} from '@/lib/briefing/snapshot'
import {
  loadBriefingDirectives,
  buildEngineMetrics,
  buildDirectivesBlock,
  redactBriefing,
  applyRedactie,
} from '@/lib/briefing/redactie'
import { checkTierGate } from '@/lib/require-tier'

/**
 * POST /api/briefing/refresh
 *
 * Handmatige dagelijkse ververs van de /overzicht-briefing. Mag maximaal
 * 1× per kalenderdag (Amsterdam). Recomposeert de briefjes deterministisch
 * uit verse data en laat Fin ze daarna redigeren (kop-zin + teksten) in
 * één AI-call, gestuurd door de beheer-directives. Elke AI-fout of
 * afgekeurde tekst (nummer-guard) valt stil terug op de deterministische
 * variant — zie lib/briefing/redactie.ts.
 *
 * Response:
 *  - { allowed: true, entries, refreshedAt, headline } — ververst en opgeslagen
 *  - { allowed: false, refreshedAt }                    — vandaag al ververst (no-op)
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // AI-abonnementspoort: de ververs herschrijft de briefjes in Fin's stem via
  // een model-call (getModel(supabase, 'briefing')) — een betaalde AI-functie.
  // Afdwingen vóór het dure werk zodat een gebruiker zonder 'ai' de model-call
  // niet 1×/dag kan afvuren. De deterministische briefing op /overzicht blijft
  // gratis en ongemoeid (dit pad is enkel de handmatige AI-redactie-ververs).
  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) {
    return NextResponse.json({ error: gate.error }, { status: 403 })
  }

  try {
    // Poort vóór het dure werk: check de 1×-per-dag-regel eerst, zodat een al
    // gebruikte ververs niet alsnog de volledige dashboard/will/horizon-loaders
    // (~21+ queries) + AI-call draait. Voorkomt een geauthenticeerde abuse-route.
    const existing = await readBriefingSnapshot(supabase, user.id)
    if (!canRefreshToday(existing)) {
      return NextResponse.json({
        allowed: false,
        refreshedAt: existing?.refreshedAt ?? null,
      })
    }

    const now = new Date()
    const { entries, freedom, input } = await loadAndComposeOverviewBriefing(supabase, now)

    // AI-redactie: directives uit beheer + metrics uit de engine-input sturen
    // de herschrijving. Faalt dit (AI uit, fout, guard) → deterministisch.
    const directives = await loadBriefingDirectives(supabase)
    const directivesBlock = buildDirectivesBlock(directives, now, buildEngineMetrics(input))
    const { headline, texts } = await redactBriefing(supabase, entries, { directivesBlock })
    const redactedEntries = applyRedactie(entries, texts)

    const { allowed, snapshot } = await applyManualRefresh(supabase, user.id, redactedEntries, {
      freedom: { ...freedom, capturedAt: new Date().toISOString() },
      headline: headline ?? undefined,
    })
    if (!allowed) {
      return NextResponse.json({
        allowed: false,
        refreshedAt: snapshot.refreshedAt,
      })
    }
    return NextResponse.json({
      allowed: true,
      entries: snapshot.entries,
      refreshedAt: snapshot.refreshedAt,
      headline: snapshot.headline ?? null,
    })
  } catch (err) {
    console.error('[briefing/refresh] POST error:', err)
    return NextResponse.json(
      { error: 'Kon briefing niet verversen' },
      { status: 500 },
    )
  }
}
