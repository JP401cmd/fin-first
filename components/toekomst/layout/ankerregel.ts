// De ankerregel onder de oordeelzin in de /toekomst-kop (ADR 0179 D2, spec §4.2 regel 1).
//
// Pure keuze: WELKE regel de kop toont, gegeven wat de state-provider al weet. De tekst
// zelf komt uit `katernAnkerregel` (kopij-toets §2); hier wordt niets geformuleerd en
// niets gerekend.
//
// Poort: onder "zo vroeg mogelijk" (solved) geen regel zonder geboortedatum — dezelfde
// poort als de server-oordeelzin (`loadPlanStatusInput`, `dekkingBekend`): zonder
// geboortedatum is "vrij mogelijk vanaf je 52e" niet te onderbouwen en is de kop neutraal.
// Onder een vast anker is de regel een instelling ("Je rekent met stoppen op 60."), die
// staat ook zonder geboortedatum.

import { katernAnkerregel } from '@/lib/horizon/katern-copy'
import type { AnkerStop } from '@/lib/horizon/anker-copy'
import type { HeroFireAge } from '@/lib/horizon/hero-fire-age'

export type AnkerregelStand =
  | { readonly kind: 'tekst'; readonly tekst: string }
  /** De kernel rekent nog: ruimte vasthouden (geen layout-sprong), nog niets zeggen. */
  | { readonly kind: 'wacht' }
  /** Geen regel (geen oordeel mogelijk, of een gegevensprobleem dat elders gemeld wordt). */
  | { readonly kind: 'geen' }

export interface AnkerregelInput {
  /** `sim.isFixedAnchorMode` — ligt het stopmoment vast (aow/now/age)? */
  readonly isFixedAnchorMode: boolean
  /** `sim.ankerStop` (`ankerStopFromSim`) — het vaste stopmoment, `null` onder solved. */
  readonly ankerStop: AnkerStop | null
  /** `sim.heroFireAge` — dezelfde bron als KPI 1, zodat kop en KPI nooit uiteenlopen. */
  readonly heroFireAge: Pick<HeroFireAge, 'status' | 'age'>
  /** `sim.currentAge` — voor de verleden-tijd-tak van `ankerVrijZin`. */
  readonly currentAge: number | null
  /** Is de geboortedatum bekend (`effectiveInput.dateOfBirth`)? */
  readonly heeftGeboortedatum: boolean
}

const WACHT: AnkerregelStand = { kind: 'wacht' }
const GEEN: AnkerregelStand = { kind: 'geen' }

export function toekomstAnkerregel(input: AnkerregelInput): AnkerregelStand {
  const { heroFireAge } = input
  if (input.isFixedAnchorMode) {
    if (input.ankerStop != null) {
      return { kind: 'tekst', tekst: katernAnkerregel({ kind: 'vast', stop: input.ankerStop }) }
    }
    return heroFireAge.status === 'berekenen' ? WACHT : GEEN
  }
  if (!input.heeftGeboortedatum) return GEEN
  switch (heroFireAge.status) {
    case 'berekenen':
      return WACHT
    case 'ongeldig':
      // Gegevensprobleem: de gegevensmelding zegt het, niet de kop.
      return GEEN
    case 'onbekend':
      // Niet haalbaar binnen het plan: de nul-tak van `ankerVrijZin`.
      return {
        kind: 'tekst',
        tekst: katernAnkerregel({ kind: 'solved', solvedFireAge: null, currentAge: input.currentAge }),
      }
    default:
      return heroFireAge.age == null
        ? GEEN
        : {
            kind: 'tekst',
            tekst: katernAnkerregel({ kind: 'solved', solvedFireAge: heroFireAge.age, currentAge: input.currentAge }),
          }
  }
}
