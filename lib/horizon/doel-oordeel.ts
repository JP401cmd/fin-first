// lib/horizon/doel-oordeel.ts
//
// REIKT HET VASTGELEGDE DOEL? (ADR 0175, 22 sep 2026)
// ───────────────────────────────────────────────────────────────────────────
// Het plan-stoplicht weegt onder "zo vroeg mogelijk" het vastgelegde doelscenario mee. Het
// oordeel is HETZELFDE predicaat als het zone-woord van het doelscenario-lab
// (`standGedekt`, lab-grenzen.ts) op de doel-stand (`doelStandNaarLab`), op de rauwe context
// van de canonieke hoofdrun. Eén kernel-run; geen eigen toets naast het lab.
//
// Pure module (geen Supabase, geen `Date.now()`); de loader levert de invoer. Draait de
// kernel, dus alleen server-side importeren.

import type { ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import { readSliderValueFromEvents } from '@/lib/scenario-events'
import { assetsMetRendementDelta, type ToekomstScenarioDoel } from '@/lib/horizon/toekomst-scenario'
import { standGedekt, type LabSolve } from '@/lib/horizon/lab-grenzen'
import { doelStandNaarLab } from '@/lib/horizon/doel-stand'

export interface VastgelegdDoelInput {
  doel: ToekomstScenarioDoel | null | undefined
  /** De rauwe context van de canonieke hoofdrun (`computeHorizonFireSim`) — de basis van het lab. */
  rawContext: Pick<ConvergentieRawContext, 'profile' | 'assets' | 'debts' | 'lifeEvents' | 'aowRows'>
  /** `buildBaselineOverrides` op dezelfde invoer als de lab-host. */
  baseline: WhatIfOverrides
  currentAge: number
}

/**
 * Reikt het vastgelegde doel? `true`/`false` is het oordeel van het lab op de doel-stand;
 * `null` = er valt niets te beoordelen: geen doel, een doel waarvan de stopleeftijd niet als
 * doel is vastgelegd (onder "zo vroeg mogelijk" is er dan geen doelmoment om aan te toetsen),
 * of een kern-fout. `null` laat het plan-stoplicht ongewijzigd — liever geen oordeel dan een
 * verzonnen.
 *
 * DE STOPLEEFTIJD MOET ZELF DOEL ZIJN (`parameters.fire`). De lab-stand bewaart altijd de
 * stop-knop (`buildLiveStand`), ook wie alleen de spaarquote aanvinkte. Zonder deze poort zou
 * de kop "je doel nog niet" zeggen over een stopleeftijd die nooit doel werd.
 */
export function vastgelegdDoelGedekt(input: VastgelegdDoelInput, deps?: { solve?: LabSolve }): boolean | null {
  const stand = input.doel?.stand
  if (stand == null || input.doel?.parameters.fire !== true) return null
  const lab = doelStandNaarLab(stand, input.baseline, input.currentAge)
  if (lab.stopAge == null || !Number.isFinite(lab.stopAge)) return null
  const { rawContext, baseline, currentAge } = input
  try {
    return standGedekt(
      {
        profile: rawContext.profile,
        assets: assetsMetRendementDelta(rawContext.assets, lab.returnDeltaByCategorie, rawContext.profile),
        debts: rawContext.debts,
        lifeEvents: rawContext.lifeEvents,
        aowRows: rawContext.aowRows,
        baseline,
        currentAge,
        waarden: {
          verdienen: readSliderValueFromEvents('extra_inleg', lab.sliderEvents, baseline),
          uitgeven: readSliderValueFromEvents('savings', lab.sliderEvents, baseline),
          uitgaveNaPensioen: lab.uitgaveNaPensioen,
          nalatenschap: lab.nalatenschap,
          stop: lab.stopAge,
        },
      },
      deps,
    )
  } catch {
    return null
  }
}
