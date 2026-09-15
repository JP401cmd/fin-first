'use client'

/**
 * @deprecated Sinds ADR 0147 leeft de vragenlijst-staat in
 * `components/app/vragenlijst/vragenlijst-signaal-provider.tsx` — één fetch voor
 * de chat-kop, de teller op Fins bubbel én de uitnodigings-popup. Deze hook is
 * nog slechts een dunne doorgeefluik voor bestaande aanroepers; gebruik in
 * nieuwe code rechtstreeks `useVragenlijstSignaal()` of
 * `useVragenlijstSignaalOptional()`.
 *
 * Het type `ActieveVragenlijst` woont sindsdien óók in de provider en wordt hier
 * alleen nog doorgegeven, zodat bestaande imports (o.a. `vragenlijst-view.tsx`)
 * ongewijzigd blijven werken.
 */

import {
  useVragenlijstSignaalOptional,
  type ActieveVragenlijst,
} from '@/components/app/vragenlijst/vragenlijst-signaal-provider'

export type { ActieveVragenlijst } from '@/components/app/vragenlijst/vragenlijst-signaal-provider'

/** Stabiele fallbacks: een verse `[]`/`() => {}` per render zou effect-deps laten stuiteren. */
const LEEG: ActieveVragenlijst[] = []
const NIETS = () => {}

/**
 * @deprecated Zie de module-toelichting hierboven.
 *
 * `ingeschakeld` heeft geen effect meer: de provider haalt zelf op bij mount en
 * bij terugkeer naar de tab. De parameter blijft staan zodat bestaande
 * aanroepen compileren.
 */
export function useActieveVragenlijsten(_ingeschakeld?: boolean) {
  const signaal = useVragenlijstSignaalOptional()
  return {
    lijsten: signaal?.lijsten ?? LEEG,
    geladen: signaal?.geladen ?? false,
    herlaad: signaal?.herlaad ?? NIETS,
  }
}
