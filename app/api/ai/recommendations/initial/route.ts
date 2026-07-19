import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from '@/lib/ai/dna/recommendations'
import { buildRecommendationContext } from '@/lib/ai/context/recommendation-context'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { checkTierGate } from '@/lib/require-tier'
import { unauthorized, serverError } from '@/lib/api/respond'

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

// ── POST: generate recommendations synchronously ──────────
// Previous fire-and-forget pattern used module-level Maps which
// don't survive across serverless instances on Vercel, causing
// GET polls to miss in-progress results and show an error.
// Now POST waits for AI completion and returns results directly.

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return Response.json({ error: tierGate.error }, { status: 403 })
  }

  const [{ data: budgets }, { data: profile }] = await Promise.all([
    supabase.from('budgets').select('slug, is_essential'),
    supabase.from('profiles').select('retirement_expense_method, budgeting_active, full_name, date_of_birth').eq('id', user.id).single(),
  ])
  const budgetMap = new Map((budgets ?? []).map(b => [b.slug, b.is_essential]))
  const usesEssentialBudgets = (profile?.retirement_expense_method ?? 'essential_budgets') === 'essential_budgets'
  const budgetingActive = profile?.budgeting_active !== false

  let context: string
  try {
    const rawContext = await buildRecommendationContext(supabase, budgetingActive)
    // Sanitize PII before the context reaches the AI provider (chat/categorize
    // contract). A sanitize failure blocks the call (fail-safe): raw context
    // must never leave unfiltered. Merchant/asset names stay by design.
    const sanitizeOpts: SanitizeOptions = {}
    const names = [profile?.full_name].filter(Boolean) as string[]
    if (names.length > 0) sanitizeOpts.names = names
    if (profile?.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth
    context = sanitizeForAI(rawContext, sanitizeOpts)
  } catch {
    return Response.json({ error: 'Context kon niet worden opgebouwd.' }, { status: 500 })
  }

  let model
  try {
    model = await getModel(supabase, 'aanbevelingen_initieel')
  } catch (err) {
    if (err instanceof AIConfigError) {
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }

  const generationId = crypto.randomUUID()
  const userId = user.id

  try {
    const result = await generateObject({
      model,
      schema: recommendationSchema,
      system: RECOMMENDATIONS_SYSTEM_PROMPT,
      prompt: `Analyseer het volgende financiële profiel en genereer 3 optimalisatietips:\n\n${context}`,
    })

    const recommendations: Record<string, unknown>[] = []

    for (const rec of result.object.recommendations) {
      const slug = rec.related_budget_slug
      const isEssential = slug ? (budgetMap.get(slug) ?? false) : false
      const freedomDaysAllowed = isEssential && usesEssentialBudgets
      const validFreedomDays = freedomDaysAllowed ? rec.freedom_days_per_year : 0
      const validActions = rec.actions.map(a => ({
        ...a,
        freedom_days_impact: freedomDaysAllowed ? a.freedom_days_impact : 0,
      }))

      const { data: inserted, error } = await supabase
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
        .select()
        .single()

      if (!error && inserted) {
        recommendations.push(inserted)
      }
    }

    return Response.json({ recommendations })
  } catch (err) {
    return serverError(err, 'ai-recommendations-initial:POST')
  }
}

// ── GET: poll fallback (checks database) ──────────────────

const RECENT_WINDOW_MS = 2 * 60 * 1000

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  const tierGateGet = await checkTierGate(supabase, claims.sub, 'ai')
  if (tierGateGet) {
    return Response.json({ error: tierGateGet.error }, { status: 403 })
  }

  // Check database for recently generated recommendations
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MS).toISOString()
  const { data: recentRecs } = await supabase
    .from('recommendations')
    .select('*')
    .eq('user_id', claims.sub)
    .eq('status', 'pending')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })

  if (recentRecs && recentRecs.length > 0) {
    return Response.json({ recommendations: recentRecs })
  }

  return Response.json({ recommendations: [] })
}
