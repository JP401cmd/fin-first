import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { recordAiUsage } from '@/lib/ai-credits'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from '@/lib/ai/dna/recommendations'
import { buildRecommendationContext } from '@/lib/ai/context/recommendation-context'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { checkTierGate } from '@/lib/require-tier'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { unauthorized, serverError, errorResponse } from '@/lib/api/respond'
import { isRefusedProviderError } from '@/lib/ai/provider-error'
import { AI_ERROR_CODE, describeAiError } from '@/lib/ai/error-copy'

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

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'tips' op lokaal, dan maakt de browser de optimalisatietips zelf en
  // hoort deze route niets te leveren.
  // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
  // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
  // credits uit het maandbudget vreten; (3) het volledige financiële profiel
  // (buildRecommendationContext) mag de promptopbouw niet eens bereiken.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'tips')
  if (privacyGate) return privacyGate

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return new Response(JSON.stringify({ error: tierGate.error }), { status: 403, headers: { 'Content-Type': 'application/json' } })
  }

  // Per-gebruiker rate-limit: dwing het maand-creditbudget af (gedeelde bucket)
  // vóór de dure LLM-call.
  const creditGate = await checkCreditBudget(supabase, user.id, 'recommendations')
  if (!creditGate.allowed) {
    return new Response(JSON.stringify({ error: creditLimitMessage(creditGate) }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(creditGate.retryAfterSeconds) },
    })
  }

  // Fetch budgets + profile for freedom_days validation and budgeting_active check
  const [{ data: budgets }, { data: profile }] = await Promise.all([
    supabase.from('budgets').select('slug, is_essential'),
    supabase.from('profiles').select('retirement_expense_method, budgeting_active, full_name, date_of_birth').eq('id', user.id).single(),
  ])
  const budgetMap = new Map((budgets ?? []).map(b => [b.slug, b.is_essential]))
  const usesEssentialBudgets = (profile?.retirement_expense_method ?? 'essential_budgets') === 'essential_budgets'
  const budgetingActive = profile?.budgeting_active !== false

  const rawContext = await buildRecommendationContext(supabase, budgetingActive)

  // Sanitize PII before the context reaches the AI provider (same contract as
  // chat/categorize). FAIL-SAFE: a sanitize failure blocks the call — raw
  // asset/debt/budget context must never leave unfiltered. Merchant/asset
  // names stay (needed for the tip; business identifiers, not person-PII).
  let context: string
  try {
    const sanitizeOpts: SanitizeOptions = {}
    const names = [profile?.full_name].filter(Boolean) as string[]
    if (names.length > 0) sanitizeOpts.names = names
    if (profile?.date_of_birth) sanitizeOpts.dateOfBirth = profile.date_of_birth
    context = sanitizeForAI(rawContext, sanitizeOpts)
  } catch (err) {
    console.error('[recommendations] Sanitization failed — AI call blocked (fail-safe):', err)
    return Response.json(
      { error: 'De AI-assistent is tijdelijk niet beschikbaar vanwege een beveiligingscontrole. Probeer het later opnieuw.' },
      { status: 503 },
    )
  }

  let model
  try {
    model = await getModel(supabase, 'aanbevelingen')
  } catch (err) {
    if (err instanceof AIConfigError) {
      // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
      return Response.json({ error: err.message }, { status: 422 })
    }
    return Response.json({ error: 'AI model kon niet worden geladen.' }, { status: 500 })
  }
  const generationId = crypto.randomUUID()

  let object: z.infer<typeof recommendationSchema>
  try {
    const result = await generateObject({
      model,
      schema: recommendationSchema,
      system: RECOMMENDATIONS_SYSTEM_PROMPT,
      prompt: `Analyseer het volgende financiële profiel en genereer 3 optimalisatietips:\n\n${context}`,
    })
    object = result.object
    await recordAiUsage(supabase, user.id, 'recommendations')
  } catch (err) {
    // Structureel (provider weigert) vs. tijdelijk — gedrag bij een tijdelijke
    // hapering blijft ongewijzigd (UR3-09).
    if (isRefusedProviderError(err)) {
      const copy = describeAiError(AI_ERROR_CODE.providerRefused)
      return errorResponse(copy.text, 422, copy.code)
    }
    return serverError(err, 'ai-recommendations:POST')
  }

  // Insert recommendations into database
  const insertedRecommendations = []

  for (const rec of object.recommendations) {
    // Enforce freedom_days_per_year rules: only valid for essential budgets + essential_budgets method
    const slug = rec.related_budget_slug
    const isEssential = slug ? (budgetMap.get(slug) ?? false) : false
    const freedomDaysAllowed = isEssential && usesEssentialBudgets
    const validFreedomDays = freedomDaysAllowed ? rec.freedom_days_per_year : 0
    const validActions = rec.actions.map(a => ({
      ...a,
      freedom_days_impact: freedomDaysAllowed ? a.freedom_days_impact : 0,
    }))

    const { data, error } = await supabase
      .from('recommendations')
      .insert({
        user_id: user.id,
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

    if (error) {
      console.error('Failed to insert recommendation:', error)
      continue
    }

    insertedRecommendations.push(data)
  }

  return Response.json({ recommendations: insertedRecommendations })
}
