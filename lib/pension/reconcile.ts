/**
 * Deterministische reconciliatie van inkomende pensioenpotten (uit een UPO-upload)
 * tegen bestaande `life_events` van type 'pension'.
 *
 * Geen IO, geen throws. Pure, input-order-stabiele functies.
 *
 * Matching-strategie (in volgorde, eerste ongebruikte match wint):
 *   PRIMARY  — metadata.mijnpensioenBron === normalizePensionFondsNaam(incoming.fondsNaam)
 *   FALLBACK — normalizePensionFondsNaam(event.name) === key
 * Een bestaand event kan slechts aan één inkomende pot worden gekoppeld.
 */

import type { LifeEvent } from '@/lib/horizon-data'
import type { PensionParseResult } from '@/app/api/pension/parse/route'

// ── Type re-exports ──────────────────────────────────────────────────────────

/** Een enkele pensioenregeling uit een geparsed UPO-overzicht. */
export type Regeling = PensionParseResult['regelingen'][number]

// ── Naam-normalisatie ────────────────────────────────────────────────────────

/**
 * Normaliseert een fondsnaam voor vergelijking:
 *  - Verwijdert het suffixlabel " (deels indicatief)" (case-insensitief).
 *  - Verwijdert ALLEEN losse juridische tokens (NV, N.V., B.V., BV, Mij, Mij.)
 *    als standalone woorden — niet als onderdeel van een langere token (bv. "BVG").
 *  - Collapst meerdere spaties naar één.
 *  - Converteert naar lowercase.
 *  - Lege / whitespace-only input → ''.
 */
export function normalizePensionFondsNaam(name: string): string {
  if (!name || !name.trim()) return ''

  // 1. Verwijder " (deels indicatief)" (case-insensitief, overal in de string).
  let result = name.replace(/\s*\(deels\s+indicatief\)/gi, '')

  // 2. Verwijder losse juridische tokens als standalone woorden.
  //    Patroon: (^|\s)(token)(?=\s|$|,|\.|;)
  //    Tokens: NV, N.V., B.V., BV, Mij, Mij.
  //    We matchen op word-boundary-equivalenten (whitespace of string-start/-end)
  //    om "BVG" of "Mijnpension" niet te treffen.
  const legalTokens = ['N\\.V\\.', 'B\\.V\\.', 'NV', 'BV', 'Mij\\.', 'Mij']
  // Sorteer langste patterns eerst zodat "N.V." voor "NV" getest wordt.
  for (const token of legalTokens) {
    const re = new RegExp(`(?<![\\w.])${token}(?![\\w.])`, 'gi')
    result = result.replace(re, '')
  }

  // 3. Collapse whitespace en trim.
  result = result.replace(/\s+/g, ' ').trim()

  // 4. Lowercase (case-fold voor vergelijking).
  return result.toLowerCase()
}

// ── Reconciliatie-types ──────────────────────────────────────────────────────

export type PensionReconcileAction = 'update' | 'add' | 'skip'

export interface PensionReconcileEntry {
  regeling: Regeling
  /** Het bestaande life_event waarmee gematched is, of null bij 'add'. */
  match: LifeEvent | null
  /** Aanbevolen actie op basis van de match. Caller mag dit overschrijven naar 'skip'. */
  defaultAction: 'update' | 'add'
}

// ── Reconciliatie-logica ─────────────────────────────────────────────────────

/**
 * Vergelijkt inkomende ouderdomspensioen-regelingen met bestaande pension-events
 * en retourneert voor elke pot een entry met de aanbevolen actie.
 *
 * - Alleen regelingen met `type === 'ouderdomspensioen'` worden opgenomen
 *   (spiegelt het filter in applyPensionParseResult / applyPensionPots).
 * - Matching: zie module-toelichting bovenaan.
 * - Geen throws; ontbrekende/lege naam → normalizePensionFondsNaam geeft ''.
 */
export function reconcilePensionPots(
  regelingen: Regeling[],
  existingPensionEvents: LifeEvent[],
): PensionReconcileEntry[] {
  // Filter: alleen ouderdomspensioen (mirrors apply-filter).
  const ouderdomsregelingen = regelingen.filter((r) => r.type === 'ouderdomspensioen')

  // Alle bestaande pension-events (andere event_types negeren).
  const pensionEvents = existingPensionEvents.filter((e) => e.event_type === 'pension')

  // Bijhouden welke event-ids al gematched zijn (1:1 constraint).
  const consumedEventIds = new Set<string>()

  return ouderdomsregelingen.map((regeling) => {
    const key = normalizePensionFondsNaam(regeling.fondsNaam ?? '')

    let matchedEvent: LifeEvent | null = null

    if (key !== '') {
      // PRIMARY: metadata.mijnpensioenBron === key
      matchedEvent =
        pensionEvents.find(
          (e) =>
            !consumedEventIds.has(e.id) &&
            typeof e.metadata?.mijnpensioenBron === 'string' &&
            (e.metadata.mijnpensioenBron as string) === key,
        ) ?? null

      // FALLBACK: normalizePensionFondsNaam(event.name) === key
      if (!matchedEvent) {
        matchedEvent =
          pensionEvents.find(
            (e) =>
              !consumedEventIds.has(e.id) &&
              normalizePensionFondsNaam(e.name) === key,
          ) ?? null
      }
    }

    if (matchedEvent) {
      consumedEventIds.add(matchedEvent.id)
      return { regeling, match: matchedEvent, defaultAction: 'update' }
    }

    return { regeling, match: null, defaultAction: 'add' }
  })
}
