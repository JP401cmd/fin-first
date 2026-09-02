import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadAndComposeOverviewBriefing,
  sanitizeAiHeadline,
  summarizeRunway,
  OVERVIEW_BRIEFING_MAX,
} from '@/lib/briefing/overview-briefing'
import { computeHorizonRunway } from '@/lib/fire-target-shared'
import {
  readBriefingSnapshot,
  canRefreshToday,
  applyManualRefresh,
} from '@/lib/briefing/snapshot'
import {
  loadBriefingDirectives,
  buildEngineMetrics,
  buildDirectivesBlock,
  buildLocalDirectivesBlock,
  redactBriefing,
  applyRedactie,
  sanitizeRedactedText,
} from '@/lib/briefing/redactie'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import { recordAiUsage } from '@/lib/ai-credits'
import { checkTierGate } from '@/lib/require-tier'
import { assertAiEnabled, assertCloudAllowed, isCloudAllowed } from '@/lib/ai/privacy-gate'
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'

/**
 * POST /api/briefing/refresh
 *
 * Handmatige dagelijkse ververs van de /overzicht-briefing. Mag maximaal
 * 1× per kalenderdag (Amsterdam). Recomposeert de briefjes deterministisch
 * uit verse data en laat Fin ze daarna redigeren (kop-zin + teksten),
 * gestuurd door de beheer-directives. Elke AI-fout of afgekeurde tekst
 * (nummer-guard) valt stil terug op de deterministische variant — zie
 * lib/briefing/redactie.ts.
 *
 * TWEE PADEN, ÉÉN ROUTE. Waar de redactie draait is een keuze van de gebruiker
 * (uitvoergroep 'briefing', ADR 0043):
 *
 *  - CLOUD (geen `stap`): ongewijzigd. Composeren, `redactBriefing` (de
 *    model-call) en opslaan gebeuren in één request.
 *  - LOKAAL (`?stap=compose` → `?stap=persist`): het model draait in de
 *    browser op WebGPU/Gemma, dus de route mag géén model aanroepen. De
 *    compose-stap levert de deterministische briefjes + het gecondenseerde
 *    directives-blok; de browser herschrijft; de persist-stap neemt de teksten
 *    aan en slaat op.
 *
 * De persist-stap VERTROUWT DE CLIENT-TEKST NIET: hij recomposeert de briefjes
 * zelf en draait `sanitizeRedactedText`/`sanitizeAiHeadline` opnieuw tegen díe
 * bron. Zonder dat zou een POST met willekeurige tekst de nummer-guard — de
 * enige harde eis van deze functie — omzeilen.
 *
 * Response (cloud + persist):
 *  - { allowed: true, entries, refreshedAt, headline, herschreven, totaal }
 *  - { allowed: false, refreshedAt }   — vandaag al ververst (no-op)
 * Response (compose):
 *  - { allowed: true, entries, directivesBlock } | { allowed: false, refreshedAt }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const stapParam = new URL(req.url).searchParams.get('stap')
  if (stapParam !== null && stapParam !== 'compose' && stapParam !== 'persist') {
    return badRequest("Onbekende stap; gebruik 'compose' of 'persist'.")
  }

  // PRIVÉ-MODUS EERST, vóór de tier-gate en vóór élke dataophaling — in BEIDE
  // richtingen, want de twee paden sluiten elkaar uit:
  //
  //  - de lokale stappen bestaan uitsluitend voor een gebruiker die 'briefing'
  //    op lokaal heeft staan. Draait die groep in de cloud, dan hoort de gewone
  //    ververs gebruikt te worden; de omgekeerde poort voorkomt dat deze
  //    stappen een tweede, minder bewaakte schrijfweg naar de snapshot worden.
  //  - het cloudpad blijft geblokkeerd zodra de groep lokaal draait. De
  //    model-call zit daar niet in de route maar in redactBriefing
  //    (lib/briefing/redactie.ts); de gate hoort dus vóór die aanroep — en
  //    daarmee ook vóór loadAndComposeOverviewBriefing, dat de volledige
  //    financiële situatie ophaalt om te redigeren. Nooit een stille uitwijk.
  //
  // KILL-SWITCH VÓÓR BEIDE (M26). "AI uit" (`profiles.ai_enabled`) betekent dat
  // er niets gegenereerd wordt — cloud noch on-device. `assertCloudAllowed` doet
  // dat sinds M26 zelf, maar de lokale stappen komen daar niet langs: die lezen
  // `isCloudAllowed`, en dié geeft bij een uitgezette kill-switch `false` — wat
  // zonder deze regel als "lokaal mag dus" zou lezen. Vandaar de expliciete,
  // groepsloze poort hier.
  const aiGate = await assertAiEnabled(supabase, user.id)
  if (aiGate) return aiGate

  if (stapParam !== null) {
    if (await isCloudAllowed(supabase, user.id, 'briefing')) {
      return forbidden('Je briefing draait in de cloud — gebruik de gewone ververs.')
    }
  } else {
    const privacyGate = await assertCloudAllowed(supabase, user.id, 'briefing')
    if (privacyGate) return privacyGate
  }

  // AI-abonnementspoort: de ververs herschrijft de briefjes in Fin's stem — een
  // betaalde AI-functie, ook wanneer het model op het eigen toestel draait.
  // Afdwingen vóór het dure werk zodat een gebruiker zonder 'ai' de loaders
  // (~21+ queries) niet 1×/dag kan afvuren. De deterministische briefing op
  // /overzicht blijft gratis en ongemoeid.
  const gate = await checkTierGate(supabase, user.id, 'ai')
  if (gate) {
    return forbidden(gate.error)
  }

  if (stapParam !== null) {
    try {
      return stapParam === 'compose'
        ? await composeVoorLokaal(supabase, user.id)
        : await persistLokaleRedactie(supabase, user.id, req)
    } catch (err) {
      return serverError(err, `briefing:POST:${stapParam}`, 'Kon briefing niet verversen')
    }
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
    // Het bevroren vrijheidsmeetpunt is sinds ADR 0126 PR C de RUNWAY, niet meer
    // de platte deling. Hij wordt HIER opgehaald en niet in
    // `loadAndComposeOverviewBriefing`: die module wordt ook door de UAT-/
    // regressielaag geïmporteerd en hoort de kernel-motor niet in zijn
    // importgraaf te trekken (alleen het `RunwayResult`-type). De ververs is
    // persoonlijk, dus de standaard 'personal'-blik — gelijk aan /overzicht in
    // eigen weergave, dat hetzelfde meetpunt bevriest.
    const [{ entries, input }, runway] = await Promise.all([
      loadAndComposeOverviewBriefing(supabase, now),
      computeHorizonRunway(supabase),
    ])
    const freedom = summarizeRunway(runway)

    // AI-redactie: directives uit beheer + metrics uit de engine-input sturen
    // de herschrijving. Faalt dit (AI uit, fout, guard) → deterministisch.
    const directives = await loadBriefingDirectives(supabase)
    const directivesBlock = buildDirectivesBlock(directives, now, buildEngineMetrics(input))
    const { headline, texts } = await redactBriefing(supabase, entries, { directivesBlock })

    // CREDITREGISTRATIE — alleen hier, op het CLOUDpad. 'briefing' is al sinds
    // de invoering een AiFeatureKey met kosten 2 (lib/ai-credits.ts) maar werd
    // nergens geregistreerd: de duurste terugkerende AI-functie na rapporten was
    // daarmee onzichtbaar in het verbruik én telde niet mee voor de credit-gates
    // van de ándere routes, die uit dezelfde maandbucket lezen.
    //
    // Voorwaarde: de redactie moet écht iets hebben opgeleverd. `redactBriefing`
    // degradeert stil naar de deterministische teksten bij een AI-fout of een
    // door de nummer-guard afgekeurde output, en geeft dan exact hetzelfde lege
    // resultaat terug. We rekenen dus niet af voor een ververs waarin Fin niets
    // heeft herschreven — dat is dezelfde eerlijke maatstaf als de `herschreven`
    // -teller die de route hieronder teruggeeft. De 1×-per-dag-poort begrenst de
    // kosten van een mislukte poging al.
    //
    // Het lokale pad (compose/persist) krijgt bewust GEEN registratie: daar
    // draait het model op het toestel van de gebruiker en zijn er geen kosten.
    if (headline !== null || texts.size > 0) {
      await recordAiUsage(supabase, user.id, 'briefing')
    }

    const redactedEntries = applyRedactie(entries, texts)

    const { allowed, snapshot } = await applyManualRefresh(supabase, user.id, redactedEntries, {
      freedom: freedom ? { ...freedom, capturedAt: new Date().toISOString() } : undefined,
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
      // Eerlijke telling: hoeveel briefjes zijn er écht herschreven? De rest
      // staat er nog deterministisch — dat is geen fout, maar wel iets wat de
      // gebruiker mag weten in plaats van "er lijkt niets gebeurd".
      herschreven: texts.size,
      totaal: entries.length,
    })
  } catch (err) {
    return serverError(err, 'briefing:POST', 'Kon briefing niet verversen')
  }
}

// ── Lokaal pad: stap 1 — componeren (geen model) ─────────────────────────────

/**
 * Levert de deterministisch gecomposeerde briefjes + het gecondenseerde
 * directives-blok, zodat de browser ze on-device kan herschrijven. Roept
 * bewust GEEN `getModel` aan: op dit pad hoort er niets naar een AI-leverancier
 * te gaan.
 *
 * De 1×-per-dag-poort wordt hier alleen GELEZEN, niet verbruikt — pas de
 * persist-stap zet de dagteller. Herhaald composeren zonder persisteren kost
 * dus de loaders opnieuw; dat is begrensd door de tier-gate en raakt uitsluitend
 * de eigen gegevens van de aanvrager.
 */
async function composeVoorLokaal(
  supabase: SupabaseClient,
  userId: string,
): Promise<NextResponse> {
  const existing = await readBriefingSnapshot(supabase, userId)
  if (!canRefreshToday(existing)) {
    return NextResponse.json({
      allowed: false,
      refreshedAt: existing?.refreshedAt ?? null,
    })
  }

  const now = new Date()
  const { entries, input } = await loadAndComposeOverviewBriefing(supabase, now)
  const directives = await loadBriefingDirectives(supabase)
  // ALLEEN-ACTIEVE richtlijnen: de [INACTIEF]-regels zijn voor een 2B-model
  // ruis én kosten ~350 tokens van een venster van 8192.
  const directivesBlock = buildLocalDirectivesBlock(directives, now, buildEngineMetrics(input))

  return NextResponse.json({ allowed: true, entries, directivesBlock })
}

// ── Lokaal pad: stap 2 — opslaan (client-tekst is NIET gezaghebbend) ─────────

const persistSchema = z.object({
  /** Kopzin uit het lokale model; null/afwezig → deterministische kop. */
  headline: z.string().max(1000).nullish(),
  /** Herschreven briefjes, per id. Ontbrekende id's houden hun originele tekst. */
  texts: z
    .array(
      z.object({
        id: z.string().min(1).max(200),
        text: z.string().max(2000),
      }),
    )
    .max(OVERVIEW_BRIEFING_MAX)
    .default([]),
})

/**
 * Neemt de on-device geredigeerde teksten aan en slaat de ververste briefing op.
 *
 * HARDE EIS — HER-SANITATIE SERVER-SIDE. De briefjes worden hier OPNIEUW
 * deterministisch gecomposeerd en elke aangeleverde tekst gaat langs dezelfde
 * `sanitizeRedactedText` als het cloudpad, tegen díe verse bron. De client
 * levert dus hooguit een ANDERE FORMULERING van een tekst die de server zelf al
 * had; verzonnen bedragen, weggelaten getallen of vreemde teksten worden
 * afgekeurd en vervangen door het deterministische origineel. Zonder deze stap
 * zou "de browser doet de redactie" neerkomen op "de browser mag de cijfers in
 * de briefing bepalen".
 *
 * De teller (`herschreven`/`totaal`) komt uit DEZE her-sanitatie, niet uit wat
 * de client claimt — de UI toont dus wat er werkelijk is overgenomen.
 */
async function persistLokaleRedactie(
  supabase: SupabaseClient,
  userId: string,
  req: Request,
): Promise<NextResponse> {
  const parsed = await parseBody(persistSchema, req)
  if (!parsed.ok) return parsed.response

  const now = new Date()
  // Zie het cloudpad hierboven: het meetpunt is de runway, hier opgehaald.
  const [{ entries }, runway] = await Promise.all([
    loadAndComposeOverviewBriefing(supabase, now),
    computeHorizonRunway(supabase),
  ])
  const freedom = summarizeRunway(runway)

  const bronById = new Map(entries.map((e) => [e.id, e]))
  const goedgekeurd = new Map<string, string>()
  for (const item of parsed.data.texts) {
    const bron = bronById.get(item.id)
    // Onbekend id (of een briefje dat sinds de compose-stap is verdwenen omdat
    // de data wijzigde) → negeren; het deterministische briefje blijft staan.
    if (!bron) continue
    // maskPIIInOutput als defence-in-depth vóór de guard: mocht er langs deze
    // weg toch een IBAN/BSN binnenkomen, dan wordt die gemaskeerd — en verandert
    // daarmee de cijfers, waarna de guard de tekst alsnog afkeurt.
    const approved = sanitizeRedactedText(maskPIIInOutput(item.text), bron.text)
    if (approved) goedgekeurd.set(item.id, approved)
  }

  const redactedEntries = applyRedactie(entries, goedgekeurd)
  const headline = sanitizeAiHeadline(
    parsed.data.headline ? maskPIIInOutput(parsed.data.headline) : null,
  )

  const { allowed, snapshot } = await applyManualRefresh(supabase, userId, redactedEntries, {
    freedom: freedom ? { ...freedom, capturedAt: new Date().toISOString() } : undefined,
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
    herschreven: goedgekeurd.size,
    totaal: entries.length,
  })
}
