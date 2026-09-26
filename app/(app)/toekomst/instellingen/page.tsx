import type { Metadata } from 'next'
import { readPlanReviewState } from '@/lib/plan-review/read-state'
import { buildPlanReviewFacts, derivePlanReviewProgress } from '@/lib/plan-review/progress'
import { loadEigenStrategieEvents } from '@/lib/plan-review/eigen-strategie-events'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonRaw } from '@/lib/horizon-data-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { PlanReviewProvider } from '@/components/future/plan-review/plan-review-provider'
import { InstellingenKatern } from '@/components/toekomst/instellingen/instellingen-katern'
import type { KernelSimData } from '@/components/future/gebeurtenissen-view'
import { resolveWithdrawalProfiel } from '@/lib/withdrawal-strategy'
import { buildPotBalances } from '@/lib/future/pot-balances'
import { buildStrategieEditorsData } from '@/lib/horizon/strategie-editors-data'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import { buildConvergentieAdapterProfile } from '@/lib/horizon-kernel/convergentie-router'
import { resolveDeficitLoanRate } from '@/lib/horizon-kernel/adapter/params'

export const metadata: Metadata = {
  title: 'Instellingen — TriFinity',
  description:
    'Wat je toekomstplan voedt: eindstrategie, onttrekking, pot-regels, je AOW-, pensioen-, huis- en werkstrategie, markt-aannames en de levensgebeurtenissen op je tijdas.',
}

/**
 * /toekomst/instellingen — katern 3 (ADR 0179 D1/D4).
 *
 * Voegt de oude subroutes /toekomst/voorkeuren en /toekomst/gebeurtenissen samen; die
 * redirecten via `next.config.ts` hierheen (query mee, gebeurtenissen met `#gebeurtenissen`).
 * Fase 1: tijdelijk een losse route met de bestaande `ToekomstSubpageShell`; stroom A
 * verplaatst hem later in de route-groep `(katern)/`.
 *
 * De server-opbouw is de vereniging van beide oude pagina's, zonder dubbele lezing:
 * één `loadHorizonRaw`, één `buildStrategieEditorsData` (voedt beide views).
 */
export default async function ToekomstInstellingenPage() {
  const supabase = await createClient()
  const user = await getCachedUser(supabase)
  const [horizonData, dashboardResult, planReviewState, eigenStrategieEvents] = await Promise.all([
    loadHorizonRaw(supabase),
    loadDashboardData(supabase),
    // TPR-01 — alleen om te weten of de review iets kan bewaren (kolom uitgerold).
    user ? readPlanReviewState(supabase, user.id) : Promise.resolve(null),
    // TPR-15 — de EIGEN AOW/werk/pensioen-rijen voor de review-voortgang. De
    // life_events-policy is huishoud-gedeeld; een gedeeld partner-event mag de
    // AOW-stap niet dichtzetten. Faalt de lezing: fail-closed (geen rijen).
    user
      ? loadEigenStrategieEvents(supabase, user.id).catch((err: unknown) => {
          console.error('[toekomst:instellingen:plan-review:eigen-events]', err)
          return []
        })
      : Promise.resolve([]),
  ])

  // Review-voortgang: AFGELEID met dezelfde helpers als /toekomst — geen tweede telling.
  const planReviewProgress =
    user && planReviewState
      ? derivePlanReviewProgress(
          planReviewState,
          buildPlanReviewFacts({
            events: eigenStrategieEvents,
            assets: horizonData.assets,
            housingStrategyRaw: horizonData.rawProfile?.housing_strategy_config,
            ownerId: user.id,
          }),
        )
      : null

  // Levensstrategie-editors (AOW/Pensioen/Huis/Werk) — één opbouw voor beide views.
  const { strategieData, aowAgeFractional } = buildStrategieEditorsData(horizonData)
  const strategieBaseline = strategieData.baseline

  // ── Voorkeuren ────────────────────────────────────────────────────────
  const simRows = dashboardResult.dashboardData.simRows ?? null
  const fireAge =
    dashboardResult.dashboardData.fireAgeFractional != null
      ? Math.round(dashboardResult.dashboardData.fireAgeFractional)
      : null
  const potBalances = buildPotBalances(horizonData.assets, horizonData.unlinkedCash)
  // TPR-12 — heffingvrij inkomen (Box 3, werkelijk-tak); NULL = kernel-default.
  const rawHeffingvrij = horizonData.rawProfile?.box3_heffingvrij_inkomen
  const box3HeffingvrijInkomen =
    rawHeffingvrij == null || !Number.isFinite(Number(rawHeffingvrij)) ? null : Number(rawHeffingvrij)

  // ── Gebeurtenissen ────────────────────────────────────────────────────
  const ei = horizonData.effectiveInput
  // Baseline FIRE-projectie voor de EventPane impact-preview — zelfde strategy-aware
  // aanroep als de tijdas, zodat de "vs. baseline"-delta klopt met de eindstrategie.
  const baselineFire = computeScalarFireProjection({
    input: ei,
    annualReturn: horizonData.fireParams.grossReturn,
    swrOverride: horizonData.fireParams.effectiveSwr,
    inflationOverride: undefined,
    strategyOptions: {
      strategy: horizonData.fireStrategy.strategy,
      endAge: horizonData.fireStrategy.endAge,
      legacyAmount: horizonData.fireStrategy.legacyAmount,
    },
  }).result

  // `previewBaseline` = dezelfde rauwe kernel-context als de tijdas en de strategie-editors.
  const eventPaneData = {
    baselineInput: ei,
    baselineFire,
    fireParams: horizonData.fireParams,
    fireStrategy: horizonData.fireStrategy,
    withdrawalStrategy: horizonData.withdrawalStrategy,
    endAge: horizonData.fireStrategy.endAge ?? 90,
    householdMode: horizonData.hasPartner ?? false,
    previewBaseline: strategieBaseline,
  }

  // Feature #876 — hook-inputs voor de kernel-afgeleide strategiemomenten.
  // `deficitLoanRate` is de canonieke tekort-lening-rente (V7-resolver).
  const kernelSim: KernelSimData | null =
    strategieBaseline && horizonData.rawProfile
      ? {
          aowAgeFractional,
          box3Method: horizonData.box3Method,
          bankAccountCash: horizonData.unlinkedCash,
          baseAnnualSavingsFromCashflow: horizonData.baseAnnualSavingsFromCashflow,
          housingStrategy: horizonData.housingStrategy,
          deficitLoanRate: resolveDeficitLoanRate(
            buildConvergentieAdapterProfile(horizonData.rawProfile),
          ),
        }
      : null

  return (
    <PlanReviewProvider initialProgress={planReviewProgress}>
      <NavStackMeta title="Instellingen" />
      {/* Titel = de kale paginanaam, bewust zonder kerncijfer: de review-voortgang
          staat op de wizard-ingang eronder en het aantal gebeurtenissen in de
          sectiekop van de view (die telt ook het kernel-verkoopmoment mee, dat
          alleen client-side bestaat). Eén getal, één plek. */}
      <ToekomstSubpageShell
        route="/toekomst/instellingen"
        fallbackName="Instellingen"
        verdict={null}
        deck="Alles wat je plan voedt: je keuzes, je levensstrategieën en de gebeurtenissen op je tijdas."
      />
      <InstellingenKatern
        planReviewProgress={planReviewProgress}
        voorkeuren={{
          fireParams: horizonData.fireParams,
          fireStrategy: horizonData.fireStrategy,
          firePlan: horizonData.firePlan,
          withdrawalStrategy: horizonData.withdrawalStrategy,
          // Zelfde rauwe rij + zelfde voorrangsregel als de kernel-adapter (B-042).
          withdrawalProfiel: resolveWithdrawalProfiel({
            withdrawal_strategy: horizonData.withdrawalStrategy.strategy,
            withdrawal_profile_config: horizonData.rawProfile?.withdrawal_profile_config,
          }),
          fireAge,
          simRows,
          simSnapshot: dashboardResult.regelSimSnapshot,
          regelVoorkeuren: dashboardResult.regelVoorkeuren,
          potBalances,
          box3HeffingvrijInkomen,
          events: horizonData.events,
          strategieData,
        }}
        gebeurtenissen={{
          events: horizonData.events,
          currentAge: strategieData.currentAge,
          annualSavings: Math.max(0, (horizonData.avgIncome6m - horizonData.avgExpenses6m) * 12),
          strategieData,
          eventPaneData,
          kernelSim,
        }}
      />
    </PlanReviewProvider>
  )
}
