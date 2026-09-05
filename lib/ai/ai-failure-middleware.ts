// lib/ai/ai-failure-middleware.ts
//
// Élke mislukte cloud-AI-aanroep krijgt een rij in `error_logs` (UR3-09 / ADR
// 0132). Vóór deze middleware bestond er GEEN schrijfpad: `serverError()`
// logt alleen naar console, en een fout MIDDEN in een stream levert een
// HTTP 200 op (de stream was al gestart) — dus ook `onRequestError` ving 'm
// nooit. Productie 15 aug–5 sep: nul AI-rijen in error_logs terwijl de
// provider twaalf dagen structureel weigerde.
//
// `getModel()` (lib/ai/config.ts) legt deze middleware ALTIJD om het model —
// ook zonder feature-string ('onbekend') — zodat alle callsites gedekt zijn
// zonder ze zelf te hoeven wijzigen.

import type { LanguageModelMiddleware } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { logError } from '@/lib/log-error'
import { classifyProviderError } from '@/lib/ai/provider-error'

/**
 * Berichtvorm: `<klasse> (<status>/<foutnaam>): <providerbericht>`. De
 * `<klasse>`-prefix (`refused`/`transient`/`unknown`) is bewust machineleesbaar
 * — `lib/ai/ai-health-loader.ts` leest 'm terug om de aard van elke mislukking
 * te bepalen zonder een eigen kolom nodig te hebben.
 *
 * AVG: bewust NIET opgeslagen — `requestBodyValues`/`responseHeaders` (kunnen
 * de financiële context of de prompt bevatten). Alleen de providerfout zelf,
 * afgekapt op 500 tekens (zelfde afkapping als `logError` op `message`).
 */
function formatFailureMessage(err: unknown): string {
  const kind = classifyProviderError(err)
  const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
    ? (err as { statusCode: number }).statusCode
    : undefined
  const errorName = err instanceof Error ? err.name : 'Error'
  const rawMessage = err instanceof Error ? err.message : String(err)
  return `${kind} (${statusCode ?? '—'}/${errorName}): ${rawMessage}`.slice(0, 500)
}

// Eén fout-object mag maar één keer een rij opleveren, ook als zowel
// `wrapGenerate` als een stream-error-part 'm zien (of als een aanroepende
// route 'm nogmaals doorgeeft). SDK-retries gooien een NIEUW fout-object per
// poging — die geven bewust wél elk een eigen rij (acceptabel, `/beheer/errors`
// groepeert per foutsoort).
const loggedErrors = new WeakSet<object>()

/**
 * Schrijft één `error_logs`-rij voor een mislukte cloud-AI-aanroep. Exported
 * (niet alleen middleware-intern) zodat `lib/ai/config.ts` 'm ook kan
 * aanroepen voor een `AIConfigError` die vóór het model bestaat (ontbrekende
 * sleutel) — die fout gaat nooit door `doGenerate`/`doStream` heen.
 */
export async function logAiFailure(
  tag: string,
  err: unknown,
  opts?: { supabase?: SupabaseClient },
): Promise<void> {
  if (err && typeof err === 'object') {
    if (loggedErrors.has(err)) return
    loggedErrors.add(err)
  }
  try {
    let userId: string | null = null
    if (opts?.supabase) {
      const { data } = await opts.supabase.auth.getUser()
      userId = data.user?.id ?? null
    }
    await logError(getServiceClient(), {
      userId,
      context: tag,
      message: formatFailureMessage(err),
    })
  } catch {
    // Foutregistratie mag de AI-call zelf nooit breken.
  }
}

/**
 * AI-SDK-middleware die elke mislukte `doGenerate`/`doStream`-call én elk
 * `error`-stream-part (LanguageModelV3StreamResult, `type: 'error'` — de vorm
 * waarin een providerfout MIDDEN in een reeds gestarte stream verschijnt)
 * naar `error_logs` schrijft, en de fout ongewijzigd doorgeeft.
 */
export function aiFailureMiddleware(opts: {
  supabase: SupabaseClient
  /** Feature-string uit `getModel(supabase, feature)`, of 'onbekend' zonder feature. */
  feature: string
}): LanguageModelMiddleware {
  const tag = `ai:${opts.feature}`
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      try {
        return await doGenerate()
      } catch (err) {
        await logAiFailure(tag, err, opts)
        throw err
      }
    },
    wrapStream: async ({ doStream }) => {
      let result: Awaited<ReturnType<typeof doStream>>
      try {
        result = await doStream()
      } catch (err) {
        await logAiFailure(tag, err, opts)
        throw err
      }
      const { stream, ...rest } = result
      const logged = stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            const p = part as { type?: string; error?: unknown }
            if (p.type === 'error') {
              void logAiFailure(tag, p.error, opts)
            }
            controller.enqueue(part)
          },
        }),
      )
      return { stream: logged, ...rest }
    },
  }
}
