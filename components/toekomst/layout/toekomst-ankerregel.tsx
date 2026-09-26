'use client'

/**
 * De ankerregel in de /toekomst-kop (ADR 0179 D2): één regel onder de oordeelzin die
 * zegt waar het plan op rust — "Vrij mogelijk vanaf je 52e." of "Je rekent met stoppen
 * op 60.". Het getal staat daarnaast alleen nog als KPI 1 in Plan (spec §4.9).
 *
 * Leest de state-provider (dezelfde `heroFireAge` als KPI 1) en kiest via de pure
 * `toekomstAnkerregel`. Tijdens het rekenen houdt een lege regel de ruimte vast, zodat de
 * kop niet verspringt als de kernel klaar is (CLS).
 */

import { EditorialDeck } from '@/components/editorial'
import {
  useToekomstBron,
  useToekomstSimContext,
} from '@/components/toekomst/state/toekomst-state-provider'
import { toekomstAnkerregel } from './ankerregel'

export function ToekomstAnkerregel({ className = '' }: { className?: string }) {
  const { initialData } = useToekomstBron()
  const { isFixedAnchorMode, ankerStop, heroFireAge, currentAge } = useToekomstSimContext()
  const stand = toekomstAnkerregel({
    isFixedAnchorMode,
    ankerStop,
    heroFireAge,
    currentAge,
    heeftGeboortedatum: Boolean(initialData.effectiveInput?.dateOfBirth),
  })

  if (stand.kind === 'geen') return null
  if (stand.kind === 'wacht') {
    return (
      <EditorialDeck className={className}>
        <span aria-hidden="true">&nbsp;</span>
      </EditorialDeck>
    )
  }
  return (
    <EditorialDeck className={className}>
      <span data-testid="toekomst-ankerregel">{stand.tekst}</span>
    </EditorialDeck>
  )
}
