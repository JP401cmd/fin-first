import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VrijheidStrip } from './vrijheid-strip'

/**
 * ADR 0127 D5/D6 — de strip heeft onder 'Nu stoppen' TWEE substaten, en de
 * framing-vlag alléén kan ze niet onderscheiden: `resolveFreedomFraming` geeft
 * pas 'nu-stoppen' terug bij 100% tijdsdekking, dus het NIET-gedekte geval viel
 * terug op "X% op weg naar het moment dat je niet meer hoeft te werken" —
 * tegen iemand die per aanname al gestopt is.
 *
 * Deze suite pint beide substaten én de toon-invariant: "Je bent vrij" mag hier
 * niet staan zolang het geld maar een paar jaar reikt.
 */

describe('VrijheidStrip — eindstrategie Nu stoppen', () => {
  it('gedekt: noemt het einde van het plan, niet "Je bent vrij"', () => {
    render(
      <VrijheidStrip
        freedomPct={100}
        currentAge={47}
        fireAge={47}
        framing="nu-stoppen"
        nuStoppenReach={{ kind: 'gedekt', endAge: 90 }}
      />,
    )
    expect(screen.getByText(/reikt je vermogen tot je 90e/i)).toBeTruthy()
    expect(screen.queryByText(/Je bent vrij/i)).toBeNull()
  })

  it('tekort: noemt de leeftijd tot waar het geld reikt, geen "% op weg"', () => {
    render(
      <VrijheidStrip
        freedomPct={38}
        currentAge={47}
        fireAge={47}
        // Let op: bij een tekort is de framing 'building' — precies de reden dat
        // de strip een eigen prop krijgt in plaats van op framing te leunen.
        framing="building"
        nuStoppenReach={{ kind: 'reikt-tot', age: 57.5, endAge: 90 }}
      />,
    )
    expect(screen.getByText(/reikt je vermogen tot je 58e/i)).toBeTruthy()
    expect(screen.queryByText('38%')).toBeNull()
    expect(screen.queryByText(/op weg naar het moment/i)).toBeNull()
  })

  it('vandaag al niet gedekt: geen leeftijd, geen belofte', () => {
    render(
      <VrijheidStrip
        freedomPct={0}
        currentAge={47}
        fireAge={47}
        framing="building"
        nuStoppenReach={{ kind: 'nu-op' }}
      />,
    )
    expect(screen.getByText(/vanaf vandaag niet/i)).toBeTruthy()
  })

  it('onbekend bereik valt terug op het bestaande gedrag (geen lege of misleidende kaart)', () => {
    render(
      <VrijheidStrip
        freedomPct={38}
        currentAge={47}
        fireAge={60}
        framing="building"
        nuStoppenReach={{ kind: 'onbekend' }}
      />,
    )
    expect(screen.getByText('38%')).toBeTruthy()
  })

  it('zonder de prop verandert er niets voor de overige strategieën', () => {
    render(<VrijheidStrip freedomPct={42} currentAge={40} fireAge={55} />)
    expect(screen.getByText('42%')).toBeTruthy()
  })
})
