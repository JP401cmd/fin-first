// lib/ai/token-usage.ts
//
// Werkelijk tokenverbruik per AI-call vastleggen in `ai_token_usage`.
// Gevoed door de model-middleware in lib/ai/config.ts (getModel met een
// feature-string) — élke generate- of stream-call logt automatisch de
// input-/output-tokens die de provider rapporteert. Dit staat los van de
// credit-metering (lib/ai-credits.ts): credits zijn afgesproken kosten per
// actie, tokens zijn het echte verbruik.
//
// De userId wordt lazy bepaald uit de meegegeven sessie (auth.getUser) op
// het moment van loggen — systeemcalls (crons met de service-client) loggen
// met user_id null. Schrijven gaat via de service-role: de tabel heeft
// bewust geen insert-policy voor sessies.

import type { SupabaseClient } from '@supabase/supabase-js'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { getServiceClient } from '@/lib/supabase/service'

// ── Feature-labels (voor /beheer/ai-verbruik) ───────────────────────────────

export const AI_TOKEN_FEATURE_LABELS: Record<string, string> = {
  chat: 'Will-chat',
  briefing: 'Briefing',
  aanbevelingen: 'Aanbevelingen',
  aanbevelingen_initieel: 'Aanbevelingen (eerste set)',
  categorisatie: 'Transactie-categorisatie',
  rapport: 'Rapporten',
  nieuws: 'Nieuws (krant)',
  nieuws_ingest: 'Nieuws-ingest (achtergrond)',
  pensioen_extractie: 'Pensioen-extractie',
  aangifte_extractie: 'Aangifte-extractie',
  document_extractie: 'Document-extractie',
  budget_suggesties: 'Budget-suggesties (onboarding)',
  abonnementen_detectie: 'Abonnementen-detectie',
  abonnementen_analyse: 'Abonnementen-analyse',
  abonnementen_advies: 'Abonnementen-advies',
  rekenhulp_bouwen: 'Rekenhulp bouwen',
  scherm_publicatie: 'Schermpublicatie (beheer)',
  whatif_suggesties: 'What-if-suggesties',
}

export function tokenFeatureLabel(key: string): string {
  return AI_TOKEN_FEATURE_LABELS[key] ?? key
}

// ── Loggen ──────────────────────────────────────────────────────────────────

/** Structureel subset van LanguageModelV3Usage — alleen wat we opslaan. */
export interface TokenUsageLike {
  inputTokens?: { total?: number | undefined } | null
  outputTokens?: { total?: number | undefined } | null
}

export async function logAiTokens(opts: {
  /** Sessie van de aanroeper — alleen gebruikt om de user te bepalen. */
  supabase: SupabaseClient
  feature: string
  provider: string
  modelId: string
  usage: TokenUsageLike | null | undefined
}): Promise<void> {
  try {
    const input = Math.round(opts.usage?.inputTokens?.total ?? 0)
    const output = Math.round(opts.usage?.outputTokens?.total ?? 0)
    const {
      data: { user },
    } = await opts.supabase.auth.getUser()
    await getServiceClient().from('ai_token_usage').insert({
      user_id: user?.id ?? null,
      feature: opts.feature,
      provider: opts.provider,
      model: opts.modelId,
      input_tokens: input,
      output_tokens: output,
    })
  } catch {
    // Metering mag de AI-actie nooit breken.
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

/**
 * AI SDK-middleware die elke generate-/stream-call logt. Multi-step-calls
 * (tools) doen meerdere doStream-rondes en loggen dus per provider-call —
 * precies wat we willen meten. Wordt door getModel om het basismodel heen
 * gelegd; gebruik `wrapModelWithTokenLogging` voor losse modellen die niet
 * via getModel lopen.
 */
export function tokenLoggingMiddleware(opts: {
  supabase: SupabaseClient
  feature: string
  provider: string
  modelId: string
}): LanguageModelMiddleware {
  const log = (usage: unknown) => {
    void logAiTokens({ ...opts, usage: (usage ?? null) as TokenUsageLike | null })
  }
  return {
    specificationVersion: 'v3',
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate()
      log(result.usage)
      return result
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream()
      const logged = stream.pipeThrough(
        new TransformStream({
          transform(part, controller) {
            const p = part as { type?: string; usage?: unknown }
            if (p.type === 'finish') log(p.usage)
            controller.enqueue(part)
          },
        }),
      )
      return { stream: logged, ...rest }
    },
  }
}

export type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model']

/** Wrap een los (niet via getModel verkregen) model met token-logging. */
export function wrapModelWithTokenLogging<M extends WrappableModel>(
  model: M,
  opts: { supabase: SupabaseClient; feature: string; provider: string; modelId: string },
) {
  return wrapLanguageModel({ model, middleware: tokenLoggingMiddleware(opts) })
}
