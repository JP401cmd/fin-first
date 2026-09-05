import { generateObject } from 'ai'
import { z } from 'zod'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { getModel, AIConfigError } from '@/lib/ai/config'
import { RECOMMENDATIONS_SYSTEM_PROMPT } from '@/lib/ai/dna/recommendations'
import { buildRecommendationContext } from '@/lib/ai/context/recommendation-context'
import { maskPIIInOutput } from '@/lib/ai/pii-output-filter'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'
import { checkTierGate } from '@/lib/require-tier'
import { checkCreditBudget, creditLimitMessage } from '@/lib/ai/credit-gate'
import { recordAiUsage } from '@/lib/ai-credits'
import { assertCloudAllowed } from '@/lib/ai/privacy-gate'
import { unauthorized, serverError, errorResponse } from '@/lib/api/respond'
import { isRefusedProviderError } from '@/lib/ai/provider-error'
import { AI_ERROR_CODE, describeAiError } from '@/lib/ai/error-copy'

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
//
// ⚠️ GEEN AANROEPER MEER (geconstateerd 3 augustus 2026). De onboarding zegt op
// app/(onboarding)/onboarding/page.tsx ~r1054 expliciet "geen AI pre-generatie
// meer hier", en een zoektocht door app/, components/ en lib/ levert buiten dat
// commentaar, docs/architecture en de gate-scan geen enkele fetch op. De route
// is dus dood maar wél live en aanroepbaar.
//
// Bewust niet verwijderd in deze wijziging (dat is een productbesluit, geen
// gevolg van de lokale-AI-uitrol), maar de twee gaten die dat opleverde zijn wél
// gedicht: de privé-gate hierboven, en de credit-gate hieronder die de
// hoofdroute /api/ai/recommendations wél had en deze niet. Een ongebruikte,
// ongemeterde generatie-endpoint is een kostenoppervlak dat je niet wilt laten
// staan "omdat niemand hem toch aanroept".
//
// Voor de eerste tips ná onboarding is een deterministische set uit dezelfde
// kandidatenmotor beter dan welk model dan ook: op dat moment is het lokale
// model per definitie nog niet gedownload en is de context nog dun.

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // PRIVÉ-MODUS EERST — vóór de tier-gate, de credit-gate en élke dataophaling.
  // Staat 'tips' op lokaal, dan maakt de browser de eerste tips zelf en hoort
  // deze route niets te leveren.
  // Waarom deze volgorde: (1) privé-modus is de meest fundamentele keuze van de
  // gebruiker en gaat vóór commerciële gating — de eerlijke reden is "privé-modus
  // staat aan", niet "je mist een abonnement"; (2) een geblokkeerde call mag geen
  // credits kosten; (3) het volledige financiële profiel (buildRecommendationContext)
  // mag de promptopbouw niet eens bereiken.
  // Nooit een stille terugval naar de cloud: 403 is het eindpunt.
  const privacyGate = await assertCloudAllowed(supabase, user.id, 'tips')
  if (privacyGate) return privacyGate

  const tierGate = await checkTierGate(supabase, user.id, 'ai')
  if (tierGate) {
    return Response.json({ error: tierGate.error }, { status: 403 })
  }

  // Maand-creditbudget (gedeelde bucket) vóór de dure LLM-call. Ontbrak hier,
  // terwijl de hoofdroute /api/ai/recommendations 'm wél heeft — zie de
  // toelichting boven deze handler. Zelfde feature-key, zodat beide paden uit
  // dezelfde bucket putten en de meting klopt.
  const creditGate = await checkCreditBudget(supabase, user.id, 'recommendations')
  if (!creditGate.allowed) {
    return Response.json(
      { error: creditLimitMessage(creditGate) },
      { status: 429, headers: { 'Retry-After': String(creditGate.retryAfterSeconds) } },
    )
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

    // Verbruik registreren op dezelfde bucket als de hoofdroute, zodat het
    // maandbudget klopt en /beheer/ai-verbruik geen blinde vlek houdt.
    await recordAiUsage(supabase, user.id, 'recommendations')

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
    // Structureel (provider weigert) vs. tijdelijk — gedrag bij een tijdelijke
    // hapering blijft ongewijzigd (UR3-09).
    if (isRefusedProviderError(err)) {
      const copy = describeAiError(AI_ERROR_CODE.providerRefused)
      return errorResponse(copy.text, 422, copy.code)
    }
    return serverError(err, 'ai-recommendations-initial:POST')
  }
}

// ── GET: poll fallback (checks database) ──────────────────
//
// Bewust GEEN privé-gate: deze handler leest uitsluitend eerder opgeslagen
// aanbevelingen uit de eigen tabel en kan nooit tot een modelcall leiden. Een
// 403 zou hier de gebruiker afsnijden van zijn eigen, al bestaande gegevens
// zonder dat er iets naar een AI-leverancier gaat. De blokkade hoort op POST —
// het pad dat daadwerkelijk genereert.

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
