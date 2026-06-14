import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { ageAtDate, computeFireProjection } from '@/lib/horizon-data'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { buildHorizonInput } from '@/lib/horizon-engine/build-input'

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
  // Cutover (C4, ADR 0016): bouw de preview-baseline via DEZELFDE gedeelde
  // input-assemblage (`buildHorizonInput`) + flag-bewuste engine als de Tijdas-
  // grafiek, i.p.v. de oude lossy `portfolio = totalAssets − totalDebts`-scalar
  // op de legacy `runSimulation`. Daardoor matchen de AOW/Pensioen-previews per
  // constructie de v2-grafiek voor v2-gebruikers (en blijven ze v1 als de flag
  // uit staat). De editors injecteren hun events per-aanroep in deze input.
  const aowFractional = lookupAowAge(aowRows, dob).fractional
  const builtPreview = buildHorizonInput({
    horizonInput: ei,
    lifeEvents: [], // events per-aanroep geïnjecteerd door previewFireAge
    fireStrategy: horizonData.fireStrategy,
    withdrawalStrategy: horizonData.withdrawalStrategy,
    grossReturn: horizonData.fireParams.grossReturn,
    inflation: horizonData.fireParams.inflationRate,
    aowAgeFractional: aowFractional,
    assets: horizonData.assets,
    debts: horizonData.debts,
    box3Method: horizonData.box3Method,
    hasPartner: horizonData.hasPartner,
    bankAccountCash: horizonData.unlinkedCash,
    monthlySavingsOverride: horizonData.monthlySavingsOverride,
    baseAnnualSavingsFromCashflow: horizonData.baseAnnualSavingsFromCashflow,
    housingStrategy: horizonData.housingStrategy,
    potRules: horizonData.potRules,
    horizonEngineV2: horizonData.horizonEngineV2,
  })
  const strategieBaseline: PreviewBaseline | null = builtPreview
    ? {
        input: builtPreview.input,
        useV2: horizonData.horizonEngineV2,
        strategyOptions: builtPreview.strategyOptions,
        pensioenFireAgeFractional: builtPreview.isPensioen ? aowFractional : null,
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
      ? {
          simBasis: horizonData.housingSimBasis,
          context: horizonData.housingContext,
          // Zelfde engine-keuze als de grafiek (profielvlag via de loader) zodat
          // de modal-preview de v2-grafiek matcht (M2).
          horizonEngineV2: horizonData.horizonEngineV2,
        }
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
  // `previewBaseline` (C5-pre): DEZELFDE flag-bewuste, per-asset input als de Tijdas-
  // grafiek en de strategie-editors (gebouwd via `buildHorizonInput`). De EventPane-
  // delta-previews (view + edit) draaien hierop via `runSelectedProjection` i.p.v. de
  // oude lossy `portfolio = totalAssets − totalDebts`-scalar op de legacy `runSimulation`
  // — zodat v2-gebruikers v2-consistente "FIRE-impact"-delta's zien (en flag-uit v1).
  // De fire-params/strategy/withdrawal blijven als fallback wanneer de baseline null is.
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
