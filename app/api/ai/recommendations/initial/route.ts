import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from '@/lib/ai/dna/recommendations'
import { buildRecommendationContext } from '@/lib/ai/context/recommendation-context'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'

// ── Schema (same as main recommendations endpoint) ─────────

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
    priority_score: z.number(),
    actions: z.array(z.object({
      title: z.string(),
      description: z.string().optional(),
      freedom_days_impact: z.number(),
      euro_impact_monthly: z.number().optional(),
    })),
  })),
})

// ── Module-level state (fire-and-forget pattern) ───────────

interface InitialRecsState {
  recommendations: z.infer<typeof recommendationSchema>['recommendations']
  complete: boolean
  startedAt: number
}

const activeGenerations = new Map<string, InitialRecsState>()
const generationErrors = new Map<string, string>()

const STALE_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes

function cleanupStale() {
  const now = Date.now()
  for (const [key, state] of activeGenerations) {
    if (now - state.startedAt > STALE_TIMEOUT_MS) {
      activeGenerations.delete(key)
    }
  }
  for (const [key] of generationErrors) {
    // Errors are consumed on first read, but clean stale ones just in case
    if (!activeGenerations.has(key)) {
      generationErrors.delete(key)
    }
  }
}

// ── POST: start generation ─────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  cleanupStale()

  // If already running or complete, return current state
  const existing = activeGenerations.get(user.id)
  if (existing) {
    if (existing.complete) {
      return Response.json({ recommendations: existing.recommendations })
    }
    return Response.json({ status: 'generating', recommendations: existing.recommendations })
  }

  // Check for error from previous run
  const prevError = generationErrors.get(user.id)
  if (prevError) {
    generationErrors.delete(user.id)
    return Response.json({ error: prevError }, { status: 500 })
  }

  // Prepare context synchronously
  const [{ data: budgets }, { data: profile }] = await Promise.all([
    supabase.from('budgets').select('slug, is_essential'),
    supabase.from('profiles').select('retirement_expense_method, budgeting_active').eq('id', user.id).single(),
  ])
  const budgetMap = new Map((budgets ?? []).map(b => [b.slug, b.is_essential]))
  const usesEssentialBudgets = (profile?.retirement_expense_method ?? 'essential_budgets') === 'essential_budgets'
  const budgetingActive = profile?.budgeting_active !== false

  let context: string
  try {
    context = await buildRecommendationContext(supabase, budgetingActive)
  } catch (err) {
    return Response.json({ error: 'Context kon niet worden opgebouwd.' }, { status: 500 })
  }

  let model
  try {
    model = await getModel(supabase)
  } catch (err) {
    if (err instanceof AIConfigError) {
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  // Create state object and start fire-and-forget generation
  const state: InitialRecsState = {
    recommendations: [],
    complete: false,
    startedAt: Date.now(),
  }
  activeGenerations.set(user.id, state)

  const generationId = crypto.randomUUID()
  const userId = user.id

  // Fire-and-forget async IIFE
  ;(async () => {
    try {
      const result = await generateObject({
        model,
        schema: recommendationSchema,
        system: RECOMMENDATIONS_SYSTEM_PROMPT,
        prompt: `Analyseer het volgende financiële profiel en genereer 3 optimalisatievoorstellen:\n\n${context}`,
      })

      // Insert into database and push to state
      for (const rec of result.object.recommendations) {
        const slug = rec.related_budget_slug
        const isEssential = slug ? (budgetMap.get(slug) ?? false) : false
        const freedomDaysAllowed = isEssential && usesEssentialBudgets
        const validFreedomDays = freedomDaysAllowed ? rec.freedom_days_per_year : 0
        const validActions = rec.actions.map(a => ({
          ...a,
          freedom_days_impact: freedomDaysAllowed ? a.freedom_days_impact : 0,
        }))

        const { error } = await supabase
          .from('recommendations')
          .insert({
            user_id: userId,
            title: maskPIIInOutput(rec.title),
            description: maskPIIInOutput(rec.description),
            recommendation_type: rec.recommendation_type,
            euro_impact_monthly: rec.euro_impact_monthly,
            euro_impact_yearly: rec.euro_impact_yearly,
            freedom_days_per_year: validFreedomDays,
            current_value: rec.current_value ?? null,
            proposed_value: rec.proposed_value ?? null,
            related_budget_slug: rec.related_budget_slug ?? null,
            priority_score: Math.max(1, Math.min(5, Math.round(rec.priority_score))),
            suggested_actions: validActions,
            ai_generation_id: generationId,
            status: 'pending',
          })

        if (!error) {
          state.recommendations.push(rec)
        }
      }

      state.complete = true
    } catch (err) {
      console.error('[initial-recs] Generation failed:', err)
      generationErrors.set(userId, err instanceof Error ? err.message : 'Generation failed')
      activeGenerations.delete(userId)
    }
  })()

  return Response.json({ status: 'generating', recommendations: [] })
}

// ── GET: poll for results ──────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  cleanupStale()

  const state = activeGenerations.get(user.id)
  if (state) {
    if (state.complete) {
      activeGenerations.delete(user.id)
      return Response.json({ recommendations: state.recommendations })
    }
    return Response.json({ status: 'generating', recommendations: state.recommendations })
  }

  const error = generationErrors.get(user.id)
  if (error) {
    generationErrors.delete(user.id)
    return Response.json({ error }, { status: 500 })
  }

  return Response.json({ recommendations: [] })
}
