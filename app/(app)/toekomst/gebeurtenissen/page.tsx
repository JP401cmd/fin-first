import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { GebeurtenissenView } from '@/components/future/gebeurtenissen-view'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { ageAtDate } from '@/lib/horizon-data'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { buildHorizonInput } from '@/lib/horizon/build-input'

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
  // Kernel-only: bouw de reële jaaruitgave-grondslag (+ null-guards) via de gedeelde
  // `buildHorizonInput`; de preview-baseline draagt de rauwe kernel-context (de events
  // injecteert `previewFireAge` per-aanroep). Zo matchen de AOW/Pensioen-previews per
  // constructie de Tijdas-grafiek (dezelfde motor: de horizon-kernel).
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
  })
  const strategieBaseline: PreviewBaseline | null =
    builtPreview && horizonData.rawProfile
      ? {
          // Rauwe kernel-context (mínus lifeEvents; die injecteert previewFireAge
          // per-aanroep). loadHorizonData leverde rawProfile al mee (met
          // yearly_essential_expenses), dus GEEN extra fetch.
          rawContext: {
            profile: horizonData.rawProfile,
            assets: horizonData.assets,
            debts: horizonData.debts,
            aowRows,
            yearlyExpenses: builtPreview.input.yearlyExpenses,
          },
        }
      : null
  // Netto maandinkomen voor de Werk-strategie: 6-maands transactie-inkomen
  // (zelfde grondslag als de spaarquote); fallback ~65% van het bruto-profiel.
  const currentNetMonthly = Math.round(
    horizonData.avgIncome6m > 0 ? horizonData.avgIncome6m : (ei.monthlyIncome ?? 0) * 0.65,
  )
  const strategieData = {
    baseline: strategieBaseline,
    dailyExpenses: ei.yearlyMustExpenses > 0 ? ei.yearlyMustExpenses / 365 : 0,
    aowRows,
    dateOfBirth: dob,
    grossYearlyIncome: (ei.monthlyIncome ?? 0) * 12,
    pensioenFactorA: horizonData.pensioenFactorA,
    currentAge,
    // Inflatievoet (single-sourced uit resolveFireParams) — indexatie-as van
    // de pensioen-projectiegrafiek in de pensioen-editor.
    inflationRate: horizonData.fireParams.inflationRate,
    currentNetMonthly,
    // Live preview Huis-strategie: zelfde simBasis als waarmee de loader de
    // virtuele housing-events resolvede — de modal rekent dan per definitie
    // hetzelfde trigger-moment en dezelfde vrijheidsleeftijd als de grafiek.
    housingPreview: horizonData.housingSimBasis
      ? {
          simBasis: horizonData.housingSimBasis,
          context: horizonData.housingContext,
          // Kernel-native woon-scenario-preview: de rauwe kernel-context (dezelfde als
          // de Tijdas-grafiek). De preview overschrijft per scenario alleen
          // `profile.housing_strategy_config`; de adapter mapt dat native naar de
          // kernel-woning-params. Zonder rawProfile → lege scenario-uitkomst.
          kernelRawContext: horizonData.rawProfile
            ? {
                profile: horizonData.rawProfile,
                assets: horizonData.assets,
                debts: horizonData.debts,
                // Rauwe app-events; de adapter-guard routeert virtuele woning-events
                // (en AOW/pensioen/werk) zelf naar hun param-blokken.
                lifeEvents: horizonData.events,
                aowRows,
                // Zelfde jaaruitgaven-grondslag als de housing-simBasis (geen nieuwe som).
                yearlyExpenses: horizonData.housingSimBasis.yearlyExpenses,
              }
            : undefined,
        }
      : null,
  }

  // Baseline FIRE-projectie voor de EventPane impact-preview — zelfde
  // strategy-aware aanroep als /horizon (scalar-projectie met strategy +
  // endAge) zodat de "vs. baseline"-delta klopt met de gekozen eindstrategie.
  // De scalar-router draait onvoorwaardelijk op de horizon-kernel voor de tijd-
  // velden (en valt alleen bij een dob-loze/negatieve-pot-gate terug op de scalar-
  // weergaveformule); geen vlag meer nodig.
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

  // Prop-bundle voor de herstelde EventPane (catalogus + bewerken vrije events).
  // `previewBaseline`: DEZELFDE rauwe kernel-context als de Tijdas-grafiek en de
  // strategie-editors. De EventPane-delta-previews (view + edit) draaien hierop via de
  // horizon-kernel (`computeConvergentieProjection`), zodat de "FIRE-impact"-delta's per
  // constructie de grafiek matchen. De fire-params/strategy/withdrawal blijven als
  // fallback wanneer de baseline null is (geen rauwe context).
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
