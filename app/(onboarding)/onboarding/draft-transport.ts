/**
 * Transport van het onboarding-concept: de browser-kant van
 * `/api/onboarding/draft`.
 *
 * Gescheiden van `draft-persistence.ts` (pure serialisatie/validatie) en van
 * `page.tsx` (de wizard zelf), zodat het lees-/schrijfgedrag los te testen is
 * en de page-component alleen nog de drie werkwoorden kent: lezen, bewaren,
 * wissen.
 *
 * ALLE DRIE ZIJN BEST-EFFORT. Een concept is een vangnet, geen contract: een
 * mislukte schrijf mag de gebruiker nooit uit zijn onboarding gooien. Fouten
 * gaan naar de console, niet naar het scherm — de invoer staat op dat moment
 * nog gewoon in de in-memory state.
 */
import {
  sanitizeStoredDraft,
  type OnboardingDraft,
} from './draft-persistence'

const DRAFT_ENDPOINT = '/api/onboarding/draft'

/**
 * Legacy localStorage-sleutel van het concept van vóór aug 2026. Wordt nog
 * éénmalig gelezen (zodat een gebruiker die middenin de onboarding zat zijn
 * stap-positie niet verliest) en daarna gewist.
 */
export const LEGACY_DRAFT_STORAGE_KEY = 'trifinity_onboarding_draft'

/** Haal het serverconcept op. `null` = niets te hervatten (of ophalen mislukt). */
export async function fetchDraft(): Promise<OnboardingDraft | null> {
  try {
    const res = await fetch(DRAFT_ENDPOINT, { method: 'GET' })
    if (!res.ok) {
      console.warn(`[onboarding] concept ophalen mislukt (status ${res.status})`)
      return null
    }
    const data = (await res.json()) as { draft?: unknown }
    return sanitizeStoredDraft(data?.draft)
  } catch (err) {
    console.warn('[onboarding] concept ophalen mislukt', err)
    return null
  }
}

/** Schrijf het concept weg. Retourneert of het gelukt is (voor tests/logging). */
export async function persistDraft(draft: OnboardingDraft): Promise<boolean> {
  try {
    const res = await fetch(DRAFT_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    })
    if (!res.ok) {
      console.warn(`[onboarding] concept bewaren mislukt (status ${res.status})`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[onboarding] concept bewaren mislukt', err)
    return false
  }
}

/** Wis het concept (afronden, afbreken, al voltooide onboarding). */
export async function clearDraft(): Promise<void> {
  try {
    await fetch(DRAFT_ENDPOINT, { method: 'DELETE' })
  } catch (err) {
    console.warn('[onboarding] concept wissen mislukt', err)
  }
}

/**
 * Eenmalige migratie: lees een achtergebleven localStorage-concept van vóór de
 * serverpersistentie en wis de sleutel. Dat oude concept bevat alléén
 * stap-positie en keuzes-zonder-bedrag — genoeg om iemand die middenin zat op
 * de juiste stap terug te zetten, niet meer dan dat.
 */
export function takeLegacyLocalDraft(): OnboardingDraft | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY)
  } catch {
    return null
  }
  clearLegacyLocalDraft()
  if (!raw) return null
  try {
    return sanitizeStoredDraft(JSON.parse(raw))
  } catch {
    return null
  }
}

/** Verwijder de legacy-sleutel. Ook los aanroepbaar bij afbreken/voltooien. */
export function clearLegacyLocalDraft(): void {
  try {
    localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY)
  } catch {
    // localStorage onbereikbaar (privacy-modus) — niets te doen.
  }
}

/**
 * Schrijfwachtrij voor het concept. Doet twee dingen die los van elkaar
 * misgaan:
 *
 *  · **Volgorde** — het persisteer-effect kan sneller vuren dan een round-trip
 *    duurt; zonder ketening kan een oudere schrijf ná een nieuwere landen en
 *    het concept terugdraaien.
 *  · **Verzegelen** — bij afronden en bij afbreken wissen we het concept. Een
 *    gedebouncede schrijf die op dát moment nog onderweg is, zou het meteen
 *    daarna opnieuw aanmaken — mét de gevoelige antwoorden, ná een uitlog. Wie
 *    `clear()` aanroept sluit de schrijver dus definitief; latere schrijven
 *    zijn no-ops.
 */
export function createDraftWriter() {
  let chain: Promise<unknown> = Promise.resolve()
  let sealed = false
  return {
    /** Zet het concept in de wachtrij. No-op na `clear()`. */
    write(draft: OnboardingDraft) {
      if (sealed) return chain
      chain = chain.then(() => persistDraft(draft)).catch(() => false)
      return chain
    },
    /**
     * Wis het concept en sluit de schrijver. Wacht eerst de lopende keten af,
     * zodat de DELETE gegarandeerd ná de laatste PUT landt.
     */
    async clear() {
      sealed = true
      await chain.catch(() => undefined)
      clearLegacyLocalDraft()
      await clearDraft()
    },
  }
}
