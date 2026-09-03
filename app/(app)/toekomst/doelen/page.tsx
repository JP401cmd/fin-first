import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadFinData, loadEffectiveMonthlyFigures } from '@/lib/fin-data-loader'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { DoelenView } from '@/components/future/doelen-view'

export const metadata: Metadata = {
  title: 'Doelen — TriFinity',
  description:
    'Je financiële doelen met status-flags — sparen, aflossen, vermogensgroei en je vrijheidsgetal bereiken.',
}

/**
 * /toekomst/doelen — eigen subroute voor de Doelen-view.
 *
 * Onderdeel van de tijdas-landing + navigatiekaarten-architectuur: de
 * tijdas op /toekomst is de landing, en Doelen krijgt een eigen
 * bookmarkbare subpagina. Laadt alleen de Fin-data die DoelenView nodig
 * heeft (goals + goalProgresses) — niet meer dan nodig.
 *
 * De prop-opbouw is 1-op-1 overgenomen uit de oude ToekomstPage (de
 * doelenView-tak van ToekomstTabs).
 */
export default async function ToekomstDoelenPage() {
  const supabase = await createClient()
  const [finData, monthlyFigures] = await Promise.all([
    loadFinData(supabase),
    loadEffectiveMonthlyFigures(supabase),
  ])

  return (
    <>
      <ToekomstSubpageShell
        kicker="Toekomst · Doelen"
        titleBefore="Waar spaar je je "
        emphasis="vrijheid"
        titleAfter=" voor?"
        deck="Je doelen met status — sparen, aflossen en groeien richting je vrijheidsgetal."
        infoKey="/toekomst/doelen"
      />
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
      />
    </>
  )
}
