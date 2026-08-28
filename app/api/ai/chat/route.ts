import { streamText, convertToModelMessages, createUIMessageStreamResponse, stepCountIs, type UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { buildSystemPrompt, type AIDomain, type ChatContext } from '@/lib/ai/dna'
import { buildContext } from '@/lib/ai/context/builder'
import { getTools } from '@/lib/ai/tools'
import { WHATIF_PROMPT } from '@/lib/ai/dna/wil'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import { checkTierGate } from '@/lib/require-tier'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { AI_ERROR_CODE, describeAiError } from '@/lib/ai/error-copy'
import { unauthorized, errorResponse } from '@/lib/api/respond'

/* AI response timeout in milliseconds (60 seconds) */
const AI_TIMEOUT_MS = 60_000

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // ── Privé-modus gate (laag 3 uit het plan — server-side, beslissend) ───────
  // FR-C2a.6: staat privé-modus aan, dan draait de Fin-chat lokaal op het
  // toestel en mag de financiële context deze route NOOIT richting een externe
  // AI-provider verlaten. We blokkeren hier — direct ná de auth-check en VÓÓR de
  // tier-/credit-gate, het model laden en de context/prompt-opbouw. Dit is de
  // beslissende fail-closed-laag: een client-race (bv. autoOpenMessage vuurt
  // vóór privacyMode/readiness client-side geladen is) of een gemanipuleerd
  // verzoek mag buildContext/buildSystemPrompt (regels verderop) nooit alsnog
  // naar de cloud laten gaan. Spiegelt exact app/api/ai/categorize/route.ts.
  //
  // Own-row read via de anon/RLS-client (auth.uid() = id), NOOIT service-role.
  // Eén minimale scalar-select. Defensief: de kolom kan in oudere omgevingen nog
  // ontbreken → fail-open naar `false` (bestaand cloud-gedrag), zodat de route
  // niet breekt vóór de migratie is toegepast. Pre-migratie kán geen enkele
  // gebruiker privacy_mode=true hebben, dus deze fail-open honoreert geen
  // bestaande privacy-voorkeur ten onrechte.
  // Via de GEDEELDE helper, niet via een eigen `privacy_mode`-lezing. Dat verschil
  // is niet cosmetisch: sinds de gebruiker per groep kan kiezen (ADR 0078) is de
  // hoofdschakelaar nog maar de DEFAULT — een override op 'gesprek' hoort te
  // winnen. Deze route las alleen de hoofdschakelaar en negeerde de override, dus
  // wie 'Gesprek met Fin' op lokaal zette terwijl de hoofdschakelaar op cloud
  // stond, zag zijn volledige financiële context alsnog naar de provider gaan.
  // De schakelaar op /mijn/privacy was voor deze functie decoratief.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'gesprek')
  if (privacyGate) return privacyGate

  // Alle gates hieronder sturen een STABIELE `code` mee (ADR 0044 +
  // lib/ai/error-copy.ts). De client classificeert daarop — niet meer op
  // substrings van de body — en weet zo per klasse of retry überhaupt kan
  // slagen. Zonder code belandden kill-switch, creditlimiet en privé-modus
  // allemaal op één generieke "er ging iets mis" mét een retry-knop die nooit
  // kon slagen (H27).
  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return errorResponse(tierGate.error, 403, AI_ERROR_CODE.subscription)
  }

  // Per-gebruiker rate-limit: dwing het maand-creditbudget af (één gedeelde
  // bucket over alle AI-features) vóór de dure LLM-call.
  const creditGate = await checkCreditBudget(supabase, user.id, 'chat')
  if (!creditGate.allowed) {
    // De tekst blijft van de server komen: die noemt het aantal credits en de
    // resetdatum. `error-copy.ts` markeert deze code als `preferServerText`.
    const res = errorResponse(creditLimitMessage(creditGate), 429, AI_ERROR_CODE.creditLimit)
    res.headers.set('Retry-After', String(creditGate.retryAfterSeconds))
    return res
  }

  const { messages, domain = 'wil', context: chatContext, scenarioContext } = await req.json() as {
    messages: UIMessage[]
    domain?: AIDomain
    context?: ChatContext
    scenarioContext?: {
      sliders: Record<string, number>
      baselineFireAge: number | null
      scenarioFireAge: number | null
      fireDeltaMonths: number | null
      activeEvents: Array<{
        name: string
        event_type: string
        target_age: number | null
        one_time_cost: number
        monthly_cost_change: number
        monthly_income_change: number
        duration_months: number
      }>
    }
  }

  const validDomains: AIDomain[] = ['kern', 'wil', 'horizon']
  const safeDomain = validDomains.includes(domain) ? domain : 'wil'

  let model
  try {
    model = await getModel(supabase, 'chat')
  } catch (err) {
    if (err instanceof AIConfigError) {
      // De echte reden (provider, beheerpad, env-variabele) gaat naar het
      // SERVERLOG — nooit naar de client. Zie /beheer/ai voor de
      // per-provider sleutel-indicator. De gebruiker krijgt de neutrale tekst
      // uit de gedeelde copy-tabel plus een stabiele code (H27).
      console.error(`[ai-chat:config] ${err.provider}: ${err.message}`)
      return errorResponse(describeAiError(err.reason).text, 422, err.reason)
    }
    console.error('[ai-chat:model] model kon niet worden geladen:', err)
    return errorResponse(describeAiError(AI_ERROR_CODE.unavailable).text, 500, AI_ERROR_CODE.unavailable)
  }

  /* Build context and prompts — catch errors to avoid crashing the stream */
  let systemPrompt: string
  let financialContext: string
  try {
    if (chatContext === 'whatif') {
      // What-if mode uses a dedicated prompt — skip the DB-backed prompt builder
      systemPrompt = WHATIF_PROMPT

      // Append scenario context if provided
      if (scenarioContext) {
        const { sliders, baselineFireAge, scenarioFireAge, fireDeltaMonths, activeEvents } = scenarioContext
        const lines: string[] = ['\n\n--- HUIDIG SCENARIO ---']

        // Slider overrides
        const sliderLabels: Record<string, string> = {
          inkomensWijziging: 'Inkomen wijziging',
          werkdagenWijziging: 'Werkdagen wijziging',
          spaarquoteWijziging: 'Spaarquote wijziging',
          rendementWijziging: 'Rendement wijziging',
          extraInleg: 'Extra maandelijkse inleg',
        }
        const activeSliders = Object.entries(sliders || {}).filter(([, v]) => v !== 0)
        if (activeSliders.length > 0) {
          lines.push('Slider-waarden (wijzigingen t.o.v. baseline):')
          for (const [key, value] of activeSliders) {
            const label = sliderLabels[key] || key
            const prefix = value > 0 ? '+' : ''
            const suffix = key === 'extraInleg' ? ' EUR/mnd' : key.includes('Wijziging') ? '%' : ''
            lines.push(`  ${label}: ${prefix}${value}${suffix}`)
          }
        }

        // FIRE ages
        if (baselineFireAge != null) lines.push(`Baseline FIRE-leeftijd: ${baselineFireAge} jaar`)
        if (scenarioFireAge != null) lines.push(`Scenario FIRE-leeftijd: ${scenarioFireAge} jaar`)
        if (fireDeltaMonths != null) {
          const sign = fireDeltaMonths > 0 ? '+' : ''
          const years = Math.abs(fireDeltaMonths) >= 12 ? `${Math.round(Math.abs(fireDeltaMonths) / 12)} jaar` : `${Math.abs(fireDeltaMonths)} maanden`
          lines.push(`FIRE delta: ${sign}${fireDeltaMonths} maanden (${fireDeltaMonths > 0 ? 'later' : years + ' eerder'})`)
        }

        // Active events
        if (activeEvents && activeEvents.length > 0) {
          lines.push(`\nActieve levensgebeurtenissen (${activeEvents.length}):`)
          for (const ev of activeEvents) {
            const parts = [`  - ${ev.name} (${ev.event_type})`]
            if (ev.target_age != null) parts.push(`leeftijd ${ev.target_age}`)
            if (ev.one_time_cost !== 0) parts.push(`eenmalig €${Math.abs(ev.one_time_cost)}`)
            if (ev.monthly_cost_change !== 0) parts.push(`€${ev.monthly_cost_change}/mnd kosten`)
            if (ev.monthly_income_change !== 0) parts.push(`€${ev.monthly_income_change}/mnd inkomen`)
            if (ev.duration_months > 0) parts.push(`${ev.duration_months} maanden`)
            lines.push(parts.join(', '))
          }
        } else {
          lines.push('\nGeen levensgebeurtenissen actief in dit scenario.')
        }

        lines.push('--- EINDE SCENARIO ---')
        systemPrompt += lines.join('\n')
      }

      financialContext = await buildContext(supabase)
    } else {
      ;[systemPrompt, financialContext] = await Promise.all([
        buildSystemPrompt(safeDomain, supabase),
        buildContext(supabase),
      ])
    }
  } catch (err) {
    console.error('[AI Chat] Context build failed:', err)
    return errorResponse(
      describeAiError(AI_ERROR_CODE.contextFailed).text,
      500,
      AI_ERROR_CODE.contextFailed,
    )
  }

  /* Sanitize PII from financial context before sending to AI provider */
  /* FAIL-SAFE: if sanitization fails, block the AI call entirely —
     never send unsanitized data to an external AI provider. */
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, date_of_birth')
      .eq('id', user.id)
      .single()

    const sanitizeOpts: SanitizeOptions = {}
    if (profile) {
      const names = [profile.full_name].filter(Boolean) as string[]
      if (names.length > 0) sanitizeOpts.names = names
      if (profile.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth
    }

    financialContext = sanitizeForAI(financialContext, sanitizeOpts)
  } catch (err) {
    console.error('[AI Chat] Sanitization failed — AI call blocked (fail-safe):', err)
    return errorResponse(
      describeAiError(AI_ERROR_CODE.safetyCheck).text,
      503,
      AI_ERROR_CODE.safetyCheck,
    )
  }

  const tools = getTools(safeDomain, supabase, chatContext, user.id)
  const modelMessages = await convertToModelMessages(messages)

  /* Create an AbortController that fires on timeout */
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS)

  /* Also abort if the client disconnects */
  req.signal.addEventListener('abort', () => abortController.abort())

  try {
    const result = streamText({
      model,
      system: systemPrompt + '\n\n' + financialContext,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      abortSignal: abortController.signal,
      onFinish: () => recordAiUsage(supabase, user.id, 'chat'),
    })

    /* PII output filter — mask any IBANs/BSNs that slip through in AI output.
     * We wrap the UIMessageStream with a TransformStream that applies maskPIIInOutput
     * to each chunk's string content. The UIMessageStream encodes chunks as strings
     * at the wire level, so we intercept at that layer. */
    // `onError` bepaalt wat er bij een providerfout MIDDEN in de stream naar de
    // client gaat. Zonder deze hook stuurt de AI SDK zijn Engelse default
    // ("An error occurred.") — Engels in een NL-app én niet classificeerbaar.
    // We geven bewust alléén de envelope met een stabiele code terug; de echte
    // fout blijft in het serverlog (anders lekt een providerbericht mee).
    const rawStream = result.toUIMessageStream({
      onError: (err: unknown) => {
        console.error('[ai-chat:stream]', err)
        const copy = describeAiError(AI_ERROR_CODE.streamFailed)
        return JSON.stringify({ error: copy.text, code: copy.code })
      },
    })
    const piiFilter = new TransformStream({
      transform(chunk: unknown, controller: TransformStreamDefaultController) {
        if (typeof chunk === 'string') {
          controller.enqueue(maskPIIInOutput(chunk))
        } else {
          controller.enqueue(chunk)
        }
      },
    })
    const filteredStream = rawStream.pipeThrough(piiFilter)

    return createUIMessageStreamResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream: filteredStream as any,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'

    if (isTimeout) {
      console.error('[AI Chat] Stream error: TIMEOUT')
      return errorResponse(describeAiError(AI_ERROR_CODE.timeout).text, 504, AI_ERROR_CODE.timeout)
    }

    // Rauwe error.message hoort niet in de response (ADR 0044): de echte fout
    // gaat met stack + grep-bare tag naar het serverlog, de client krijgt de
    // curated tekst plus een code waarop hij de affordance kan bepalen.
    console.error('[ai-chat:POST]', err, err instanceof Error ? err.stack : '')
    return errorResponse(describeAiError(AI_ERROR_CODE.streamFailed).text, 500, AI_ERROR_CODE.streamFailed)
  } finally {
    clearTimeout(timeoutId)
  }
}
