import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * Tests voor de weergave-badge (PerspectiveSwitcher). Dekt de
 * handleiding-scenario's die UI-gedrag betreffen: de badge is zichtbaar +
 * wisselbaar voor huishoudens, verborgen voor solo-gebruikers, en toont de
 * actieve weergave duidelijk.
 */

const mockSetPerspective = vi.fn()
let mockState: {
  perspective: 'personal' | 'household' | 'partner'
  isHousehold: boolean
  loading: boolean
  partnerName: string | null
  availablePerspectives: Array<{ id: string; label: string; description: string }>
}

vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ ...mockState, setPerspective: mockSetPerspective, perspectiveVersion: 0 }),
}))

import { PerspectiveSwitcher } from './perspective-switcher'

const AVAIL = [
  { id: 'personal', label: 'Eigen', description: 'Alleen jouw financiën' },
  { id: 'household', label: 'Huishouden', description: 'Samen met je partner' },
  { id: 'partner', label: 'Partner', description: 'De financiën van je partner' },
]

afterEach(() => {
  vi.clearAllMocks()
})

describe('PerspectiveSwitcher (weergave-badge)', () => {
  it('rendert niets voor een solo-gebruiker (geen huishouden)', () => {
    mockState = { perspective: 'personal', isHousehold: false, loading: false, partnerName: null, availablePerspectives: [AVAIL[0]] }
    const { container } = render(<PerspectiveSwitcher />)
    expect(container.querySelector('[data-testid="perspective-switcher"]')).toBeNull()
  })

  it('rendert niets tijdens loading', () => {
    mockState = { perspective: 'household', isHousehold: true, loading: true, partnerName: 'JP', availablePerspectives: AVAIL }
    const { container } = render(<PerspectiveSwitcher />)
    expect(container.querySelector('[data-testid="perspective-switcher"]')).toBeNull()
  })

  it('toont de actieve weergave als badge (huishouden)', () => {
    mockState = { perspective: 'household', isHousehold: true, loading: false, partnerName: 'JP', availablePerspectives: AVAIL }
    render(<PerspectiveSwitcher />)
    const trigger = screen.getByTestId('perspective-switcher-trigger')
    expect(trigger.getAttribute('aria-label')).toContain('Huishouden')
    expect(trigger.textContent).toContain('Huishouden')
  })

  it('opent de dropdown en wisselt het perspectief', () => {
    mockState = { perspective: 'household', isHousehold: true, loading: false, partnerName: 'JP', availablePerspectives: AVAIL }
    render(<PerspectiveSwitcher />)
    fireEvent.click(screen.getByTestId('perspective-switcher-trigger'))
    expect(screen.getByTestId('perspective-dropdown')).toBeTruthy()
    fireEvent.click(screen.getByTestId('perspective-option-partner'))
    expect(mockSetPerspective).toHaveBeenCalledWith('partner')
  })

  it('markeert de actieve optie in de dropdown', () => {
    mockState = { perspective: 'partner', isHousehold: true, loading: false, partnerName: 'JP', availablePerspectives: AVAIL }
    render(<PerspectiveSwitcher />)
    fireEvent.click(screen.getByTestId('perspective-switcher-trigger'))
    expect(screen.getByTestId('perspective-option-partner').getAttribute('data-active')).toBe('true')
    expect(screen.getByTestId('perspective-option-personal').getAttribute('data-active')).toBe('false')
  })

  it('compact-modus toont alleen het icoon (label in aria-label, niet in tekst)', () => {
    mockState = { perspective: 'partner', isHousehold: true, loading: false, partnerName: 'JP', availablePerspectives: AVAIL }
    render(<PerspectiveSwitcher compact />)
    const trigger = screen.getByTestId('perspective-switcher-trigger')
    expect(trigger.getAttribute('aria-label')).toContain('Partner')
    expect(trigger.textContent).not.toContain('Partner')
  })
})
