/**
 * Server-opbouw van de levensstrategie-editordata (AOW, Pensioen, Huis, Werk) — één bron
 * voor de twee pagina's die 'm gebruiken:
 *
 *  - /toekomst/voorkeuren rendert de vier strategieën en hun editors (sinds 17 sep 2026:
 *    verhuisd van Gebeurtenissen, besluit eigenaar — verhuizen, geen dubbeling);
 *  - /toekomst/gebeurtenissen draait op dezelfde `baseline.rawContext` + `dailyExpenses`
 *    zijn kernel-sim voor de tijdlijn (feature #876).
 *
 * Eén rekenpad: de reële jaaruitgave-grondslag komt uit `buildHorizonInput`, het dagtarief
 * en de werk-prefill uit `strategieEditorBasis` (dezelfde basis als de plan-review-wizard).
 * Deze helper leest zelf niets: de `aow_leeftijd`-rijen komen al mee in `HorizonRawData.aowRows`
 * (dezelfde kolommen en sortering), dus geen tweede query.
 */

import type { HorizonRawData } from '@/lib/horizon/raw-data-loader'
import type { PreviewBaseline } from '@/lib/strategy-preview'
import type { StrategieEditorsData } from '@/components/future/strategie/strategie-editors'
import { lookupAowAge } from '@/lib/aow-leeftijd'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import { strategieEditorBasis } from '@/lib/horizon/strategie-editor-basis'

export interface StrategieEditorsBuild {
  /** Props voor `<StrategieEditors data=…>`. `strategieData.baseline` is de gedeelde kernel-context. */
  strategieData: StrategieEditorsData
  /** Fractionele AOW-leeftijd uit dezelfde lookup (kernel-sim-invoer op Gebeurtenissen). */
  aowAgeFractional: number
}

export function buildStrategieEditorsData(horizonData: HorizonRawData): StrategieEditorsBuild {
  const ei = horizonData.effectiveInput
  const aowRows = horizonData.aowRows
  const { dateOfBirth, currentAge, currentNetMonthly, dailyExpenses } = strategieEditorBasis(horizonData)
  const aowAgeFractional = lookupAowAge(aowRows, dateOfBirth).fractional

  // Kernel-only: de reële jaaruitgave-grondslag (+ null-guards) via de gedeelde
  // `buildHorizonInput`; de preview-baseline draagt de rauwe kernel-context (de events
  // injecteert `previewFireAge` per-aanroep). Zo matchen de AOW/Pensioen-previews per
  // constructie de Tijdas-grafiek (dezelfde motor: de horizon-kernel).
  const builtPreview = buildHorizonInput({
    horizonInput: ei,
    lifeEvents: [], // events per-aanroep geïnjecteerd door previewFireAge
    fireStrategy: horizonData.fireStrategy,
    withdrawalStrategy: horizonData.withdrawalStrategy,
    grossReturn: horizonData.fireParams.grossReturn,
    inflation: horizonData.fireParams.inflationRate,
    aowAgeFractional,
    assets: horizonData.assets,
    debts: horizonData.debts,
    box3Method: horizonData.box3Method,
    hasPartner: horizonData.hasPartner,
    bankAccountCash: horizonData.unlinkedCash,
    baseAnnualSavingsFromCashflow: horizonData.baseAnnualSavingsFromCashflow,
    housingStrategy: horizonData.housingStrategy,
  })
  const baseline: PreviewBaseline | null =
    builtPreview && horizonData.rawProfile
      ? {
          // Rauwe kernel-context (mínus lifeEvents; die injecteert previewFireAge
          // per-aanroep). De loader leverde rawProfile al mee, dus GEEN extra fetch.
          rawContext: {
            profile: horizonData.rawProfile,
            assets: horizonData.assets,
            debts: horizonData.debts,
            aowRows,
            yearlyExpenses: builtPreview.input.yearlyExpenses,
          },
        }
      : null

  const strategieData: StrategieEditorsData = {
    baseline,
    dailyExpenses,
    aowRows,
    dateOfBirth,
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

  return { strategieData, aowAgeFractional }
}
