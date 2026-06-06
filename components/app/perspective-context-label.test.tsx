import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

let mockState: {
  perspective: 'personal' | 'household' | 'partner'
  isHousehold: boolean
  loading: boolean
  partnerName: string | null
}

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ ...mockState, setPerspective: vi.fn(), availablePerspectives: [], perspectiveVersion: 0, refreshData: vi.fn() }),
}))

import { PerspectiveContextLabel } from './perspective-context-label'

afterEach(() => vi.clearAllMocks())

describe('PerspectiveContextLabel', () => {
  it('rendert niets in de eigen weergave', () => {
    mockState = { perspective: 'personal', isHousehold: true, loading: false, partnerName: 'JP' }
    const { container } = render(<PerspectiveContextLabel />)
    expect(container.querySelector('[data-testid="perspective-context-label"]')).toBeNull()
  })

  it('rendert niets voor een solo-gebruiker', () => {
    mockState = { perspective: 'household', isHousehold: false, loading: false, partnerName: null }
    const { container } = render(<PerspectiveContextLabel />)
    expect(container.querySelector('[data-testid="perspective-context-label"]')).toBeNull()
  })

  it('toont "Huishouden" in huishoudweergave', () => {
    mockState = { perspective: 'household', isHousehold: true, loading: false, partnerName: 'JP' }
    render(<PerspectiveContextLabel />)
    const chip = screen.getByTestId('perspective-context-label')
    expect(chip.getAttribute('data-perspective')).toBe('household')
    expect(chip.textContent).toContain('Huishouden')
  })

  it('toont de partnernaam in partnerweergave', () => {
    mockState = { perspective: 'partner', isHousehold: true, loading: false, partnerName: 'Lisa' }
    render(<PerspectiveContextLabel />)
    const chip = screen.getByTestId('perspective-context-label')
    expect(chip.getAttribute('data-perspective')).toBe('partner')
    expect(chip.textContent).toContain('Lisa')
  })

  it('valt terug op "Partner" zonder naam', () => {
    mockState = { perspective: 'partner', isHousehold: true, loading: false, partnerName: null }
    render(<PerspectiveContextLabel />)
    expect(screen.getByTestId('perspective-context-label').textContent).toContain('Partner')
  })
})
