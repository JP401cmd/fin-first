/**
 * Rekenhulp — pre-publish screening van naam/beschrijving.
 *
 * Voor een rekenhulp publiek wordt gemaakt, vragen we Claude (of de
 * geconfigureerde LLM) om twee checks te draaien:
 *   (a) levert de tekst CONCREET financieel advies op (niet ok) of is
 *       het een educatieve berekening (wel ok)?
 *   (b) bevat de tekst persoonlijke bedragen / leveranciers-namen die
 *       niet thuishoren in een publieke template?
 *
 * Faalt CLOSED: bij AI-error retourneren we `ok: false` met een nette
 * melding. Een rekenhulp kan persoonlijke bedragen/leveranciers bevatten;
 * die mogen niet publiek worden zonder dat de screener draaide. Een
 * LLM-outage blokkeert dus tijdelijk het publiceren (bewuste tradeoff —
 * de gebruiker kan het later opnieuw proberen of om handmatige review vragen).
 */

import { generateObject } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getModel } from '@/lib/ai/config'

export interface ScreenPublishInput {
  name: string
  description?: string | null
  assumptions?: string[]
}

/**
 * Waaróm een `ok: false` viel — de route vertaalt dit naar een eerlijke
 * gebruikersboodschap:
 *  - `content`: de tekst zelf is afgekeurd (het LLM-oordeel);
 *  - `unavailable`: de screening kon niet draaien (fail-closed). Over de
 *    inhoud is dan níets gezegd — "niet geschikt om publiek te delen" zou een
 *    onterecht verwijt zijn (UAT WF-REKEN-04-bug2). Zonder discriminator kon
 *    de route de twee alleen op de issue-tekst uit elkaar houden.
 */
export type ScreenPublishRejectReason = 'content' | 'unavailable'

export type ScreenPublishResult =
  | { ok: true }
  | { ok: false; reason: ScreenPublishRejectReason; issue: string; suggestion?: string }

/** Fail-closed-melding wanneer de screening zelf niet kon draaien. */
export const SCREEN_UNAVAILABLE_ISSUE =
  'De publicatie-controle kon niet automatisch worden uitgevoerd. Probeer het later opnieuw.'

const ScreenResultSchema = z.object({
  ok: z
    .boolean()
    .describe(
      'true = de tekst is geschikt voor publicatie; false = er is een probleem',
    ),
  issue: z
    .string()
    .optional()
    .describe(
      'Korte Nederlandstalige uitleg waarom de tekst niet geschikt is (alleen vereist bij ok=false)',
    ),
  suggestion: z
    .string()
    .optional()
    .describe(
      'Optioneel: een Nederlandse herformulering die het probleem oplost',
    ),
})

function buildSystemPrompt(): string {
  return `Je bent een redacteur voor een Nederlandse fintech-app (TriFinity).
Een gebruiker wil een door hem/haar gemaakte rekenhulp publiek delen.
Beoordeel of de naam + beschrijving + aannames geschikt zijn voor een
publieke template.

CHECK A — Educatief vs. advies:
- "OK" als de tekst beschrijft WAT er wordt berekend (educatieve
  rekenhulp): bv. "Vergelijk extra aflossen met beleggen".
- "NIET OK" als de tekst persoonlijk financieel advies geeft: bv. "Los
  je hypotheek af om 50.000 euro te besparen", "Beleg bij ING want dat
  is veiliger".

CHECK B — Persoonlijke data / leveranciers:
- "NIET OK" als concrete persoonlijke bedragen worden genoemd (€321.500,
  "mijn hypotheek van €280.000").
- "NIET OK" als specifieke leveranciers/banken/fondsen worden genoemd
  zonder educatieve reden (bv. "Bereken je rendement bij DEGIRO" — wel
  OK: "rendement bij een online broker").
- "OK" als bedragen alleen als algemene voorbeelden worden gebruikt.

Antwoord met:
- ok=true (geen issue, je laat issue/suggestion leeg)
- of ok=false met een korte uitleg in issue en, indien mogelijk, een
  herformulering in suggestion.`
}

/**
 * Roep de LLM aan om de publicatie-metadata te beoordelen. Gooit nooit;
 * faalt CLOSED naar `{ ok: false }` zodat een AI-uitval geen ongescreende
 * rekenhulp publiek laat worden.
 */
export async function screenPublishMetadata(
  supabase: SupabaseClient,
  input: ScreenPublishInput,
): Promise<ScreenPublishResult> {
  const name = (input.name ?? '').trim()
  if (!name) {
    // Geen LLM-call nodig — een lege naam wordt door de UI/route al
    // afgevangen. Hier conservatief teruggeven.
    return { ok: true }
  }

  const blocks: string[] = []
  blocks.push(`Naam: ${name}`)
  if (input.description?.trim()) {
    blocks.push(`Beschrijving: ${input.description.trim()}`)
  }
  if (input.assumptions && input.assumptions.length > 0) {
    blocks.push(`Aannames:\n- ${input.assumptions.join('\n- ')}`)
  }
  const userPrompt = blocks.join('\n\n')

  try {
    const model = await getModel(supabase, 'scherm_publicatie')
    const { object } = await generateObject({
      model,
      schema: ScreenResultSchema,
      system: buildSystemPrompt(),
      prompt: userPrompt,
      maxOutputTokens: 300,
    })

    if (object.ok) {
      return { ok: true }
    }
    return {
      ok: false,
      reason: 'content',
      issue: object.issue ?? 'Onbekend probleem in naam/beschrijving.',
      suggestion: object.suggestion,
    }
  } catch (err) {
    // Fail-CLOSED: een rekenhulp met mogelijk persoonlijke bedragen/leveranciers
    // mag niet publiek worden zonder screening. Loggen voor diagnostiek.
    console.error('[screen-publish-metadata] LLM-call mislukt — fail-closed:', err)
    return {
      ok: false,
      reason: 'unavailable',
      issue: SCREEN_UNAVAILABLE_ISSUE,
    }
  }
}
