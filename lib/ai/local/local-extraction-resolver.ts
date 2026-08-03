// ── Lokale (on-device) vrije-tekst-extractie ─────────────────────────────────
//
// De structurele tweeling van lib/ai/local/local-categorize-resolver.ts en
// local-vaste-kosten-resolver.ts, en bewust in dezelfde vorm gegoten: één
// runner per beurt, sessieherstel (dispose + één retry, dan werpen) en een
// sessiestart-signaal voor de stille GPU-warmup.
//
// Waar de categorisatie CHUNKT over veel items, SPLITST deze extractie over
// DEELVRAGEN: bezittingen+schulden / levensgebeurtenissen / inkomen+uitgaven+
// context. Dezelfde reden — de uitvoer per beurt onder ~300 tokens houden —
// maar een andere as, want de invoer (≤500 tekens vrije tekst) is hier klein en
// de uitvoer het risico.
//
// FAIL-CLOSED, MAAR NIET FAIL-LEEG PER BEURT. Faalt één beurt ook ná
// sessieherstel, dan werpt hij; de aanroeper toont een eerlijke melding en de
// gebruiker vult de formulieren handmatig. Er is GEEN cloud-fallback: dat zou de
// privacybelofte breken die de gebruiker juist heeft gekozen (FR-3.6).
//
// GEEN `sanitizeForAI`: er is geen egress. De cloud-guardrails uit ADR 0035
// (sanitize in, maskPIIInOutput uit, token-logging) zijn hier N.V.T. — geen
// externe provider, geen netwerkverkeer, geen kosten. Saniteren zou hier
// bovendien legitiem signaal wegstrepen: de tekst gáát over de eigen situatie.
//
// EERLIJKE GRENS. Wat dit pad garandeert is: geen AI-leverancier ziet je tekst.
// Het is NIET "je tekst blijft op je toestel" — de vrije tekst zelf wordt in de
// onboarding nog steeds als `profiles.news_description` opgeslagen. Die nuance
// hoort in de UI-tekst te staan; zie de opmerking in
// app/api/onboarding/save-own-data/route.ts.

import type { ExtractionResult } from '@/lib/ai/extraction-schema'
import { EMPTY_EXTRACTION_RESULT } from '@/lib/ai/extraction-schema'
import {
  buildAssetsDebtsPrompt,
  buildIncomeExpensesPrompt,
  buildLifeEventsPrompt,
  LOCAL_EXTRACTION_DNA,
  type LocalExtractionContext,
} from './local-extraction-prompt'
import {
  parseLocalAssetsDebts,
  parseLocalIncomeExpenses,
  parseLocalLifeEvents,
} from './local-extraction-parse'
// Statische import: litert-runtime laadt de zware @litert-lm/core-WASM-bundel pas
// lazy in zijn eigen functies (dynamic import), dus dit trekt die bundel NIET
// eager mee. De statische import maakt de generatie-callsite bovendien expliciet
// zodat de sanitize-scan ('m op de allowlist) 'm herkent (ADR 0035/0043).
import { loadModelSession, disposeSession } from './litert-runtime'

/**
 * Minimale invoerlengte. Onder de tien tekens valt er niets te extraheren en is
 * een GPU-warmup van ~45-60 seconden pure verspilling. Gelijk aan de drempel in
 * het cloud-pad (lib/ai/extract-financial-data.ts).
 */
export const LOCAL_EXTRACTION_MIN_CHARS = 10

/**
 * max_new_tokens-schatting per beurt. De LiteRT-web-SDK kent geen per-call cap en
 * negeert deze waarde; hij blijft in de signatuur zodat het contract gelijkloopt
 * met de andere lokale resolvers en een toekomstige runtime 'm kan honoreren.
 */
export const LOCAL_EXTRACTION_MAX_NEW_TOKENS = 384

export interface LocalExtractionOptions {
  /**
   * Wordt aangeroepen rond het laden van de on-device sessie: 'starten' vlak
   * vóór loadModelSession(), 'klaar' zodra die resolved. De eerste (koude)
   * sessie-load is de trage GPU-warmup (~45-60 s, volledig stil); dit signaal
   * laat de UI daar feedback op tonen zodat het niet als een hang voelt.
   */
  onSessionState?: (s: 'starten' | 'klaar') => void
  /**
   * Voortgang per afgeronde beurt (1..3). Drie beurten van elk tien tot dertig
   * seconden voelt zonder dit signaal als één lange stilte.
   */
  onStap?: (stap: number, totaal: number, label: string) => void
}

const STAPPEN = 3

async function runTurn(prompt: string, opts: LocalExtractionOptions): Promise<string> {
  opts.onSessionState?.('starten')
  const session = await loadModelSession()
  opts.onSessionState?.('klaar')
  return session.generate(
    [
      { role: 'system', content: LOCAL_EXTRACTION_DNA },
      { role: 'user', content: prompt },
    ],
    LOCAL_EXTRACTION_MAX_NEW_TOKENS,
  )
}

/**
 * Eén beurt met sessieherstel: crash → dispose + verse sessie, één keer opnieuw;
 * faalt het weer → werpen. ALTIJD loggen — zonder deze regels is een lokale-AI-
 * fout voor gebruiker én support volstrekt onzichtbaar.
 */
async function runTurnWithRecovery(
  prompt: string,
  label: string,
  opts: LocalExtractionOptions,
): Promise<string> {
  try {
    return await runTurn(prompt, opts)
  } catch (err) {
    console.error(`[lokale-ai] extractie-beurt "${label}" mislukt — sessieherstel + één retry volgt:`, err)
    await disposeSession()
    try {
      return await runTurn(prompt, opts)
    } catch (err2) {
      console.error(`[lokale-ai] extractie-beurt "${label}" mislukt ná sessieherstel — extractie faalt definitief:`, err2)
      throw err2
    }
  }
}

/**
 * Lees een korte vrije tekst on-device uit tot bezittingen, schulden,
 * levensgebeurtenissen en inkomen/uitgaven.
 *
 * Levert exact dezelfde vorm als het cloud-pad (`ExtractionResult`), zodat de
 * aanroeper alleen de bron hoeft om te schakelen. Alle afgeleide velden
 * (rendement, rente, aflossing, liquiditeit, looptijd, icoon) zijn
 * deterministisch in TypeScript ingevuld — het model raakt er geen enkele van
 * aan.
 *
 * Werpt wanneer een beurt ook ná sessieherstel faalt. NOOIT een stille
 * cloud-fallback.
 */
export async function extractFinancialDataLocal(
  text: string,
  ctx: LocalExtractionContext = {},
  opts: LocalExtractionOptions = {},
): Promise<ExtractionResult> {
  const trimmed = (text ?? '').trim()
  if (trimmed.length < LOCAL_EXTRACTION_MIN_CHARS) {
    return EMPTY_EXTRACTION_RESULT
  }

  // Beurt 1 — bezittingen en schulden.
  opts.onStap?.(1, STAPPEN, 'Bezittingen en schulden')
  const assetsDebtsRaw = await runTurnWithRecovery(
    buildAssetsDebtsPrompt(trimmed, ctx),
    'bezittingen-schulden',
    opts,
  )
  const assetsDebts = parseLocalAssetsDebts(assetsDebtsRaw)

  // Beurt 2 — levensgebeurtenissen.
  opts.onStap?.(2, STAPPEN, 'Toekomstplannen')
  const eventsRaw = await runTurnWithRecovery(buildLifeEventsPrompt(trimmed, ctx), 'levensgebeurtenissen', opts)
  const events = parseLocalLifeEvents(eventsRaw)

  // Beurt 3 — inkomen, uitgaven en de restcontext.
  opts.onStap?.(3, STAPPEN, 'Inkomen en uitgaven')
  const incomeRaw = await runTurnWithRecovery(buildIncomeExpensesPrompt(trimmed, ctx), 'inkomen-uitgaven', opts)
  const income = parseLocalIncomeExpenses(incomeRaw)

  // Diagnose in één regel: zonder dit is een afgekapte beurt niet te zien.
  console.info(
    `[lokale-ai] extractie: ${assetsDebts.assets.length} bezittingen, ${assetsDebts.debts.length} schulden, ` +
      `${events.life_events.length} plannen; ${assetsDebts.dropped + events.dropped} objecten gedropt` +
      `${assetsDebts.truncated || events.truncated ? ' (uitvoer afgekapt)' : ''}`,
  )

  return {
    assets: assetsDebts.assets,
    debts: assetsDebts.debts,
    life_events: events.life_events,
    monthly_income_estimate: income.monthly_income_estimate,
    monthly_expenses_estimate: income.monthly_expenses_estimate,
    financial_context_remainder: income.financial_context_remainder,
  }
}
