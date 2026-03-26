import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

const SuggestedEventSchema = z.object({
  event_type: z.string(),
  name: z.string(),
  target_age: z.number().nullable(),
  one_time_cost: z.number(),
  monthly_cost_change: z.number(),
  monthly_income_change: z.number(),
  duration_months: z.number(),
  explanation: z.string(),
})

const SuggestionsResponseSchema = z.object({
  suggestions: z.array(SuggestedEventSchema).min(1).max(3),
})

export type SuggestedEvent = z.infer<typeof SuggestedEventSchema>

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body?.prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
  }

  try {
    const result = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema: SuggestionsResponseSchema,
      prompt: body.prompt,
      system: [
        'Je bent een financieel assistent voor een Nederlandse personal finance app.',
        'Je suggereert levensgebeurtenissen die passen bij scenario-wijzigingen.',
        'Geef realistische bedragen in euro. Wees bondig in je uitleg (max 1 zin).',
        'Suggereer geen events die al actief zijn.',
      ].join(' '),
    })

    return NextResponse.json({ suggestions: result.object.suggestions })
  } catch (err) {
    console.error('AI suggestion error:', err)
    return NextResponse.json({ suggestions: [] })
  }
}
