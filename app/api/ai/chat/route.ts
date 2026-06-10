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

/* AI response timeout in milliseconds (60 seconds) */
const AI_TIMEOUT_MS = 60_000

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return new Response(JSON.stringify({ error: tierGate.error }), { status: 403, headers: { 'Content-Type': 'application/json' } })
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
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
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
    return Response.json(
      { error: 'Kon financiele context niet laden. Probeer het opnieuw.' },
      { status: 500 },
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
    return Response.json(
      { error: 'De AI-assistent is tijdelijk niet beschikbaar vanwege een beveiligingscontrole. Probeer het later opnieuw.' },
      { status: 503 },
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
    const rawStream = result.toUIMessageStream()
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
    const baseMessage = isTimeout
      ? 'Het AI-antwoord duurde te lang. Probeer het opnieuw met een kortere vraag.'
      : 'Er ging iets mis bij het genereren van een antwoord. Probeer het opnieuw.'

    // Geef de gebruiker de daadwerkelijke error-detail mee zodat productie-
    // bugs zichtbaar worden zonder Vercel-log-toegang. PII-gevoelige delen
    // (stacktraces, paden) blijven achterwege; alleen de error-message zelf.
    const rawDetail = err instanceof Error ? err.message : String(err)
    const detail = isTimeout
      ? null
      : rawDetail.slice(0, 240).replace(/\s+/g, ' ').trim() || null

    console.error('[AI Chat] Stream error:', isTimeout ? 'TIMEOUT' : err)
    return Response.json(
      { error: baseMessage, detail },
      { status: isTimeout ? 504 : 500 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}
