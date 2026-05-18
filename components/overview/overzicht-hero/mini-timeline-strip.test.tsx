import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniTimelineStrip } from './mini-timeline-strip'

/**
 * Tests voor de mini-tijdslijn-strip op /overzicht hero. Pure stateless
 * render-component met props currentAge, endAge, freedomPct, isPensioenMode.
 */

describe('MiniTimelineStrip', () => {
  it('toont vandaag-leeftijd + vrijheidsleeftijd', () => {
    render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={40}
        isPensioenMode={false}
      />,
    )
    expect(screen.getByText('35 jaar')).toBeTruthy()
    expect(screen.getByText('60 jaar')).toBeTruthy()
  })

  it('toont "25 jaar te gaan" als counter', () => {
    render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={40}
        isPensioenMode={false}
      />,
    )
    expect(screen.getByText('25 jaar te gaan')).toBeTruthy()
  })

  it('toont label "Vrijheid" bij niet-pensioen modus', () => {
    render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={40}
        isPensioenMode={false}
      />,
    )
    expect(screen.getByText('Vrijheid')).toBeTruthy()
  })

  it('toont label "Pensioen" bij pensioen-modus', () => {
    render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={67}
        freedomPct={40}
        isPensioenMode={true}
      />,
    )
    expect(screen.getByText('Pensioen')).toBeTruthy()
  })

  it('toont "Bereikt"-variant wanneer currentAge ≥ endAge', () => {
    render(
      <MiniTimelineStrip
        currentAge={62}
        endAge={60}
        freedomPct={100}
        isPensioenMode={false}
      />,
    )
    expect(screen.getByText('Bereikt — je bent vrij')).toBeTruthy()
  })

  it('toont "Bereikt" ook exact op endAge (= currentAge)', () => {
    render(
      <MiniTimelineStrip
        currentAge={60}
        endAge={60}
        freedomPct={100}
        isPensioenMode={false}
      />,
    )
    expect(screen.getByText('Bereikt — je bent vrij')).toBeTruthy()
  })

  it('Link wijst naar /toekomst', () => {
    const { container } = render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={40}
        isPensioenMode={false}
      />,
    )
    const link = container.querySelector('a[href="/toekomst"]')
    expect(link).toBeTruthy()
  })

  it('progressbar heeft correcte aria-valuenow', () => {
    const { container } = render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={42.5}
        isPensioenMode={false}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('43')
  })

  it('progressbar capped op 100 bij waardes >100', () => {
    const { container } = render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={150}
        isPensioenMode={false}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('100')
  })

  it('progressbar capped op 0 bij negatieve waardes', () => {
    const { container } = render(
      <MiniTimelineStrip
        currentAge={35}
        endAge={60}
        freedomPct={-20}
        isPensioenMode={false}
      />,
    )
    const bar = container.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('0')
  })
})
