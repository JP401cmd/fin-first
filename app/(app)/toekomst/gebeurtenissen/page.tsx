import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { ageAtDate, computeFireProjection } from '@/lib/horizon-data'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'

export const metadata: Metadata = {
  title: 'Gebeurtenissen — TriFinity',
  description:
    'Levensgebeurtenissen en levensstrategieën op je tijdas — kind, erfenis, AOW, pensioen en huis.',
}

/**
 * /toekomst/gebeurtenissen — subpagina voor levensgebeurtenissen en
 * levensstrategieën (AOW/Pensioen/Huis).
 *
 * Geëxtraheerd uit de oude tab-structuur van /toekomst: de prop-opbouw voor
 * <GebeurtenissenView> is 1-op-1 overgenomen uit de voormalige ToekomstPage.
 *
 * GebeurtenissenView leest zelf de ?strategie=aow|pensioen|huis query-param
 * (client) om de bijbehorende levensstrategie-modal te openen — die deeplinks
 * blijven dus werken op deze route.
 */
export default async function ToekomstGebeurtenissenPage() {
  const supabase = await createClient()
  const [horizonData, aowRes] = await Promise.all([
    loadHorizonData(supabase),
    supabase
      .from('aow_leeftijd')
      .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
      .order('birth_date_from', { ascending: true }),
  ])

  const aowRows = (aowRes.data ?? []) as AowLeeftijdRow[]
  // currentAge afgeleid uit DOB voor ScenarioBibliotheek-defaults
  // (target_age = currentAge + N jaar). Null wanneer DOB ontbreekt.
  const dob = horizonData.effectiveInput?.dateOfBirth ?? null
  const currentAge = dob ? Math.round(ageAtDate(dob)) : null

  // Baseline + lookup-data voor de levensstrategie-editors (AOW/Pensioen/Huis).
  const ei = horizonData.effectiveInput
  const strategieBaseline: PreviewBaseline | null =
    currentAge != null && ei.yearlyMustExpenses > 0
      ? {
          currentAge,
          endAge: horizonData.fireStrategy.endAge,
          portfolio: ei.totalAssets - ei.totalDebts,
          yearlyExpenses: ei.yearlyMustExpenses,
          annualSavings: (ei.monthlyContributions ?? 0) * 12,
          grossReturn: horizonData.fireParams.grossReturn,
          inflation: horizonData.fireParams.inflationRate,
          fireStrategy: horizonData.fireStrategy,
          withdrawalStrategy: horizonData.withdrawalStrategy,
        }
      : null
  const strategieData = {
    baseline: strategieBaseline,
    dailyExpenses: ei.yearlyMustExpenses > 0 ? ei.yearlyMustExpenses / 365 : 0,
    aowRows,
    dateOfBirth: dob,
    grossYearlyIncome: (ei.monthlyIncome ?? 0) * 12,
    // Live preview Huis-strategie: zelfde simBasis als waarmee de loader de
    // virtuele housing-events resolvede — de modal rekent dan per definitie
    // hetzelfde trigger-moment en dezelfde vrijheidsleeftijd als de grafiek.
    housingPreview: horizonData.housingSimBasis
      ? { simBasis: horizonData.housingSimBasis, context: horizonData.housingContext }
      : null,
  }

  // Baseline FIRE-projectie voor de EventPane impact-preview — zelfde
  // strategy-aware aanroep als /horizon (computeFireProjection met strategy +
  // endAge) zodat de "vs. baseline"-delta klopt met de gekozen eindstrategie.
  const baselineFire = computeFireProjection(
    ei,
    horizonData.fireParams.grossReturn,
    horizonData.fireParams.effectiveSwr,
    undefined,
    { strategy: horizonData.fireStrategy.strategy, endAge: horizonData.fireStrategy.endAge },
  )

  // Prop-bundle voor de herstelde EventPane (catalogus + bewerken vrije events).
  const eventPaneData = {
    baselineInput: ei,
    baselineFire,
    fireParams: horizonData.fireParams,
    fireStrategy: horizonData.fireStrategy,
    withdrawalStrategy: horizonData.withdrawalStrategy,
    endAge: horizonData.fireStrategy.endAge ?? 90,
    householdMode: horizonData.hasPartner ?? false,
  }

  return (
    <>
      <ToekomstSubpageShell kicker="Toekomst" title="Gebeurtenissen" />
      <GebeurtenissenView
        events={horizonData.events}
        currentAge={currentAge}
        annualSavings={Math.max(
          0,
          (horizonData.avgIncome6m - horizonData.avgExpenses6m) * 12,
        )}
        strategieData={strategieData}
        eventPaneData={eventPaneData}
      />
    </>
  )
}
