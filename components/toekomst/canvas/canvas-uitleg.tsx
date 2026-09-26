// Verplaatst uit components/app/horizon/horizon-client.tsx r7157–7237 @ c1b4849eb (fase 1, ADR 0179).
'use client'

/**
 * De cijferbalk boven de grafiek (blok K): de `LifelineReadout`, die meebeweegt met
 * hover en afspelen. Alleen Volledig (desktop-diepte, spec §4.7) en alleen in Vermogen.
 *
 * Fase 2 (ADR 0179 D3): de vijf `ChartOverlayExplainer`-blokken die hier stonden zijn
 * vervallen. De uitleg per laag staat in het Lagen-menu (`LAAG_UITLEG`), "Zo werkt je
 * grafiek" achter de canvas-i.
 *
 * De readout krijgt `viewReadoutData` (al in de actieve euro-weergave).
 */
// euro-view: ontvangt view*-feeds van de render-grens, deflateert niet zelf

import type { CanvasModus } from '@/lib/horizon/katern-copy'
import { HideInSimple } from '@/components/app/hide-in-simple'
import { LifelineReadout } from '@/components/app/horizon/lifeline-readout'
import type { ReadoutData } from '@/components/toekomst/state/types'

export interface CanvasUitlegProps {
  modus: CanvasModus
  viewReadoutData: ReadoutData | null
  lifelineAge: number | null
}

export function CanvasUitleg({ modus, viewReadoutData, lifelineAge }: CanvasUitlegProps) {
  return (
    <HideInSimple>
      {modus === 'vermogen' && viewReadoutData && (
        <div className="mb-2">
          <LifelineReadout
            age={viewReadoutData.age}
            year={viewReadoutData.year}
            phaseLabel={viewReadoutData.phaseLabel}
            phaseColor={viewReadoutData.phaseColor}
            netWorth={viewReadoutData.netWorth}
            freedomTime={viewReadoutData.freedomTime}
            monthlyLabel={viewReadoutData.monthlyLabel}
            monthlyAmount={viewReadoutData.monthlyAmount}
            netWorthMoment={viewReadoutData.netWorthMoment}
            isResting={lifelineAge === null}
          />
        </div>
      )}
    </HideInSimple>
  )
}
