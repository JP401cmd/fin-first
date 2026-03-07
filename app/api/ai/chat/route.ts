import { streamText, convertToModelMessages, createUIMessageStreamResponse, stepCountIs, type UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { buildSystemPrompt, type AIDomain, type ChatContext } from '@/lib/ai/dna'
import { buildContext } from '@/lib/ai/context/builder'
import { getTools } from '@/lib/ai/tools'
import { WHATIF_PROMPT } from '@/lib/ai/dna/wil'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'

/* AI response timeout in milliseconds (60 seconds) */
const AI_TIMEOUT_MS = 60_000

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages, domain = 'wil', context: chatContext } = await req.json() as {
    messages: UIMessage[]
    domain?: AIDomain
    context?: ChatContext
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
    // Non-fatal: if sanitization fails, proceed with unsanitized context
    console.warn('[AI Chat] Sanitization failed, proceeding with raw context:', err)
  }

  const tools = getTools(safeDomain, supabase, chatContext)
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
    })

    return createUIMessageStreamResponse({
      stream: result.toUIMessageStream(),
    })
  } catch (err) {
    clearTimeout(timeoutId)
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'
    const message = isTimeout
      ? 'Het AI-antwoord duurde te lang. Probeer het opnieuw met een kortere vraag.'
      : 'Er ging iets mis bij het genereren van een antwoord. Probeer het opnieuw.'
    console.error('[AI Chat] Stream error:', isTimeout ? 'TIMEOUT' : err)
    return Response.json({ error: message }, { status: isTimeout ? 504 : 500 })
  } finally {
    clearTimeout(timeoutId)
  }
}
