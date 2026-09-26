'use client'

import { useMemo } from 'react'

/**
 * Houdt de vorige object-referentie vast zolang elk veld referentie-gelijk is.
 *
 * WAAROM (ADR 0179 "Gevolgen"): de state-provider deelt per concern één object via een
 * context. Een nieuw object per render laat élke consument van die context opnieuw
 * renderen, ook als er in dat concern niets veranderde. Met deze hook blijft de
 * context-waarde gelijk zolang geen van de velden verandert, zodat een katern dat
 * alleen het perspectief leest niet meerendert op een knopbeweging in het lab.
 *
 * Voorwaarde: de aanroeper geeft een object-LITERAL met een vaste set sleutels in een
 * vaste volgorde. Dan heeft de deps-array altijd dezelfde lengte (React-eis).
 */
export function useStabielObject<const T extends object>(waarde: T): T {
  // De deps zijn de velden zelf; de lengte is per aanroep vast (object-literal).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => waarde, Object.values(waarde))
}
