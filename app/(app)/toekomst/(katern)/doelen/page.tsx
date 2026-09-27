import type { Metadata } from 'next'
import { loadEffectiveMonthlyFigures } from '@/lib/fin-data-loader'
import { getToekomstClient, loadToekomstFinData } from '@/lib/toekomst/load-toekomst-data'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { DoelenView } from '@/components/future/doelen-view'
import { SectionLabel } from '@/components/editorial'
import { DOELEN_LIJST_KOP } from '@/lib/horizon/katern-copy'
import { DoelenKaternLab, DoelenKaternLabSheets } from '@/components/toekomst/doelen/doelen-katern-lab'
import { DoelenLabDetails } from '@/components/toekomst/doelen/doelen-lab-details'
import { DoelenAnderePaden } from '@/components/toekomst/doelen/andere-paden'

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
 *
 * Fase 4 (ADR 0179 D7, spec §4.3): mobiel het lab direct onder de grafiek, dan de details
 * (marktaannames, indicatieregel), II · Je doelen, III · Andere paden, en de sheets één keer.
 * Op desktop staat het lab in de rechterkolom van de canvas-rij (layout).
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
      {/* Mobiel: het lab direct onder de grafiek (ADR 0179 D7 en addendum (k)); op desktop
          staat het in de rechterkolom van de canvas-rij (layout, CanvasZijkolom). */}
      <DoelenKaternLab plek="onder-koppen" />
      <DoelenLabDetails />
      {/* II · Je doelen (fase 4): de lijst onder het lab, ingebed in de katern-kolom. De
          SectionLabel is visueel; de koppen (h2) staan in de lijst zelf. */}
      <div className="mt-8 sm:mt-10" data-testid="doelen-lijst">
        <SectionLabel num="II">{DOELEN_LIJST_KOP}</SectionLabel>
        <DoelenView
          ingebed
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
      {/* III · Andere paden naast je doelscenario (fase 4): de scenario-kaarten, lazy. */}
      <DoelenAnderePaden />
      {/* De sheets van het lab: één keer, los van de twee plekken. */}
      <DoelenKaternLabSheets />
    </>
  )
}
