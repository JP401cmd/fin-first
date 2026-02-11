import { streamText, convertToModelMessages, createUIMessageStreamResponse, stepCountIs, type UIMessage } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getModel } from '@/lib/ai/config'
import { buildSystemPrompt, type AIDomain } from '@/lib/ai/dna'
import { buildContext } from '@/lib/ai/context/builder'
import { getTools } from '@/lib/ai/tools'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { messages, domain = 'kern' } = await req.json() as {
    messages: UIMessage[]
    domain?: AIDomain
  }

  const validDomains: AIDomain[] = ['kern', 'wil', 'horizon']
  const safeDomain = validDomains.includes(domain) ? domain : 'kern'

  const systemPrompt = await buildSystemPrompt(safeDomain, supabase)
  const context = await buildContext(supabase)
  const tools = getTools(safeDomain)

  const modelMessages = await convertToModelMessages(messages)

  const result = streamText({
    model: await getModel(supabase),
    system: systemPrompt + '\n\n' + context,
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
  })

  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream(),
  })
}
