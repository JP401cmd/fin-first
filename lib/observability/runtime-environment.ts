/**
 * Eén bron voor "in wélke omgeving draait deze server-instantie" — bedoeld voor
 * observability-SCHRIJFPADEN die anders lokale dev-ruis in de PRODUCTIE-tabellen
 * zetten. Een lokale `next dev` die tegen de productie-Supabase praat schrijft
 * namelijk gewoon door: Turbopack/HMR-artefacten en localhost-chunkfouten landen
 * dan in `error_logs` en ondermijnen /beheer/errors als productiesignaal.
 *
 * De waarden spiegelen bewust `web_vitals.environment` (migratie
 * 20260802204934) — production | preview | development — zodat beide
 * telemetriepaden dezelfde omgevingstaal spreken.
 *
 * Bepaling, in volgorde:
 *   1. `VERCEL_ENV` — het platform zet dit op 'production' | 'preview' |
 *      'development' (die laatste bij `vercel dev`, dus lokaal). Leidend, want
 *      een preview-deploy draait een productie-BUILD (`NODE_ENV=production`)
 *      maar is geen productie — en moet wél loggen.
 *   2. `NODE_ENV === 'production'` — self-hosted / `next start` zonder Vercel.
 *   3. Anders development: lokale `next dev`, vitest, scripts.
 *
 * De default is bewust **"loggen tenzij aantoonbaar lokaal"**. Een guard die per
 * ongeluk óók in productie dichtstaat maakt de foutinbox blind, en dat is een
 * ernstiger defect dan de ruis die hij oplost. Daarom valt een onbekende of lege
 * `VERCEL_ENV` terug op `NODE_ENV` (op elk platform 'production' in een
 * productie-build) in plaats van op 'development'.
 */

export type RuntimeEnvironment = 'production' | 'preview' | 'development'

/** Alleen de twee variabelen die de omgeving bepalen; injecteerbaar voor tests. */
export type RuntimeEnvSource = {
  VERCEL_ENV?: string
  NODE_ENV?: string
}

export function resolveRuntimeEnvironment(
  env: RuntimeEnvSource = process.env,
): RuntimeEnvironment {
  const vercelEnv = env.VERCEL_ENV?.trim()
  if (vercelEnv === 'production' || vercelEnv === 'preview') return vercelEnv
  // `vercel dev` draait lokaal op de machine van de ontwikkelaar.
  if (vercelEnv === 'development') return 'development'
  // Leeg of onbekend telt als niet-gezet — niet als "development".
  if (env.NODE_ENV === 'production') return 'production'
  return 'development'
}

/**
 * Waar: fouten uit deze omgeving horen in de gedeelde `error_logs`-inbox.
 * Onwaar betekent uitsluitend "aantoonbaar een lokale ontwikkelomgeving".
 */
export function shouldPersistErrorLog(env: RuntimeEnvSource = process.env): boolean {
  return resolveRuntimeEnvironment(env) !== 'development'
}
