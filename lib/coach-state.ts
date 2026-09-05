/**
 * coach-state — de server-side staat van Fins proactieve meldingen.
 *
 * WAAROM SERVER-SIDE. Tot ADR 0130 leefde "welke tip heb ik weggeklikt" in
 * localStorage (`trifinity_coach_dismissed_suggestions` en twee broertjes).
 * Dat is per apparaat: wie op zijn telefoon een tip wegklikt, kreeg 'm op de
 * laptop opnieuw. Voor een melding die zegt "dit heb je gezien" is dat de
 * verkeerde bewaarplaats — vandaar de verhuizing naar de eigen profielrij.
 *
 * OPSLAG — bewust GEEN nieuwe kolom. De bestaande jsonb-map
 * `profiles.module_guide_state` draagt al meerdere losse gidsstaten onder eigen
 * top-level sleutels (`welcome:guide`, `coachmark:*`). De coach-staat komt daar
 * als `coach:state` bij. Dat scheelt een migratie én extra RLS-oppervlak: de
 * kolom valt al onder de own-row-policies van `profiles`. Schrijven gaat via
 * `PUT /api/coach-state` (read-modify-write, anon-RLS-client, nooit
 * service-role); lezen gebeurt gratis mee in de al geladen profielrij van
 * `app/(app)/layout.tsx`.
 *
 * Dit bestand is PUUR: geen React, geen fetch, geen Supabase. Zowel de route
 * (server) als de hook (client) leunen erop.
 */

/** Top-level sleutel in `profiles.module_guide_state`. */
export const COACH_STATE_KEY = 'coach:state'

/**
 * Voorvoegsel van de meldingsleutels die bij de welkomstgids horen.
 *
 * Staat hier en niet in `lib/coach-suggestions.ts` omdat zowel de gids-laag
 * (fase 2) als de dismiss-vertakking in de hook 'm nodig heeft, en dit bestand
 * de enige is die beide kanten mag importeren zonder afhankelijkheidsknoop.
 */
export const GUIDE_SUGGESTION_KEY_PREFIX = 'guide_'

/**
 * Hoeveel weggeklikte sleutels we maximaal bewaren. De lijst groeit alleen bij
 * échte dismisses en de app kent er enkele tientallen; de cap is een vangrail
 * tegen een jsonb-kolom die stilletjes blijft groeien (bv. door de
 * `guide_<stap-id>`-sleutels van fase 2). Bij overschrijding vallen de OUDSTE
 * eruit — die horen bij tips die de gebruiker allang niet meer ziet.
 */
export const COACH_DISMISSED_CAP = 200

export interface CoachState {
  /** Weggeklikte meldingsleutels, oudste eerst. */
  dismissed: string[]
  /** ISO-tijdstip van de laatste weggeklikte melding; `null` = nooit. */
  lastDismissedAt: string | null
  /** ISO-tijdstip waarop de gids-bubbel voor het laatst is getoond (dagregel). */
  guideLastShownAt: string | null
}

/** Lege staat — óók de uitkomst van een ontbrekende of corrupte sleutel. */
export const EMPTY_COACH_STATE: CoachState = {
  dismissed: [],
  lastDismissedAt: null,
  guideLastShownAt: null,
}

/** `true` als `value` een bruikbaar ISO-tijdstip is. */
function asIsoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : value
}

/**
 * Leest de coach-staat uit een ruwe jsonb-waarde.
 *
 * Defensief: alles wat niet klopt (geen object, verkeerde types, corrupte
 * datums, dubbele sleutels) degradeert stil naar de lege staat of naar het deel
 * dat wél klopt. Een kapotte jsonb mag nooit de melding-laag laten crashen —
 * hooguit één keer een tip te veel tonen.
 */
export function parseCoachState(raw: unknown): CoachState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY_COACH_STATE
  const shaped = raw as Record<string, unknown>

  const dismissedRaw = Array.isArray(shaped.dismissed) ? shaped.dismissed : []
  const dismissed = capDismissed(
    dedupe(dismissedRaw.filter((k): k is string => typeof k === 'string' && k !== '')),
  )

  return {
    dismissed,
    lastDismissedAt: asIsoOrNull(shaped.lastDismissedAt),
    guideLastShownAt: asIsoOrNull(shaped.guideLastShownAt),
  }
}

function dedupe(keys: readonly string[]): string[] {
  return [...new Set(keys)]
}

function capDismissed(keys: string[]): string[] {
  return keys.length > COACH_DISMISSED_CAP ? keys.slice(keys.length - COACH_DISMISSED_CAP) : keys
}

/**
 * Voegt sleutels toe aan een dismissed-lijst: ontdubbeld, volgorde bewaard
 * (oudste eerst) en afgekapt op `COACH_DISMISSED_CAP`. Gedeeld door de
 * `dismiss`- en `importLegacy`-takken van de route.
 */
export function appendDismissed(current: readonly string[], keys: readonly string[]): string[] {
  const clean = keys.filter((k): k is string => typeof k === 'string' && k !== '')
  if (clean.length === 0) return capDismissed(dedupe(current))
  return capDismissed(dedupe([...current, ...clean]))
}

/**
 * `true` als `iso` op dezelfde LOKALE kalenderdag valt als `now`.
 *
 * Lokaal, niet UTC: de dagregel ("Fin noemt hooguit één gidsstap per dag")
 * hoort te draaien om de dag die de gebruiker beleeft. In Nederland scheelt dat
 * één tot twee uur rond middernacht — precies het venster waarin iemand nog
 * even in de app zit. `null` of een corrupte datum → `false`, zodat een
 * onleesbare stempel de melding niet permanent blokkeert.
 */
export function isSameLocalDay(iso: string | null, now: Date): boolean {
  if (!iso) return false
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return false
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  )
}
