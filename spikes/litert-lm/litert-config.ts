// Vaste constanten voor het LiteRT-LM-meetharnas. Wegwerp-spikecode; deze waarden
// komen 1-op-1 uit het integratierecept (geverifieerd 19 jul 2026).

/**
 * Ongegate, Apache-2.0 web-build van Gemma 4 E2B-it in het .litertlm-formaat
 * (~2,01 GB). Dit is de directe download-URL; het harnas cachet 'm zelf in Cache
 * Storage (zie litert-engine.ts) en serveert 'm daarna als Blob aan Engine.create.
 */
export const MODEL_URL =
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm'

/** Cache-Storage-cachenaam; key = de model-URL hierboven. */
export const CACHE_NAME = 'litert-lm-spike'

/** mainExecutorSettings.maxNumTokens uit het recept. */
export const MAX_NUM_TOKENS = 8192

/** Batchgrootte identiek aan het fase-0-contract. */
export const DEFAULT_BATCH_SIZE = 10

/** Standaard aantal volledige runs (herhaling zonder herlaad). */
export const DEFAULT_RUNS = 1
