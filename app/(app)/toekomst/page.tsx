import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import HorizonPage from '@/components/app/horizon/horizon-client'
import { ToekomstTabs } from '@/components/future/toekomst-tabs'
import { DoelenView } from '@/components/future/doelen-view'
import { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'
import { VoorkeurenView } from '@/components/future/voorkeuren-view'
import { RekenhulpView } from '@/components/future/rekenhulp-view'
import { buildPrefillValues } from '@/lib/calculator/user-data-keys'
import type { CustomCalculatorRow } from '@/lib/calculator/types'
import { ageAtDate } from '@/lib/horizon-data'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { WEALTH_GROUPS, type WealthGroup } from '@/lib/wealth-composition'

export const metadata: Metadata = {
  title: 'Toekomst — TriFinity',
  description: 'Tijdas, doelen, gebeurtenissen en toekomst-voorkeuren — keuzes maken voor later.',
}

/**
 * /toekomst — canonieke toekomst-pagina (nieuwe navigatie-architectuur).
 *
 * Plan §6.3 vier-tab-structuur:
 *  - Tab 1: Tijdas (default) — toont bestaande HorizonPage met grafiek
 *           + Risk Lab + drag&drop events (toekomstige extractie)
 *  - Tab 2: Doelen — placeholder met deeplink naar Will-doelen
 *  - Tab 3: Gebeurtenissen — placeholder met deeplinks naar strategie/whatif
 *  - Tab 4: Voorkeuren — placeholder met deeplinks naar parameters/instellingen
 *
 * Niet-destructieve scaffolding: Tijdas-tab rendert het bestaande
 * HorizonPage 1-op-1, alleen verpakt in de segmented-control. De andere
 * tabs tonen voor nu placeholder-cards met links naar de huidige routes
 * — in komende iteraties wordt hun content nativ uit HorizonPage
 * geëxtraheerd.
 */
export default async function ToekomstPage() {
  const supabase = await createClient()
  const [horizonData, willData, dashboardResult, aowRes] = await Promise.all([
    loadHorizonData(supabase),
    loadWillData(supabase),
    loadDashboardData(supabase),
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

  // simRows + fireAge voor AfbouwOverzichtCard in VoorkeurenView (plan F-2).
  const simRows = dashboardResult.dashboardData.simRows ?? null
  const fireAge =
    dashboardResult.dashboardData.fireAgeFractional != null
      ? Math.round(dashboardResult.dashboardData.fireAgeFractional)
      : null

  // Huidig saldo per WealthGroup voor de illustratieve pot-flow-weergave (regel 3/4/5).
  const potBalances: Record<WealthGroup, number> = {
    spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
  }
  for (const a of horizonData.assets ?? []) {
    if (a.is_active === false) continue
    const g = WEALTH_GROUPS[a.asset_type]
    if (g) potBalances[g] += Number(a.current_value) || 0
  }
  potBalances.spaargeld += Math.max(0, horizonData.unlinkedCash ?? 0)

  // Rekenhulp (Will-assisted calculators): prefill-waarden uit de
  // horizon-data + opgeslagen calculators van de gebruiker.
  const prefill = buildPrefillValues({
    effectiveInput: horizonData.effectiveInput,
    unlinkedCash: horizonData.unlinkedCash,
    assets: horizonData.assets,
    housingContext: horizonData.housingContext,
    fireParams: horizonData.fireParams,
  })
  const { data: { user } } = await supabase.auth.getUser()
  let savedCalculators: CustomCalculatorRow[] = []
  if (user) {
    const { data: calcRows } = await supabase
      .from('custom_calculators')
      .select(
        'id, name, description, definition, created_by_ai, sort_order, created_at, is_public, published_at, forked_from, like_count, duplicate_count',
      )
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    savedCalculators = (calcRows ?? []) as CustomCalculatorRow[]
  }

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
  }

  return (
    <ToekomstTabs
      tijdasView={<HorizonPage initialData={horizonData} />}
      doelenView={
        <DoelenView
          goals={willData.goals}
          goalProgresses={willData.goalProgresses}
        />
      }
      gebeurtenissenView={
        <GebeurtenissenView
          events={horizonData.events}
          currentAge={currentAge}
          annualSavings={Math.max(
            0,
            (horizonData.avgIncome6m - horizonData.avgExpenses6m) * 12,
          )}
          strategieData={strategieData}
        />
      }
      voorkeurenView={
        <VoorkeurenView
          fireParams={horizonData.fireParams}
          fireStrategy={horizonData.fireStrategy}
          withdrawalStrategy={horizonData.withdrawalStrategy}
          fireAge={fireAge}
          simRows={simRows}
          simSnapshot={dashboardResult.regelSimSnapshot}
          regelVoorkeuren={dashboardResult.regelVoorkeuren}
          potBalances={potBalances}
        />
      }
      rekenhulpView={
        <RekenhulpView saved={savedCalculators} prefill={prefill} />
      }
    />
  )
}
