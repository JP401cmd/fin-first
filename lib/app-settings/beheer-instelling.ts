/**
 * BEHEER-CONTENT UIT `app_settings` LEZEN — server-side, via de service-role.
 *
 * ## Waarom dit bestaat
 *
 * `app_settings` draagt naast publieke configuratie ook beheer-content die de
 * app namens de beheerder gebruikt maar die een gebruiker nooit hoort te zien:
 * de productie-prompt-override, de extractie-prompts, de briefing-directives,
 * de waardestromen-indeling. Tot ADR 0163 lazen zes lezers die sleutels via de
 * SESSIE-client, en dat werkte alleen omdat de SELECT-policy fail-open was
 * (denylist). Met de allowlist is de sessie-client voor die sleutels dicht —
 * en dat hoort zo: de vraag is niet "is dit geheim?" maar "moet een gebruiker
 * dit kunnen lezen?".
 *
 * De service-role (BYPASSRLS) is hier dus geen omweg maar de bedoelde route,
 * binnen de grens van `lib/supabase/service.ts`: alleen server-side, alleen met
 * een VASTE sleutel uit de code (nooit gebruikersinput in de sleutel), en
 * alleen lezen. Schrijven blijft aan de beheer-routes (superadmin-gate).
 *
 * ## Contract
 *
 * Fouten leveren `null`/lege map, geen throw: elke lezer heeft een in-code
 * default en een onbereikbare instelling mag een gebruikerspad niet breken —
 * dezelfde keuze als die lezers al maakten met hun `?? DEFAULT`.
 */

import { getServiceClient } from '@/lib/supabase/service'

/**
 * De GESLOTEN lijst sleutels die deze helper mag lezen. Dit is een BYPASSRLS-
 * lezer; met een vrije `string` zou een toekomstige aanroeper
 * `checkin_snapshot_<andermans uuid>` of `household_privacy:<partner>` kunnen
 * opvragen, dwars door de allowlist én door ADR 0146. Het type sluit dat op
 * compile-tijd uit, de runtime-guard in `leesBeheerInstellingen` ook bij een
 * cast. Een nieuwe beheer-sleutel = één regel hier, bewust en review-baar.
 */
export const BEHEER_SLEUTELS = [
  /** Volledige vervanging van het Fin-prompt (`lib/ai/dna/index.ts`). */
  'ai_system_prompt_override',
  /** Prompt-override documentextractie (`lib/ai/extract-financial-data.ts`). */
  'extraction_system_prompt',
  /** Prompt-override aangifte-extractie (`lib/aangifte/extract-aangifte-data.ts`). */
  'aangifte_extraction_prompt',
  /** Redactionele richtlijnen voor de briefing (`lib/briefing/redactie.ts`). */
  'briefing_directives',
  'briefing_functional_directives',
  /** Waardestromen-indeling voor vragenlijst-verspreiding (`lib/questionnaires/gebruiker-context.ts`). */
  'waardestromen',
] as const

export type BeheerSleutel = (typeof BEHEER_SLEUTELS)[number]

const BEHEER_SLEUTEL_SET: ReadonlySet<string> = new Set(BEHEER_SLEUTELS)

export function isBeheerSleutel(key: string): key is BeheerSleutel {
  return BEHEER_SLEUTEL_SET.has(key)
}

/** Eén beheer-instelling als string, of `null` als de rij ontbreekt/leeg is/niet leesbaar. */
export async function leesBeheerInstelling(key: BeheerSleutel): Promise<string | null> {
  const map = await leesBeheerInstellingen([key])
  return map[key] ?? null
}

/** Meerdere beheer-instellingen in één leesronde; ontbrekende sleutels staan er niet in. */
export async function leesBeheerInstellingen(keys: readonly BeheerSleutel[]): Promise<Record<string, string>> {
  // Runtime-guard náást het type: een sleutel buiten de lijst wordt nooit
  // opgevraagd, ook niet via een cast — de service-role leest hier alleen wat
  // de code zelf benoemt.
  const toegestaan = keys.filter((k) => isBeheerSleutel(k))
  if (toegestaan.length === 0) return {}
  try {
    const { data, error } = await getServiceClient()
      .from('app_settings')
      .select('key, value')
      .in('key', toegestaan)
    if (error || !data) return {}
    const map: Record<string, string> = {}
    for (const row of data as { key: string; value: unknown }[]) {
      if (typeof row.value === 'string' && row.value.trim().length > 0) map[row.key] = row.value
    }
    return map
  } catch {
    return {}
  }
}
