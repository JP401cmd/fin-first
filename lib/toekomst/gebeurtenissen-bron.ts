// lib/toekomst/gebeurtenissen-bron.ts
//
// De server-kant van de levensgebeurtenissen op katern Plan (ADR 0179, addendum 26 sep).
//
// Tot het addendum stond de lijst in katern Instellingen en bouwde die page deze props
// zelf. De lijst verhuisde naar Plan (`/toekomst`); de katern-layout bouwt ze nu één keer
// uit de horizon-bundel die hij al laadt en geeft ze via de state-provider door
// (`useToekomstBron().gebeurtenissen`). Zo leest het Plan-paneel de route niet (D8) en
// kost een katernwissel naar Plan geen tweede server-lading.
//
// Pure afleiding uit `HorizonPageData`: dezelfde aanroepen als de oude Instellingen-page,
// in dezelfde volgorde. Geen eigen rekenwerk.

import type { ComponentProps } from 'react'
import type { GebeurtenissenView, KernelSimData } from '@/components/future/gebeurtenissen-view'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { buildStrategieEditorsData } from '@/lib/horizon/strategie-editors-data'
import { computeScalarFireProjection } from '@/lib/horizon-kernel/scalar-router'
import { buildConvergentieAdapterProfile } from '@/lib/horizon-kernel/convergentie-router'
import { resolveDeficitLoanRate } from '@/lib/horizon-kernel/adapter/params'

/** De props van `GebeurtenissenView` zonder de hoofdrun (die komt client-side uit de provider). */
export type GebeurtenissenBron = Omit<ComponentProps<typeof GebeurtenissenView>, 'hoofdrun'>

export function bouwGebeurtenissenBron(horizonData: HorizonPageData): GebeurtenissenBron {
  const { strategieData, aowAgeFractional } = buildStrategieEditorsData(horizonData)
  const strategieBaseline = strategieData.baseline
  const ei = horizonData.effectiveInput

  // Baseline FIRE-projectie voor de EventPane impact-preview — zelfde strategy-aware
  // aanroep als de tijdas, zodat de "vs. baseline"-delta klopt met de eindstrategie.
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

  // `previewBaseline` = dezelfde rauwe kernel-context als de tijdas en de strategie-editors.
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

  // Feature #876 — hook-inputs voor de kernel-afgeleide strategiemomenten.
  // `deficitLoanRate` is de canonieke tekort-lening-rente (V7-resolver).
  const kernelSim: KernelSimData | null =
    strategieBaseline && horizonData.rawProfile
      ? {
          aowAgeFractional,
          box3Method: horizonData.box3Method,
          bankAccountCash: horizonData.unlinkedCash,
          baseAnnualSavingsFromCashflow: horizonData.baseAnnualSavingsFromCashflow,
          housingStrategy: horizonData.housingStrategy,
          deficitLoanRate: resolveDeficitLoanRate(
            buildConvergentieAdapterProfile(horizonData.rawProfile),
          ),
        }
      : null

  return {
    events: horizonData.events,
    currentAge: strategieData.currentAge,
    annualSavings: Math.max(0, (horizonData.avgIncome6m - horizonData.avgExpenses6m) * 12),
    strategieData,
    eventPaneData,
    kernelSim,
  }
}
