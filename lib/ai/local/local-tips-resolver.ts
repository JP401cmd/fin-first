// ── Lokale (on-device) tips-resolver ─────────────────────────────────────────
//
// Draait de generatie van de aanbevelingen ("Golden Nuggets") op het toestel.
// Eén korte generate-call PER KANDIDAAT, niet één grote call over het hele
// profiel — de reden staat in `local-tips-context.ts`.
//
// WAAROM PER KANDIDAAT (en niet één call met alle kansen):
//  • Venster: system (~617 tok) + één KANS-blok (~150 tok) + uitvoer (~180 tok)
//    ≈ 1.000 tokens per call. Het cloudpad had er 4.500-7.500 nodig en zou tegen
//    de 8.192 aan lopen die dit model IN TOTAAL heeft.
//  • Snelheid ís hier UX: bij ~9-12 tok/s duurt drie tips ~60-75 s. Per kandidaat
//    genereren betekent dat de eerste tip na ~20 s op het scherm staat in plaats
//    van na 75 s. `onTip` vuurt daarom per tip — de UI toont ze één voor één en
//    blokkeert nooit.
//  • Kwaliteit: één taak per call is precies wat een 2B-model wél kan.
//
// FAIL-CLOSED, NOOIT STIL NAAR DE CLOUD. Een kandidaat die niet parsebaar
// antwoordt levert géén kaart (`resolveLocalTip` → null) en wordt overgeslagen;
// een sessie-crash geeft één sessieherstel + retry en daarna wordt die ene
// kandidaat opgegeven. Er is geen enkel pad in dit bestand dat `/api/ai/*`
// aanroept — de privé-belofte staat of valt daarmee.

import {
  buildLocalTipMessages,
  LOCAL_TIP_MAX_NEW_TOKENS,
} from './local-recommendations-prompt'
import { parseFinTipDraft, resolveLocalTip, type ResolvedLocalTip } from './parse-tip'
import type { LocalTipCandidate } from './local-tips-context'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel pas
// lazy in zijn eigen functies, dus dit trekt die bundel NIET eager mee. De
// statische import maakt de generatie-callsite bovendien expliciet zodat de
// sanitize-scan 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from './litert-runtime'

/** Voortgang van de lopende generatie — voedt de statusregel in de UI. */
export interface LocalTipsProgress {
  /** Hoeveelste kandidaat draait nu (1-based). */
  huidige: number
  /** Totaal aantal aangeboden kandidaten. */
  totaal: number
  /** Canonieke titel van de kans die nu verwoord wordt. */
  titel: string
}

export interface GenerateLocalTipsOptions {
  /** Vuurt zodra één tip klaar én opgelost is — de UI toont 'm meteen. */
  onTip?: (tip: ResolvedLocalTip) => void | Promise<void>
  /** Vuurt vóór elke kandidaat. */
  onProgress?: (progress: LocalTipsProgress) => void
  /** Afbreken (component unmount, gebruiker navigeert weg). */
  signal?: AbortSignal
}

/**
 * Genereer tips voor de aangeboden kandidaten, on-device.
 *
 * @returns de opgeloste tips in kandidaat-volgorde. Kandidaten die niets
 *          bruikbaars opleverden ontbreken — dat is de fail-closed uitkomst,
 *          geen fout.
 */
export async function generateLocalTips(
  candidates: LocalTipCandidate[],
  options: GenerateLocalTipsOptions = {},
): Promise<ResolvedLocalTip[]> {
  const { onTip, onProgress, signal } = options
  const tips: ResolvedLocalTip[] = []
  if (candidates.length === 0) return tips

  const runOne = async (candidate: LocalTipCandidate): Promise<string> => {
    const session = await loadModelSession()
    return session.generate(buildLocalTipMessages(candidate), LOCAL_TIP_MAX_NEW_TOKENS)
  }

  for (const [index, candidate] of candidates.entries()) {
    if (signal?.aborted) break
    onProgress?.({ huidige: index + 1, totaal: candidates.length, titel: candidate.titel })

    let raw: string
    try {
      raw = await runOne(candidate)
    } catch (err) {
      // Mogelijke device-loss/poisoned session → dispose + verse sessie, één keer
      // opnieuw. ALTIJD loggen: zonder deze regel is een lokale-AI-fout voor
      // gebruiker én support onzichtbaar (de UI toont alleen een generieke melding).
      console.error('[lokale-ai] tip-generatie faalde — sessieherstel + één retry volgt:', err)
      await disposeSession()
      if (signal?.aborted) break
      try {
        raw = await runOne(candidate)
      } catch (err2) {
        // Deze ene kans geven we op; de volgende kandidaat krijgt gewoon een kans.
        // NOOIT een cloud-terugval — dat zou de privé-belofte breken.
        console.error('[lokale-ai] tip-generatie faalde ook ná sessieherstel — kandidaat overgeslagen:', err2)
        continue
      }
    }

    const tip = resolveLocalTip(parseFinTipDraft(raw), candidate)
    // null = fail-closed: onparsebaar blok of geen beschrijving → geen kaart.
    if (!tip) {
      console.warn('[lokale-ai] tip zonder bruikbaar fin-tip-blok — kandidaat overgeslagen:', candidate.id)
      continue
    }

    // Nog één keer controleren vóór de callback: een ronde die tijdens deze
    // generatie is afgebroken mag geen tip meer toevoegen aan een UI die
    // inmiddels aan een nieuwe ronde begonnen is.
    if (signal?.aborted) break

    tips.push(tip)
    await onTip?.(tip)
  }

  return tips
}
