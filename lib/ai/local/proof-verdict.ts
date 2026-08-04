// ── Bewaard oordeel van de uitvoer-toets, PER TOESTEL ────────────────────────
//
// De uitkomst van `runLocalOutputProof` is een eigenschap van dít apparaat in
// deze browser — dezelfde gebruiker kan op zijn laptop slagen en op zijn
// telefoon zakken. Daarom localStorage en NIET het profiel: een server-voorkeur
// zou het oordeel van het ene toestel aan het andere opdringen, en juist de
// vraag "mag dit apparaat lokaal draaien" moet per apparaat beantwoord worden.
// (Conform de datapad-conventie in CLAUDE.md: localStorage is er voor
// per-apparaat-feiten; cross-device-keuzes horen op `profiles`.)
//
// Het oordeel hangt aan het MODEL en de TOETSVERSIE. Verandert er één van beide,
// dan is een oud oordeel geen uitspraak meer over wat er nu draait en telt het
// als "niet beproefd" — dan wordt er gewoon opnieuw getoetst. Dat is precies wat
// er moet gebeuren als iemand van E2B naar E4B overstapt: een ander model kan
// zich op dezelfde chip heel anders gedragen.

import { getSelectedLocalModel } from './selected-model'
import { LOCAL_PROOF_VERSION } from './output-proof'

const STORAGE_KEY = 'trifinity.lokale-ai.uitvoertoets'

export type ProofVerdict = {
  ok: boolean
  /** De redenen uit de proef — leeg bij ok. */
  reasons: string[]
  /** ISO-tijdstip van de proef, zodat de UI kan zeggen wanneer het was. */
  at: string
  version: number
  model: string
}

/**
 * Het bewaarde oordeel voor het HUIDIGE model en de huidige toetsversie, of
 * null. Null betekent nadrukkelijk "nog niet beproefd" — niet "gezakt".
 */
export function readProofVerdict(): ProofVerdict | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ProofVerdict>
    if (typeof parsed?.ok !== 'boolean') return null
    // Ander model of andere toetsversie → geen geldige uitspraak meer.
    if (parsed.version !== LOCAL_PROOF_VERSION) return null
    if (parsed.model !== getSelectedLocalModel().url) return null
    return {
      ok: parsed.ok,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.filter((r) => typeof r === 'string') : [],
      at: typeof parsed.at === 'string' ? parsed.at : '',
      version: LOCAL_PROOF_VERSION,
      model: getSelectedLocalModel().url,
    }
  } catch {
    /* onleesbaar → behandelen als niet beproefd */
    return null
  }
}

/** Leg het oordeel vast. Faalt de opslag (privémodus, vol), dan blijft het bij niets. */
export function writeProofVerdict(outcome: { ok: boolean; reasons: string[] }, at: string): void {
  if (typeof localStorage === 'undefined') return
  const verdict: ProofVerdict = {
    ok: outcome.ok,
    reasons: outcome.reasons,
    at,
    version: LOCAL_PROOF_VERSION,
    model: getSelectedLocalModel().url,
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(verdict))
  } catch {
    /* best-effort: zonder bewaard oordeel wordt er hooguit opnieuw getoetst */
  }
}

/** Wis het oordeel — hoort bij het verwijderen of opnieuw ophalen van het model. */
export function clearProofVerdict(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* best-effort */
  }
}
