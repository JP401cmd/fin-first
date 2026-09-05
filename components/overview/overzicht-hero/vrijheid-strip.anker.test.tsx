import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VrijheidStrip } from './vrijheid-strip'
import { ankerZin } from '@/lib/horizon/anker-copy'

/**
 * ADR 0129 F3b — de strip onder een VAST anker (aow/age/now), per toestand. De
 * gerenderde drieslag en de bereik-zin worden gepind tegen de ADR-bijlage en de
 * canonieke kopij (`ankerZin`) voor dezelfde invoer. "Je bent vrij" alleen bij
 * framing 'free' (anker bereikt ∧ dekking ≥ 100, D8).
 */

describe('VrijheidStrip — age-anker', () => {
  it('gedekt: "Plan gedekt tot je 90e · stopmoment 58,5 · vrij mogelijk vanaf 55" + de bereik-zin', () => {
    const reach = { kind: 'gedekt' as const, endAge: 90 }
    const stop = { kind: 'age' as const, stopAge: 58.5 }
    render(
      <VrijheidStrip
        freedomPct={100}
        currentAge={45}
        fireAge={58}
        framing="anchored"
        ankerReach={reach}
        ankerStop={stop}
        solvedFireAge={55.2}
        planEndAge={90}
      />,
    )
    expect(screen.getByTestId('vrijheid-strip-anker')).toHaveTextContent(
      'Plan gedekt tot je 90e · stopmoment 58,5 · vrij mogelijk vanaf 55',
    )
    expect(screen.getByText(ankerZin(reach, stop))).toBeTruthy()
    expect(screen.queryByText(/Je bent vrij/i)).toBeNull()
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('tekort: "Reikt tot je 83e · stopmoment 58,5 · plan loopt tot 90"; geen "% op weg"', () => {
    render(
      <VrijheidStrip
        freedomPct={62}
        currentAge={45}
        fireAge={58}
        framing="anchored"
        ankerReach={{ kind: 'reikt-tot', age: 83.4, endAge: 90 }}
        ankerStop={{ kind: 'age', stopAge: 58.5 }}
        solvedFireAge={null}
      />,
    )
    expect(screen.getByTestId('vrijheid-strip-anker')).toHaveTextContent(
      'Reikt tot je 83e · stopmoment 58,5 · plan loopt tot 90',
    )
    expect(screen.queryByText('62%')).toBeNull()
    expect(screen.queryByText(/op weg naar het moment/i)).toBeNull()
    expect(screen.getByText('Je rekent met stoppen op 58,5')).toBeTruthy()
  })

  it('zonder tweede run valt "vrij mogelijk vanaf" weg (D7 staat dat toe)', () => {
    render(
      <VrijheidStrip
        freedomPct={100}
        currentAge={45}
        framing="anchored"
        ankerReach={{ kind: 'gedekt', endAge: 90 }}
        ankerStop={{ kind: 'age', stopAge: 60 }}
      />,
    )
    expect(screen.getByTestId('vrijheid-strip-anker')).toHaveTextContent('Plan gedekt tot je 90e · stopmoment 60')
    expect(screen.getByTestId('vrijheid-strip-anker')).not.toHaveTextContent('vrij mogelijk vanaf')
  })
})

describe('VrijheidStrip — aow-anker', () => {
  it('tekort onder aow: geen woord AOW in de zin (het tekort kan ook ná AOW vallen)', () => {
    const { container } = render(
      <VrijheidStrip
        freedomPct={40}
        currentAge={64}
        framing="anchored"
        ankerReach={{ kind: 'reikt-tot', age: 79, endAge: 90 }}
        ankerStop={{ kind: 'aow', stopAge: 67 }}
      />,
    )
    expect(screen.getByTestId('vrijheid-strip-anker')).toHaveTextContent('Reikt tot je 79e · stopmoment 67 · plan loopt tot 90')
    expect(container.textContent).not.toMatch(/\bAOW\b/)
  })

  it('anker bereikt ∧ gedekt (framing free): "Je bent met pensioen." — niet de anker-strip', () => {
    render(
      <VrijheidStrip
        freedomPct={100}
        currentAge={68}
        fireAge={67}
        framing="free"
        freeAsPensioen
        ankerReach={{ kind: 'gedekt', endAge: 90 }}
        ankerStop={{ kind: 'aow', stopAge: 67 }}
      />,
    )
    expect(screen.getByText('Je bent met pensioen.')).toBeTruthy()
    expect(screen.queryByTestId('vrijheid-strip-anker')).toBeNull()
  })
})

describe('VrijheidStrip — nu-anker', () => {
  it('"stopmoment" valt weg (het is vandaag); de zin is byte-identiek aan de F3a-alias', () => {
    render(
      <VrijheidStrip
        freedomPct={38}
        currentAge={47}
        framing="anchored"
        ankerReach={{ kind: 'reikt-tot', age: 57.5, endAge: 90 }}
        ankerStop={{ kind: 'now' }}
      />,
    )
    expect(screen.getByTestId('vrijheid-strip-anker')).toHaveTextContent('Reikt tot je 58e · plan loopt tot 90')
    expect(screen.getByTestId('vrijheid-strip-anker')).not.toHaveTextContent('stopmoment')
    expect(screen.getByText(/Als je nu stopt, reikt je liquide vermogen tot je 58e/)).toBeTruthy()
  })
})

describe('VrijheidStrip — solved blijft ongewijzigd', () => {
  it('zonder anker-props: "X% op weg"', () => {
    render(<VrijheidStrip freedomPct={42} currentAge={40} fireAge={55} />)
    expect(screen.getByText('42%')).toBeTruthy()
  })
})
