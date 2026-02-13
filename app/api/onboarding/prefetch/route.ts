import { generateObject } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import {
  aiStep1Schema,
  buildStep1Prompt,
} from '@/lib/ai/schemas/onboarding-schema'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  // Check not already completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completed) {
    return Response.json({ success: false, error: 'Onboarding already completed' }, { status: 403 })
  }

  const body = await req.json()
  const description = (body.description ?? '').trim()

  if (description.length < 20) {
    return Response.json({ success: false, error: 'Profielbeschrijving te kort.' }, { status: 400 })
  }

  let model
  try {
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ success: false, error: `AI niet geconfigureerd: ${err.message}` }, { status: 500 })
    }
    return Response.json({ success: false, error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  try {
    const result = await generateObject({
      model,
      schema: aiStep1Schema,
      system: buildStep1Prompt(description),
      prompt: 'Genereer profiel, budget-bedragen en bankrekeningen op basis van de beschrijving.',
    })

    return Response.json({
      success: true,
      data: result.object,
      tokenUsage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      },
    })
  } catch (err) {
    console.error('Prefetch step 1 failed:', err)
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json({ success: false, error: `AI-generatie mislukt: ${message}` }, { status: 500 })
  }
}
