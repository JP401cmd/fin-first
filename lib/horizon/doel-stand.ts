// lib/horizon/doel-stand.ts
//
// HET VASTGELEGDE DOEL, TERUG NAAR DE KNOPPEN (ADR 0175, 22 sep 2026)
// ───────────────────────────────────────────────────────────────────────────
// Het doelscenario-lab bewaart bij "Maak dit mijn doel" een kopie van zijn stand
// (`ToekomstScenarioDoel.stand`). Deze module vertaalt die kopie terug naar de lab-stand,
// voor twee lezers:
//  - "Herstel mijn doel" in `horizon-client.tsx` zet er de knoppen mee terug;
//  - het plan-stoplicht beoordeelt er het doel mee, server-side (`doel-oordeel.ts`), met
//    HETZELFDE predicaat als het zone-woord van het lab (`standGedekt`).
// Eén vertaling, zodat de kop op /toekomst en het lab na "Herstel mijn doel" per
// constructie op dezelfde stand rekenen.
//
// Pure, isomorfe module: geen `'use client'`, geen Supabase, geen `Date.now()`. Bewust zonder
// de kernel: de browser importeert dit bestand in de hoofdbundel.

import type { AssetCategorie } from '@/lib/horizon-kernel/types'
import type { WhatIfEvent, WhatIfOverrides } from '@/lib/types/horizon-whatif'
import { buildSliderEvent, type SliderKey } from '@/lib/scenario-events'
import type { ToekomstScenarioStand } from '@/lib/horizon/toekomst-scenario'

/** De lab-stand die een vastgelegd doel beschrijft, in de vorm van de lab-state. */
export interface DoelLabStand {
  /** Slider-events voor verdienen en uitgeven; leeg zonder baseline of leeftijd. */
  sliderEvents: WhatIfEvent[]
  returnDeltaByCategorie: Partial<Record<AssetCategorie, number>>
  /** De stopkeuze van het doel; `null` = geen (onder een vast stopmoment altijd weg). */
  stopAge: number | null
  /** Afwezig in het doel = "wat het plan rekent", dus `null`. */
  uitgaveNaPensioen: number | null
  nalatenschap: number | null
}

/**
 * Pref-sleutels → kernel-`SliderKey`. `income` (knop vervallen, spec §2) staat hier bewust
 * niet: een legacy stand met `sliders.income` wordt genegeerd, net als bij de pref-hydratie.
 */
const SLIDER_KEY_MAP: Record<'savings' | 'extraInleg', SliderKey> = {
  savings: 'savings',
  extraInleg: 'extra_inleg',
}

/** De vastgelegde stand terug naar de lab-stand. Zonder baseline of leeftijd: geen slider-events. */
export function doelStandNaarLab(
  stand: ToekomstScenarioStand,
  baseline: WhatIfOverrides | null,
  currentAge: number | null,
): DoelLabStand {
  const sliderEvents: WhatIfEvent[] = []
  if (baseline != null && currentAge != null) {
    for (const [prefKey, sliderKey] of Object.entries(SLIDER_KEY_MAP) as ['savings' | 'extraInleg', SliderKey][]) {
      const val = stand.sliders?.[prefKey]
      if (val === undefined) continue
      const ev = buildSliderEvent(sliderKey, val, baseline, currentAge)
      if (ev) sliderEvents.push(ev)
    }
  }
  return {
    sliderEvents,
    returnDeltaByCategorie: { ...(stand.returnDeltaByCategorie ?? {}) },
    stopAge: stand.stopAge ?? null,
    uitgaveNaPensioen: stand.uitgaveNaPensioen ?? null,
    nalatenschap: stand.nalatenschap ?? null,
  }
}
