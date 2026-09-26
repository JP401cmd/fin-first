import type { Metadata } from 'next'
import { loadEffectiveMonthlyFigures } from '@/lib/fin-data-loader'
import { getToekomstClient, loadToekomstFinData } from '@/lib/toekomst/load-toekomst-data'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { DoelenView } from '@/components/future/doelen-view'
import { DoelenKaternLab } from '@/components/toekomst/doelen/doelen-katern-lab'

export const metadata: Metadata = {
  title: 'Doelen — TriFinity',
  description:
    'Je financiële doelen met status-flags — sparen, aflossen, vermogensgroei en je vrijheidsgetal bereiken.',
}

/**
 * /toekomst/doelen — katern Doelen (ADR 0179 D1/D4, fase 1 stap 16).
 *
 * Staat in de `(katern)`-groep: kop, canvas en katern-koppen komen uit de layout en
 * blijven gemonteerd bij een wissel met Plan of Instellingen (GW1). Deze page levert
 * het doelscenario-lab (van Plan hierheen verhuisd, GW5) en daaronder de doelenlijst.
 *
 * De Fin-data komt uit de per request gecachte deel-lading `loadToekomstFinData`, die de
 * layout ook leest. Bewust NIET `loadToekomstData()`: bij client-navigatie tussen de
 * katernen rendert de layout niet opnieuw, dus die zou hier de volle lading (horizon-kernel,
 * plan-oordeel, plan-review) draaien voor één veld. Alleen de maandcijfers zijn eigen.
 * Mutaties in DoelenView en het lab doen `router.refresh()`, waarmee ook de layout (en
 * dus het canvas) verse data krijgt (GW2).
 */
export default async function ToekomstDoelenPage() {
  const supabase = await getToekomstClient()
  const [finData, monthlyFigures] = await Promise.all([
    loadToekomstFinData(),
    loadEffectiveMonthlyFigures(supabase),
  ])

  return (
    <>
      <NavStackMeta title="Doelen" />
      <DoelenKaternLab />
      {/* DoelenView draagt zijn eigen `max-w-6xl px-4 sm:px-6`-kolom; de katern-layout
          padt al, dus de negatieve marge voorkomt dubbele inspringing. Fase 4 voegt lab
          en lijst samen en ruimt dit op. */}
      <div className="mt-6 -mx-4 sm:-mx-6">
        <DoelenView
          goals={finData.goals}
          goalProgresses={finData.goalProgresses}
          completedGoals={finData.completedGoals}
          monthlyIncome={monthlyFigures.monthlyIncome}
          monthlyExpenses={monthlyFigures.monthlyExpenses}
          vrijheidsgetalLive={finData.vrijheidsgetalLive}
          vrijheidsgetalHomeExcluded={finData.vrijheidsgetalHomeExcluded}
          linkedGoalIds={finData.linkedGoalIds}
          autoCompletedGoals={finData.autoCompletedGoals}
          labPlan={finData.labPlan}
        />
      </div>
    </>
  )
}
