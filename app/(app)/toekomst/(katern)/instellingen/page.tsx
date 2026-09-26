import type { Metadata } from 'next'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import {
  getToekomstClient,
  loadToekomstHorizonData,
  loadToekomstPlanReviewProgress,
} from '@/lib/toekomst/load-toekomst-data'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { InstellingenKatern } from '@/components/toekomst/instellingen/instellingen-katern'
import { OudeGebeurtenissenBladwijzer } from '@/components/toekomst/layout/oude-lab-bladwijzer'
import { resolveWithdrawalProfiel } from '@/lib/withdrawal-strategy'
import { buildPotBalances } from '@/lib/future/pot-balances'
import { buildStrategieEditorsData } from '@/lib/horizon/strategie-editors-data'

export const metadata: Metadata = {
  title: 'Instellingen — TriFinity',
  description:
    'Wat je toekomstplan voedt: eindstrategie, onttrekking, pot-regels, je AOW-, pensioen-, huis- en werkstrategie en markt-aannames.',
}

/**
 * /toekomst/instellingen — katern Instellingen (ADR 0179 D1/D4, fase 1 stap 17).
 *
 * Vervangt de oude subroute /toekomst/voorkeuren (redirect via `next.config.ts`, query
 * mee). De levensgebeurtenissen stonden hier tot het addendum van 26 sep (ADR 0179); ze
 * staan nu onder het plan op /toekomst#gebeurtenissen, waar ook /toekomst/gebeurtenissen
 * heen redirect.
 * Staat in de `(katern)`-groep: de kop, de `PlanReviewProvider`, het canvas en de
 * katern-koppen komen uit de layout — hier dus geen eigen kop en geen tweede provider.
 *
 * De horizon-bundel en de review-voortgang komen uit de per request gecachte deel-ladingen
 * die de layout ook leest (`HorizonPageData` is een superset van de rauwe bundel die de
 * views lezen). Bewust niet `loadToekomstData()`: bij client-navigatie rendert de layout
 * niet opnieuw, en dan zou deze page ook Fin-data, plan-oordeel en minimaliseer-pref laden.
 */
export default async function ToekomstInstellingenPage() {
  const supabase = await getToekomstClient()
  const [horizonData, planReviewProgress, dashboardResult] = await Promise.all([
    loadToekomstHorizonData(),
    loadToekomstPlanReviewProgress(),
    loadDashboardData(supabase),
  ])

  // Levensstrategie-editors (AOW/Pensioen/Huis/Werk) voor de Voorkeuren-view.
  const { strategieData } = buildStrategieEditorsData(horizonData)

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

  return (
    <>
      {/* Geen eigen kop: de layout draagt de plan-kop. De review-voortgang staat op de
          wizard-ingang. */}
      <NavStackMeta title="Instellingen" />
      {/* `/toekomst/instellingen#gebeurtenissen` (de lijst stond hier tot het addendum van
          26 sep) → de gebeurtenissen onder het plan. */}
      <OudeGebeurtenissenBladwijzer />
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
      />
      </div>
    </>
  )
}
