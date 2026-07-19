/**
 * GET /api/report/persoonlijk-plan
 *
 * Persoonlijk plan-rapport. Levert de volledige set van persoonlijke
 * voorkeuren + aannames die de FIRE- en horizon-berekeningen aansturen:
 * demografie, inkomen, AOW & pensioen, uitgaven (nu vs. na pensioen),
 * FIRE-rekenparameters, eindstrategie, onttrekkingsstrategie.
 *
 * De input-assemblage zelf leeft in `lib/persoonlijk-plan-assembly.ts`
 * (`buildPersoonlijkPlanSections`) zodat het gecomponeerde totaalplan-rapport
 * (`GET /api/report/totaalplan`) byte-identieke aannames-blokken toont.
 *
 * Single source of truth voor de waarden:
 * - `profiles` voor demografie/inkomen/instellingen
 * - `aow_leeftijd` + `lib/aow-leeftijd.ts` voor AOW-leeftijd lookup
 * - `life_events` voor AOW/pensioen cashflows (`event_type IN ('aow','pension')`)
 * - `budgets` + `lib/budget-utils.ts` voor uitgaven nu / na pensioen
 *
 * Spec: docs/superpowers/specs/2026-05-11-kern-rapport-en-instellingen-rapport-design.md
 */
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import {
  buildPersoonlijkPlanSections,
  type PersoonlijkPlanProfileRow,
  type PersoonlijkPlanLifeEventRow,
  type PersoonlijkPlanBudgetRow,
} from '@/lib/persoonlijk-plan-assembly'
import type { PersoonlijkPlanData } from '@/lib/persoonlijk-plan-data'

// ── Main handler ─────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // ── Parallel loads ──
    const [profileResult, aowResult, lifeEventsResult, budgetsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, date_of_birth, household_type, number_of_children, net_monthly_income, estimated_monthly_expenses, expected_return, inflation_rate, marginaal_tarief, fire_end_strategy, fire_end_age, fire_legacy_amount, retirement_expense_method, retirement_expense_custom_amount, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, feature_preferences',
        )
        .single(),
      supabase.from('aow_leeftijd').select('*'),
      supabase
        .from('life_events')
        .select('id, name, event_type, target_age, target_date, monthly_income_change, is_active, is_indexed, metadata')
        .in('event_type', ['aow', 'pension'])
        .eq('is_active', true)
        .order('target_age', { ascending: true, nullsFirst: false }),
      supabase
        .from('budgets')
        .select('id, parent_id, name, default_limit, interval, budget_type, is_essential')
        .eq('is_archived', false),
    ])

    const profile = (profileResult.data ?? {}) as PersoonlijkPlanProfileRow
    const aowRows = (aowResult.data ?? []) as unknown as AowLeeftijdRow[]
    const events = (lifeEventsResult.data ?? []) as unknown as PersoonlijkPlanLifeEventRow[]
    const budgetRows = (budgetsResult.data ?? []) as unknown as PersoonlijkPlanBudgetRow[]

    const sections = buildPersoonlijkPlanSections({ profile, aowRows, events, budgetRows })

    const payload: PersoonlijkPlanData = {
      generatedAt: new Date().toISOString(),
      ...sections,
    }

    return Response.json(payload)
  } catch (error) {
    console.error('Persoonlijk plan generation error:', error)
    return Response.json(
      { error: 'Persoonlijk plan genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }
}
