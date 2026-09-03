/**
 * GET /api/report/totaalplan
 *
 * Het gecomponeerde "plan-als-document": de aannames-blokken van het
 * persoonlijk-plan-rapport (byte-identiek hergebruikt) + een vermogensprojectie,
 * een plan-brede slagingskans en deterministische inzichten. Deelbaar via
 * `window.print()` → PDF.
 *
 * ## Twee laad-sporen, één perspectief (personal)
 *  (a) Aannames-zijde — dezelfde queries als `GET /api/report/persoonlijk-plan`
 *      (profiles, aow_leeftijd, life_events aow/pension, budgets) → identieke blokken.
 *  (b) Projectie-zijde — spiegelt `computeHorizonFireTarget` (lib/fire-target-shared.ts):
 *      `loadHorizonData` + aow-rijen + `buildHorizonInput` → de rauwe kernel-context.
 *      Daardoor is de projectie IDENTIEK aan wat /toekomst en /overzicht tonen
 *      (CONSUME DON'T RECOMPUTE).
 *
 * De inzichten komen uit de generieke aandachtspunten-bus (`collectAandachtspunten`,
 * perspectief 'personal' — geen huishouden/partner-PII). Geen AI in de MVP.
 *
 * Roadmap-item K. Fase 2 (publieke deelbare token-link) is bewust UITGESTELD naar
 * een vervolgkaart — deze route is pure read + client-side PDF.
 */
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { NL_AOW_AGE } from '@/lib/constants'
import { loadHorizonRaw } from '@/lib/horizon-data-loader'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { ConvergentieRawContext, ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'
import {
  assembleTotaalplan,
  type TotaalplanData,
} from '@/lib/totaalplan-data'
import type {
  PersoonlijkPlanProfileRow,
  PersoonlijkPlanLifeEventRow,
  PersoonlijkPlanBudgetRow,
} from '@/lib/persoonlijk-plan-assembly'

export async function GET() {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    // ── (a) Aannames-zijde — identiek aan /api/report/persoonlijk-plan ──
    // ── (b) Projectie-zijde — loadHorizonData (React-cached) + aandachtspunten ──
    const [
      profileResult,
      aowResult,
      lifeEventsResult,
      budgetsResult,
      horizonData,
      aandachtspunten,
    ] = await Promise.all([
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
      loadHorizonRaw(supabase),
      collectAandachtspunten(supabase),
    ])

    const profile = (profileResult.data ?? {}) as PersoonlijkPlanProfileRow
    const aowRows = (aowResult.data ?? []) as unknown as AowLeeftijdRow[]
    const events = (lifeEventsResult.data ?? []) as unknown as PersoonlijkPlanLifeEventRow[]
    const budgetRows = (budgetsResult.data ?? []) as unknown as PersoonlijkPlanBudgetRow[]

    // ── Kernel-context (parity met /toekomst via buildHorizonInput) ──
    const dob = horizonData.effectiveInput.dateOfBirth
    const aowAgeFractional = dob
      ? lookupAowAge(aowRows, dob).fractional
      : NL_AOW_AGE

    const built = buildHorizonInput({
      horizonInput: horizonData.effectiveInput,
      lifeEvents: horizonData.events ?? [],
      fireStrategy: horizonData.fireStrategy,
      withdrawalStrategy: horizonData.withdrawalStrategy,
      grossReturn: horizonData.fireParams.grossReturn,
      inflation: horizonData.fireParams.inflationRate,
      aowAgeFractional,
      assets: horizonData.assets,
      debts: horizonData.debts,
      box3Method: horizonData.box3Method,
      hasPartner: horizonData.hasPartner,
      bankAccountCash: horizonData.unlinkedCash,
      monthlySavingsOverride: horizonData.monthlySavingsOverride,
      baseAnnualSavingsFromCashflow: horizonData.baseAnnualSavingsFromCashflow,
      housingStrategy: horizonData.housingStrategy,
    })

    const yearlyExpensesFallback =
      Math.max(0, Math.round((horizonData.effectiveInput.monthlyExpenses ?? 0) * 12))
    const kernelContext: ConvergentieRawContext = {
      // Zonder rauwe profiel-rij / geboortedatum faalt de kernel bewust → projectie ok:false.
      profile: horizonData.rawProfile ?? ({} as ConvergentieRawProfileRow),
      assets: horizonData.assets,
      debts: horizonData.debts,
      lifeEvents: horizonData.events ?? [],
      aowRows,
      yearlyExpenses: built ? built.input.yearlyExpenses : yearlyExpensesFallback,
      // ADR 0117 — de beheerde jaarlaag `fire_assumptions.volatility`, server-side
      // geresolveerd in DEZELFDE `loadHorizonRaw`-bundel die /toekomst voedt (het
      // importpad `@/lib/horizon-data-loader` is een doorgeef-luik naar
      // `lib/horizon/raw-data-loader.ts`). Zonder dit veld rekende de slagingskans
      // van het rapport op de default-σ terwijl de marktcheck op /toekomst de
      // jaarlaag al droeg: zelfde input, andere bandbreedte.
      marktVolatiliteit: horizonData.marktVolatiliteit,
    }

    // ── Vrijheidstijd-framing: canonieke daguitgaven ──
    // CONSUMEER het 12-mnd rolling dagtarief uit de bundel (lib/expense-rate.ts),
    // dezelfde bron als de widgets en de balans/budget/vermogen-rapporten. Was
    // `dailyExpenseRate(effectiveInput.monthlyExpenses) : 100` — de EFFECTIVE
    // grondslag plus een verzonnen €100/dag-terugval, waardoor het totaalplan
    // andere jaren vrijheid rapporteerde dan het scherm waaruit het komt
    // (vervolg KRUIS-20). 0 = geen eerlijke dagbasis; de assembler laat de
    // tijdregel dan weg i.p.v. een bedacht getal te tonen.
    const dayRate = horizonData.dailyExpenseRate

    // ── Assembleer (pure) ──
    const payload: TotaalplanData = assembleTotaalplan({
      generatedAt: new Date().toISOString(),
      dailyExpenseRate: dayRate,
      persoonlijkPlan: { profile, aowRows, events, budgetRows },
      kernelContext,
      aandachtspunten,
    })

    return Response.json(payload)
  } catch (error) {
    console.error('Totaalplan generation error:', error)
    return Response.json(
      { error: 'Totaalplan genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 },
    )
  }
}
