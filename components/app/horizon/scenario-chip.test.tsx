import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ScenarioChip } from './scenario-chip'

/**
 * Unit-tests voor de ScenarioChip-drieslag (spiegelt `doelLijnLabel` in horizon-client):
 * vastgelegd doel → "Jouw doel" · live wat-als → "Jouw wat-als" · alléén een gekozen
 * stopleeftijd → "Jouw stopkeuze". Label én aria-label horen dezelfde toestand te
 * beschrijven — een chip die "wat-als" zegt zonder gedraaide sliders liegt.
 */

describe('ScenarioChip — drieslag-label', () => {
  it('vastgelegd doel wint: "Jouw doel" (ook mét live wat-als)', () => {
    render(<ScenarioChip doelActief hasScenario />)
    const chip = screen.getByRole('button', { name: /vastgelegde doel/i })
    expect(chip).toHaveTextContent('Jouw doel')
  })

  it('live wat-als zonder doel: "Jouw wat-als"', () => {
    render(<ScenarioChip hasScenario />)
    const chip = screen.getByRole('button', { name: /wat-als-scenario/i })
    expect(chip).toHaveTextContent('Jouw wat-als')
  })

  it('alleen een stopkeuze (geen doel, geen wat-als): "Jouw stopkeuze"', () => {
    render(<ScenarioChip hasScenario={false} />)
    const chip = screen.getByRole('button', { name: /gekozen stopleeftijd/i })
    expect(chip).toHaveTextContent('Jouw stopkeuze')
  })
})
