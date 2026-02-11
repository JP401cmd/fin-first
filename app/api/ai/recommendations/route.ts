import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel } from '@/lib/ai/config'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from '@/lib/ai/dna/recommendations'
import { buildRecommendationContext } from '@/lib/ai/context/recommendation-context'

const recommendationSchema = z.object({
  recommendations: z.array(z.object({
    title: z.string(),
    description: z.string(),
    recommendation_type: z.enum([
      'budget_optimization',
      'asset_reallocation',
      'debt_acceleration',
      'income_increase',
      'savings_boost',
    ]),
    euro_impact_monthly: z.number(),
    euro_impact_yearly: z.number(),
    freedom_days_per_year: z.number(),
    current_value: z.number().optional(),
    proposed_value: z.number().optional(),
    related_budget_slug: z.string().optional(),
    priority_score: z.number().min(1).max(5),
    actions: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      freedom_days_impact: z.number(),
      euro_impact_monthly: z.number().optional(),
    })),
  })),
})

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const context = await buildRecommendationContext(supabase)
  const model = await getModel(supabase)
  const generationId = crypto.randomUUID()

  let object: z.infer<typeof recommendationSchema>
  try {
    const result = await generateObject({
      model,
      schema: recommendationSchema,
      system: RECOMMENDATIONS_SYSTEM_PROMPT,
      prompt: `Analyseer het volgende financiële profiel en genereer 3 optimalisatievoorstellen:\n\n${context}`,
    })
    object = result.object
  } catch (err) {
    console.error('AI generation failed:', err)
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return Response.json(
      { error: `AI-generatie mislukt: ${message}` },
      { status: 500 },
    )
  }

  // Insert recommendations into database
  const insertedRecommendations = []

  for (const rec of object.recommendations) {
    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: user.id,
        title: rec.title,
        description: rec.description,
        recommendation_type: rec.recommendation_type,
        euro_impact_monthly: rec.euro_impact_monthly,
        euro_impact_yearly: rec.euro_impact_yearly,
        freedom_days_per_year: rec.freedom_days_per_year,
        current_value: rec.current_value ?? null,
        proposed_value: rec.proposed_value ?? null,
        related_budget_slug: rec.related_budget_slug ?? null,
        priority_score: rec.priority_score,
        suggested_actions: rec.actions,
        ai_generation_id: generationId,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to insert recommendation:', error)
      continue
    }

    insertedRecommendations.push(data)
  }

  return Response.json({ recommendations: insertedRecommendations })
}
