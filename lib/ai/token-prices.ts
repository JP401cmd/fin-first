// lib/ai/token-prices.ts
//
// Tarieven per model, om tokenverbruik naar geld te vertalen op /beheer/jobs.
//
// Anthropic factureert in USD ("All payments are in USD" — platform.claude.com
// /docs/en/about-claude/pricing). USD is hier dus de BRON; de euro-weergave is
// een omrekening en wordt als zodanig gelabeld. Dat is bewust andersom dan in de
// rest van de app: dit zijn onze bedrijfskosten, geen gebruikersbedragen, en ze
// horen niet in `lib/constants.ts` of `lib/box3-data.ts` (die dragen fiscale
// kerngetallen van de gebruiker) en niet in `lib/euro-display.ts` (ADR 0090/0093
// gaan over deflatie van gebruikersbedragen — een API-factuur deflateer je niet).
//
// ── Wat dit NIET is ─────────────────────────────────────────────────────────
// Een schatting, geen factuur. Drie redenen waarom het bedrag kan afwijken:
//
//  1. Prompt-caching wordt verrekend via `cache_read_tokens` (0,1× het
//     basistarief) en `cache_write_tokens` (1,25×, de 5-minuten-cache) in
//     `ai_token_usage` (migratie 20261007120000). `input_tokens` is het totaal
//     inclusief die twee. De 1-uurs-cache (2×) gebruiken we niet; zet iemand
//     `ttl: '1h'`, dan ONDERSCHAT deze berekening de writes.
//  2. De Batch API kost de helft; wij gebruiken hem niet.
//  3. Volumekorting en `inference_geo` (1,1× bij US-only) zijn niet verwerkt.
//
// Houd `PRIJZEN_PEILDATUM` bij wanneer je een tarief aanraakt — zonder die
// datum is een stil verouderd tarief niet van een actueel te onderscheiden.

/** Wanneer de tarieven hieronder voor het laatst zijn gecontroleerd. */
export const PRIJZEN_PEILDATUM = '2026-09-29'

/** Bron van de tarieven, zodat een lezer ze zelf kan natrekken. */
export const PRIJZEN_BRON = 'platform.claude.com/docs/en/about-claude/pricing'

export interface ModelTarief {
  /** USD per miljoen inputtokens. */
  inputPerMTok: number
  /** USD per miljoen outputtokens. */
  outputPerMTok: number
  /** USD per miljoen cache-reads, waar die afwijkt van 0,1× input. */
  cacheReadPerMTok?: number
}

/**
 * Tarieven per model-alias, in USD per miljoen tokens (basistarief, geen batch,
 * geen cache). Sleutel = de alias zonder datum-suffix; `normalizeModelId`
 * brengt een volledige id als `claude-sonnet-4-5-20250929` daarheen terug.
 *
 * **Dekking: uitsluitend Anthropic-modellen.** `lib/ai/config.ts` kan ook
 * OpenAI (`gpt-4o`), Mistral (`mistral-large-latest`) en Ollama aanroepen. Voor
 * de eerste twee staan hier bewust GÉÉN tarieven: die komen uit een andere
 * prijslijst die we niet bijhouden, en een verzonnen tarief is erger dan geen.
 * Zo'n run levert `null` → het scherm zegt "onbekend" in plaats van een bedrag
 * dat er geloofwaardig uitziet. Ollama draait lokaal en wordt op `provider`
 * afgehandeld, niet op modelnaam — zie `estimateCostUsd`.
 */
export const MODEL_TARIEVEN: Record<string, ModelTarief> = {
  // Wat deze app vandaag gebruikt (`config.ts` — anthropic-default).
  'claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  // Directe buren, voor als het model wisselt.
  'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-sonnet-4-6': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
  'claude-opus-4-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-6': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-7': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-4-8': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2 },
  'claude-fable-5': { inputPerMTok: 10, outputPerMTok: 50 },
  'claude-fable-5-1': { inputPerMTok: 10, outputPerMTok: 50, cacheReadPerMTok: 0.25 },
}

/**
 * Providers die lokaal draaien: geen factuur, dus kosten 0 — en dat is een
 * ándere uitspraak dan "tarief onbekend". Op `provider` en niet op modelnaam,
 * omdat de gelogde modelnaam bij Ollama een vrije instelling is
 * (`settings.ai_model_ollama || 'llama3.2'` in `lib/ai/config.ts`): elke naam
 * die iemand daar invult hoort gratis te zijn.
 */
const GRATIS_PROVIDERS = new Set(['ollama'])

/** Cache-lezen kost 0,1× het inputtarief; schrijven (5-minuten-cache) 1,25×. */
export const CACHE_READ_FACTOR = 0.1
export const CACHE_WRITE_FACTOR = 1.25

/**
 * Brengt een model-id terug naar de tarief-alias. Provider-id's dragen een
 * datum-suffix (`claude-sonnet-4-5-20250929`) die de tarieven niet kennen; die
 * knippen we eraf. Bewust een suffix-patroon en géén `startsWith`-scan over de
 * sleutels: `claude-opus-4-5` is een prefix van niets, maar een losse
 * prefix-match zou `claude-sonnet-4-5` ook op `claude-sonnet-4-5-haiku` laten
 * vallen als zo'n naam ooit bestaat.
 */
export function normalizeModelId(model: string): string {
  const id = model.trim().toLowerCase()
  if (!id) return ''
  // Anthropic-datumsuffix: exact acht cijfers achteraan (YYYYMMDD).
  return id.replace(/-\d{8}$/, '')
}

export function tariefVoor(model: string): ModelTarief | null {
  return MODEL_TARIEVEN[normalizeModelId(model)] ?? null
}

/**
 * Geschatte kosten in USD voor een aantal in- en outputtokens.
 *
 * Drie uitkomsten, en het verschil tussen de laatste twee is de hele reden dat
 * deze functie `number | null` teruggeeft:
 *  - een bedrag, bij een bekend Anthropic-tarief;
 *  - `0` bij een lokale provider — écht kosteloos;
 *  - `null` bij een onbekend tarief. Dat mag nooit als $0,00 op het scherm
 *    komen: "gratis" en "niet te bepalen" zijn verschillende uitkomsten, en de
 *    eerste is een stille onwaarheid over een rekening die wél loopt.
 *
 * `provider` komt uit dezelfde rij als `model` in `ai_token_usage`.
 */
export function estimateCostUsd(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  /** Het deel van `inputTokens` dat uit de cache kwam of erin ging. */
  cache: { read: number; write: number } = { read: 0, write: 0 },
): number | null {
  if (GRATIS_PROVIDERS.has(provider.trim().toLowerCase())) return 0
  const tarief = tariefVoor(model)
  if (!tarief) return null
  const read = Math.max(0, cache.read)
  const write = Math.max(0, cache.write)
  const ongecachet = Math.max(0, inputTokens - read - write)
  const perToken = tarief.inputPerMTok / 1_000_000
  return (
    ongecachet * perToken +
    read * (tarief.cacheReadPerMTok != null ? tarief.cacheReadPerMTok / 1_000_000 : perToken * CACHE_READ_FACTOR) +
    write * perToken * CACHE_WRITE_FACTOR +
    (outputTokens / 1_000_000) * tarief.outputPerMTok
  )
}
