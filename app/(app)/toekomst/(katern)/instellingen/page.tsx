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
import { resolveDeficitLoanRate } from '@/lib/horizon-kernel/adapter/params'

export const metadata: Metadata = {
  title: 'Instellingen — TriFinity',
  description:
    'Wat je toekomstplan voedt: je stopmoment, het einde van je plan, je onttrekking, hoe je potten meebewegen en de marktaannames.',
}

/**
 * /toekomst/instellingen — katern Instellingen (ADR 0179 D1/D4, fase 1 stap 17; R1 27 sep).
 *
 * De levensstrategieën (AOW, pensioen, werk, eigen woning) staan sinds 27 sep op katern Plan,
 * bij de levensgebeurtenissen. Oude deeplinks hierheen (`?rij=aow|pensioen|werk|huis`,
 * `?strategie=…`) stuurt `next.config.ts` op de routing-laag door naar
 * `/toekomst#levensstrategieen` (geen render-tijd-redirect: React #310, zie next.config).
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

  const rawProfile = horizonData.rawProfile
  const potBalances = buildPotBalances(horizonData.assets, horizonData.unlinkedCash)
  // TPR-12 — heffingvrij inkomen (Box 3, werkelijk-tak); NULL = kernel-default.
  const rawHeffingvrij = rawProfile?.box3_heffingvrij_inkomen
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
      {/* De rijen dragen geen eigen paginakolom meer (B5): ze staan links uitgelijnd in de
          inspringing van de katern-layout, net als het canvas en de koppen. */}
      <InstellingenKatern
        planReviewProgress={planReviewProgress}
        rijen={{
          fireParams: horizonData.fireParams,
          fireStrategy: horizonData.fireStrategy,
          firePlan: horizonData.firePlan,
          withdrawalStrategy: horizonData.withdrawalStrategy,
          // Zelfde rauwe rij + zelfde voorrangsregel als de kernel-adapter (B-042).
          withdrawalProfiel: resolveWithdrawalProfiel({
            withdrawal_strategy: horizonData.withdrawalStrategy.strategy,
            withdrawal_profile_config: rawProfile?.withdrawal_profile_config,
          }),
          simSnapshot: dashboardResult.regelSimSnapshot,
          regelVoorkeuren: dashboardResult.regelVoorkeuren,
          potBalances,
          box3HeffingvrijInkomen,
          events: horizonData.events,
          housingStrategy: horizonData.housingStrategy,
          retirementMethod: rawProfile?.retirement_expense_method ?? null,
          // Dezelfde bron als KPI 4 "Na pensioen" op Plan (de state-provider leest
          // `effectiveInput` als `input`): één getal, twee plekken.
          uitgaveNaPensioen: horizonData.effectiveInput.yearlyMustExpenses,
          // ADR 0149 — NULL = aan; alleen een bewuste `false` is uit.
          geenTekortLening: rawProfile?.fire_no_deficit_loan !== false,
          // Dezelfde resolver als de kernel-adapter (default + klem 0..1): de rij toont de
          // rente waar de kern mee rekent, ook bij een ongeldige DB-waarde.
          tekortLeningRente: resolveDeficitLoanRate({ date_of_birth: null, deficit_loan_rate: rawProfile?.deficit_loan_rate ?? null }),
          // Het canonieke dagtarief van de bundel: de vrijheidstijd bij "Uitgave na pensioen"
          // (`freedomDaysToday`), zelfde grondslag als de rest van /toekomst.
          dagtarief: horizonData.dailyExpenseRate,
          dagtariefBron: horizonData.dailyExpenseRateDetail?.source,
        }}
      />
    </>
  )
}
