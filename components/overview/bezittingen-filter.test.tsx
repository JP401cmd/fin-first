import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BezittingenFilter } from './bezittingen-filter'

/**
 * Tests voor BezittingenFilter — dropdown-filter op /overzicht/bezittingen.
 * Mocked next/navigation voor router.push assertions.
 */

const mockPush = vi.fn()
let mockPathname = '/overzicht/bezittingen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}))

beforeEach(() => {
  mockPush.mockReset()
  mockPathname = '/overzicht/bezittingen'
})

describe('BezittingenFilter', () => {
  it('toont default-label "Alle bezittingen"', () => {
    render(<BezittingenFilter />)
    expect(screen.getByText('Alle bezittingen')).toBeTruthy()
  })

  it('opent dropdown bij klik op trigger', () => {
    render(<BezittingenFilter />)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByText('Alle bezittingen'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toont alle 13 asset-types + "Alle bezittingen" in dropdown', () => {
    render(<BezittingenFilter />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    const options = screen.getAllByRole('option')
    expect(options.length).toBe(14) // 13 + "Alle"
  })

  it('navigeert naar /overzicht/bezittingen/[type] bij selectie', () => {
    render(<BezittingenFilter />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    fireEvent.click(screen.getByText('Spaargeld'))
    expect(mockPush).toHaveBeenCalledWith('/overzicht/bezittingen/savings')
  })

  it('navigeert naar /overzicht/bezittingen bij "Alle"-keuze vanuit detail', () => {
    mockPathname = '/overzicht/bezittingen/eigen_huis'
    render(<BezittingenFilter />)
    expect(screen.getByText('Eigen woning')).toBeTruthy()
    fireEvent.click(screen.getByText('Eigen woning'))
    const allOptions = screen.getAllByRole('option')
    fireEvent.click(allOptions[0]!)
    expect(mockPush).toHaveBeenCalledWith('/overzicht/bezittingen')
  })

  it('toont actieve type-label in trigger', () => {
    mockPathname = '/overzicht/bezittingen/crypto'
    render(<BezittingenFilter />)
    expect(screen.getByText('Crypto')).toBeTruthy()
  })

  it('valt terug op "Alle bezittingen" bij onbekend type', () => {
    mockPathname = '/overzicht/bezittingen/onbekend_xyz'
    render(<BezittingenFilter />)
    expect(screen.getByText('Alle bezittingen')).toBeTruthy()
  })

  it('aria-expanded reflecteert dropdown-state', () => {
    const { container } = render(<BezittingenFilter />)
    const trigger = container.querySelector('button[aria-haspopup="listbox"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger!)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })

  it('elke optie heeft min-h-[44px] (WCAG tap-target)', () => {
    const { container } = render(<BezittingenFilter />)
    fireEvent.click(screen.getByText('Alle bezittingen'))
    const options = container.querySelectorAll('[role="option"]')
    options.forEach((opt) => {
      expect(opt.className).toContain('min-h-[44px]')
    })
  })
})
