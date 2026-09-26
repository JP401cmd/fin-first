import type { Metadata } from 'next'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import {
  getToekomstClient,
  loadToekomstHorizonData,
  loadToekomstPlanReviewProgress,
} from '@/lib/toekomst/load-toekomst-data'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
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
 * /toekomst/instellingen — katern Instellingen (ADR 0179 D1/D4, fase 1 stap 17).
 *
 * Voegt de oude subroutes /toekomst/voorkeuren en /toekomst/gebeurtenissen samen; die
 * redirecten via `next.config.ts` hierheen (query mee, gebeurtenissen met `#gebeurtenissen`).
 * Staat in de `(katern)`-groep: de kop, de `PlanReviewProvider`, het canvas en de
 * katern-koppen komen uit de layout — hier dus geen eigen kop en geen tweede provider.
 *
 * De horizon-bundel en de review-voortgang komen uit de per request gecachte deel-ladingen
 * die de layout ook leest (`HorizonPageData` is een superset van de rauwe bundel die de
 * views lezen). Bewust niet `loadToekomstData()`: bij client-navigatie rendert de layout
 * niet opnieuw, en dan zou deze page ook Fin-data, plan-oordeel en minimaliseer-pref laden. Eén `buildStrategieEditorsData` voedt
 * beide views.
 */
export default async function ToekomstInstellingenPage() {
  const supabase = await getToekomstClient()
  const [horizonData, planReviewProgress, dashboardResult] = await Promise.all([
    loadToekomstHorizonData(),
    loadToekomstPlanReviewProgress(),
    loadDashboardData(supabase),
  ])

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
    <>
      {/* Geen eigen kop: de layout draagt de plan-kop. De review-voortgang staat op de
          wizard-ingang en het aantal gebeurtenissen in de sectiekop van de view (die
          telt ook het kernel-verkoopmoment mee, dat alleen client-side bestaat). */}
      <NavStackMeta title="Instellingen" />
      {/* De views dragen hun eigen `max-w-6xl px-4 sm:px-6`-kolom; de katern-layout padt
          al, dus de negatieve marge voorkomt dubbele inspringing (zoals bij Doelen). */}
      <div className="-mx-4 sm:-mx-6">
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
      </div>
    </>
  )
}
