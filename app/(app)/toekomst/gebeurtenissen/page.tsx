import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonRaw } from '@/lib/horizon-data-loader'
import { GebeurtenissenView, type KernelSimData } from '@/components/future/gebeurtenissen-view'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import { buildConvergentieAdapterProfile } from '@/lib/horizon-kernel/convergentie-router'
import { resolveDeficitLoanRate } from '@/lib/horizon-kernel/adapter/params'
import { buildStrategieEditorsData } from '@/lib/horizon/strategie-editors-data'
import { resolveStrategieRedirect } from '@/lib/horizon/strategie-route'

export const metadata: Metadata = {
  title: 'Gebeurtenissen — TriFinity',
  description:
    'Levensgebeurtenissen op je tijdas — kind, erfenis, verhuizing of minder werken — en de momenten die je plan zelf berekent.',
}

/**
 * /toekomst/gebeurtenissen — subpagina voor levensgebeurtenissen.
 *
 * De vier levensstrategieën (AOW/Pensioen/Huis/Werk) wonen sinds 17 sep 2026 op
 * /toekomst/voorkeuren. Een klik op een strategie-beheerd event of een berekend
 * huis/pensioen-moment navigeert daarheen; een oude deeplink
 * `?strategie=aow|pensioen|huis|werk` redirect hier server-side naar
 * `/toekomst/voorkeuren?strategie=…` (overige params behouden).
 *
 * `strategieData` komt uit dezelfde helper als Voorkeuren
 * (`buildStrategieEditorsData`): de tijdlijn gebruikt er de kernel-context
 * (`baseline.rawContext`) en het dagtarief van.
 */
export default async function ToekomstGebeurtenissenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const strategieRedirect = resolveStrategieRedirect(await searchParams)
  if (strategieRedirect) redirect(strategieRedirect)

  const supabase = await createClient()
  const horizonData = await loadHorizonRaw(supabase)

  const ei = horizonData.effectiveInput
  const { strategieData, aowAgeFractional: aowFractional } = buildStrategieEditorsData(horizonData)
  const strategieBaseline = strategieData.baseline
  const currentAge = strategieData.currentAge

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

  // Feature #876 — kernel-afgeleide strategiemomenten. De view draait de
  // client-side `useHorizonFireSim`-hook (DEZELFDE run-site als de Tijdas-
  // grafiek) op strategieBaseline.rawContext + eventPaneData; dit blok draagt
  // alleen de hook-inputs die nog níet in die props zitten. `deficitLoanRate`
  // is de canonieke tekort-lening-rente (V7-resolver, geen eigen 0,05).
  const kernelSim: KernelSimData | null =
    strategieBaseline && horizonData.rawProfile
      ? {
          aowAgeFractional: aowFractional,
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
      {/* Kerncijfer in de titel: het aantal gebeurtenissen dat op de tijdas
          staat — geteld op exact dezelfde rijen die de view rendert, en
          dezelfde telling als de Gebeurtenissen-navkaart op /toekomst. Geen
          stoplicht: een gebeurtenis is geen oordeel, dus neutrale inkt. */}
      <ToekomstSubpageShell
        route="/toekomst/gebeurtenissen"
        fallbackName="Gebeurtenissen"
        verdict={
          horizonData.events.length > 0
            ? `${horizonData.events.length} ${horizonData.events.length === 1 ? 'gebeurtenis' : 'gebeurtenissen'}`
            : null
        }
        deck="Kind, erfenis, verhuizing of minder werken. Momenten die je tijdas verschuiven."
      />
      <GebeurtenissenView
        events={horizonData.events}
        currentAge={currentAge}
        annualSavings={Math.max(
          0,
          (horizonData.avgIncome6m - horizonData.avgExpenses6m) * 12,
        )}
        strategieData={strategieData}
        eventPaneData={eventPaneData}
        kernelSim={kernelSim}
      />
    </>
  )
}
