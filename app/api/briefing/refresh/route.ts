import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { getModel } from '@/lib/ai/config'
import {
  loadAndComposeOverviewBriefing,
  sanitizeAiHeadline,
} from '@/lib/briefing/overview-briefing'
import {
  readBriefingSnapshot,
  canRefreshToday,
  applyManualRefresh,
} from '@/lib/briefing/snapshot'
import type { BriefingEntry } from '@/components/overview/briefing-panel'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Genereer één Will-kop-zin uit de gecomposeerde briefjes. Alléén bij een
 * handmatige ververs (buiten de render-hot-path, 1×/dag-gepoort). Faalt de
 * AI-call of is AI niet geconfigureerd → null, en valt /overzicht terug op de
 * deterministische kop (`snapshot.headline ?? buildBriefingHeadline(...)`).
 */
async function generateBriefingHeadline(
  supabase: SupabaseClient,
  entries: BriefingEntry[],
): Promise<string | null> {
  if (entries.length === 0) return null
  try {
    const model = await getModel(supabase)
    const bullets = entries
      .slice(0, 6)
      .map((e) => `- ${e.text}`)
      .join('\n')
    const { text } = await generateText({
      model,
      system:
        'Je bent Will, een rustige, wijze financiële gids van TriFinity. ' +
        'Kernfilosofie: "Geld is opgeslagen tijd" — elke euro is vrijheidstijd. ' +
        'Schrijf in het Nederlands, warm maar feitelijk, nooit klef.',
      prompt:
        'Vat deze wekelijkse briefing samen in ÉÉN korte, krachtige kop-zin ' +
        '(max ~90 tekens), in de stem van Will, met de vrijheidstijd-framing. ' +
        'Geen aanhalingstekens, geen emoji, geen opsomming — alleen die ene zin.\n\n' +
        `Briefing:\n${bullets}`,
      maxOutputTokens: 60,
      temperature: 0.7,
    })
    return sanitizeAiHeadline(text)
  } catch (err) {
    console.warn('[briefing/refresh] AI-kop mislukt, val terug op deterministisch:', err)
    return null
  }
}

/**
 * POST /api/briefing/refresh
 *
 * Handmatige dagelijkse ververs van de /overzicht-briefing. Mag maximaal
 * 1× per kalenderdag (Amsterdam). Recomposeert de briefjes uit verse data,
 * genereert een AI-kop en zet alles als snapshot vast.
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

    const { entries, freedom } = await loadAndComposeOverviewBriefing(supabase)
    const headline = await generateBriefingHeadline(supabase, entries)

    const { allowed, snapshot } = await applyManualRefresh(supabase, user.id, entries, {
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
