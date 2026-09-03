import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { deleteAllUserData } from '@/lib/seed-persona'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * POST /api/onboarding/reset — wist ALLE eigen financiële data (±47 tabellen
 * via deleteAllUserData) en zet het profiel terug naar de onboarding-startstaat.
 * Onomkeerbaar; logt niet uit.
 *
 * Bevestiging op API-niveau is verplicht: de body moet `{ confirm: true }`
 * dragen. Aanleiding is het dataverlies op het jochen-testaccount van 31 aug
 * 2026 — één kale POST onder een levende sessie (test-/reviewverkeer vanaf de
 * eigenaarsmachine) wiste het account zonder dat de API iets terugvroeg. De
 * UI-dialogen bevestigen al; dit veld maakt een misplaatste fetch, replay of
 * geautomatiseerde test zonder expliciete intentie onschadelijk (400 i.p.v.
 * totaalverlies). Vergelijk `/api/account/delete` mode=delete, dat een getypte
 * e-mailbevestiging eist.
 */
const ResetBodySchema = z.object({
  confirm: z.literal(true),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // Ná de auth-check (401 wint van 400), vóór elke destructieve stap.
  const parsed = await parseBody(ResetBodySchema, request)
  if (!parsed.ok) return parsed.response

  // Service-role client voor de RLS-afgeschermde persoonlijke tabellen
  // (net_worth_history/feedback) die de sessie-client bij een reset niet kan
  // wissen. Best-effort: zonder service-key worden die overgeslagen (dev).
  const hasServiceKey =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const service = hasServiceKey ? getServiceClient() : undefined

  try {
    // Delete all user financial data (also wipes news_editions + per-user app_settings rows).
    // Reset (geen fullErase): retentie-/log-tabellen blijven staan; persoonlijke
    // service-only tabellen (net_worth_history/feedback) worden wél gewist.
    await deleteAllUserData(supabase, user.id, undefined, { service })

    // Reset profile — core fields first (always exist)
    // last_known_phase is set to null so phase is recomputed on next load
    // feature_preferences cleared for clean restart
    const { error: coreErr } = await supabase
      .from('profiles')
      .update({
        onboarding_completed: false,
        is_demo_user: false,
        full_name: null,
        date_of_birth: null,
        household_type: 'solo',
        temporal_balance: 3,
        net_monthly_income: null,
        number_of_children: 0,
        children_ages: [],
        last_known_phase: null,
        active_modules: null,
        feature_preferences: {},
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)
    if (coreErr) throw new Error(`Profiel reset mislukt: ${coreErr.message}`)

    // Reset FIRE + optional fields (may not exist if migrations not applied)
    await supabase
      .from('profiles')
      .update({
        estimated_monthly_expenses: null,
        expected_return: null,
        inflation_rate: null,
        fire_end_strategy: null,
        fire_end_age: null,
        fire_legacy_amount: null,
        retirement_expense_method: null,
        retirement_expense_custom_amount: null,
        widget_prefs: null,
      })
      .eq('id', user.id)
      // Ignore errors — columns may not exist yet

    // Reset stappenplan- en onboarding-metadata. Deze leven in optionele
    // kolommen die mogelijk ontbreken op pre-migration databases, dus we
    // proberen ze één voor één en strippen op schema-cache-miss. Reden:
    // zonder deze reset blijven de module-/goal-guide-cards in de briefing
    // de oude afgevinkte/weggeklikte staat tonen na een data-wipe.
    const STAPPENPLAN_RESET_FIELDS: Record<string, unknown> = {
      module_guide_state: {},
      primary_goal_slug: null,
      selected_goal_slugs: null,
      onboarding_intent: null,
      completed_onboarding_steps: null,
      news_description: null,
      financial_context: null,
    }
    const stappenplanPayload: Record<string, unknown> = { ...STAPPENPLAN_RESET_FIELDS }
    for (let attempt = 0; attempt < Object.keys(STAPPENPLAN_RESET_FIELDS).length + 1; attempt++) {
      const { error } = await supabase
        .from('profiles')
        .update(stappenplanPayload)
        .eq('id', user.id)
      if (!error) break
      const missing = Object.keys(STAPPENPLAN_RESET_FIELDS).find(
        (col) => error.message?.includes(`'${col}'`) || error.message?.includes(`"${col}"`),
      )
      if (!missing || !(missing in stappenplanPayload)) break
      delete stappenplanPayload[missing]
    }

    return Response.json({ success: true })
  } catch (err) {
    return serverError(err, 'onboarding-reset:POST')
  }
}
