// lib/ai/token-usage.ts
//
// Werkelijk tokenverbruik per AI-call vastleggen in `ai_token_usage`.
// Gevoed door de model-middleware in lib/ai/config.ts (getModel met een
// feature-string) — élke generate- of stream-call logt automatisch de
// input-/output-tokens die de provider rapporteert. Dit staat los van de
// credit-metering (lib/ai-credits.ts): credits zijn afgesproken kosten per
// actie, tokens zijn het echte verbruik.
//
// Wie de aanroep deed, geeft de AANROEPER mee (`userId`), niet een
// `auth.getUser()` achteraf: de middleware logt bij `finish` van de stream, en
// dat kan ná de request-context vallen (sessie-cookie/refresh niet meer
// beschikbaar). Faalde getUser daar, dan landde een gebruikersaanroep als
// `user_id = null` — en /beheer/jobs telt null als systeem (lib/beheer/
// run-tokens.ts). Contract van `userId`:
//   - string    → die gebruiker, géén getUser
//   - null      → expliciete systeemcall (cron/service-client), géén getUser
//   - undefined → oude fallback: lazy `auth.getUser()` op de meegegeven sessie,
//                 zodat een nog niet omgezette aanroeper niet breekt
// Schrijven gaat via de service-role: de tabel heeft bewust geen
// insert-policy voor sessies.

import type { SupabaseClient } from '@supabase/supabase-js'
import { wrapLanguageModel, type LanguageModelMiddleware } from 'ai'
import { getServiceClient } from '@/lib/supabase/service'

// ── Feature-labels (voor /beheer/ai-verbruik) ───────────────────────────────

// `as const` (niet Record<string, string>) zodat de sleutels een echte union
// vormen: `AiTokenFeature`. Die union is de bron van de exhaustiviteit in
// lib/ai/execution-groups.ts — een nieuwe feature-string hier geeft daar een
// compile-fout tot hij in een uitvoergroep is ingedeeld (en dus tot duidelijk
// is of hij lokaal kan draaien). Zonder die koppeling zou een nieuwe AI-functie
// stil buiten de privé-modus-keuze vallen: precies de val die dit fundament dicht.
export const AI_TOKEN_FEATURE_LABELS = {
  chat: 'Fin-chat',
  briefing: 'Briefing',
  aanbevelingen: 'Aanbevelingen',
  aanbevelingen_initieel: 'Aanbevelingen (eerste set)',
  categorisatie: 'Transactie-categorisatie',
  rapport: 'Rapporten',
  nieuws: 'Nieuws (krant)',
  nieuws_ingest: 'Nieuws-ingest (achtergrond)',
  nieuws_duiding: 'Nieuws-duiding (Krant, achtergrond)',
  pensioen_extractie: 'Pensioen-extractie',
  aangifte_extractie: 'Aangifte-extractie',
  document_extractie: 'Document-extractie',
  budget_suggesties: 'Budget-suggesties (onboarding)',
  abonnementen_detectie: 'Abonnementen-detectie',
  abonnementen_analyse: 'Abonnementen-analyse',
  abonnementen_advies: 'Abonnementen-advies',
  rekenhulp_bouwen: 'Rekenhulp bouwen',
  scherm_publicatie: 'Schermpublicatie (beheer)',
} as const satisfies Record<string, string>

/** Elke feature-string die aan `getModel(supabase, feature)` wordt meegegeven. */
export type AiTokenFeature = keyof typeof AI_TOKEN_FEATURE_LABELS

/** Alle bekende feature-strings — stabiele volgorde voor UI en tests. */
export const AI_TOKEN_FEATURES = Object.keys(AI_TOKEN_FEATURE_LABELS) as AiTokenFeature[]

export function tokenFeatureLabel(key: string): string {
  // Bewust `string` in de signatuur: `ai_token_usage` kan historische rijen
  // bevatten met een feature die intussen hernoemd/verwijderd is — die tonen we
  // als de rauwe sleutel i.p.v. de rij te laten verdwijnen.
  return (AI_TOKEN_FEATURE_LABELS as Record<string, string>)[key] ?? key
}

// ── Loggen ──────────────────────────────────────────────────────────────────

/** Structureel subset van LanguageModelV3Usage — alleen wat we opslaan. */
export interface TokenUsageLike {
  inputTokens?: { total?: number | undefined } | null
  outputTokens?: { total?: number | undefined } | null
}

/**
 * Wie de aanroep deed. `string` = gebruiker, `null` = expliciet systeem,
 * `undefined` = onbekend → fallback op `auth.getUser()` bij het loggen.
 */
export type TokenLogUserId = string | null | undefined

/** Het gedeelde logging-deel van de opties (middleware + wrap + getModel). */
export interface TokenLoggingOptions {
  /** Sessie van de aanroeper — alleen gebruikt voor de getUser-fallback. */
  supabase: SupabaseClient
  feature: string
  provider: string
  modelId: string
  /** Zie `TokenLogUserId`. Weglaten = oude getUser-fallback. */
  userId?: TokenLogUserId
}

async function resolveUserId(supabase: SupabaseClient, userId: TokenLogUserId): Promise<string | null> {
  if (userId !== undefined) return userId
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function logAiTokens(
  opts: TokenLoggingOptions & { usage: TokenUsageLike | null | undefined },
): Promise<void> {
  try {
    const input = Math.round(opts.usage?.inputTokens?.total ?? 0)
    const output = Math.round(opts.usage?.outputTokens?.total ?? 0)
    const userId = await resolveUserId(opts.supabase, opts.userId)
    await getServiceClient().from('ai_token_usage').insert({
      user_id: userId,
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
export function tokenLoggingMiddleware(opts: TokenLoggingOptions): LanguageModelMiddleware {
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
  opts: TokenLoggingOptions,
) {
  return wrapLanguageModel({ model, middleware: tokenLoggingMiddleware(opts) })
}
