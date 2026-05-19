import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchuldenFilter } from './schulden-filter'

/**
 * Tests voor SchuldenFilter — dropdown-filter op /overzicht/schulden.
 * Mocked next/navigation voor router.push assertions.
 */

const mockPush = vi.fn()
let mockPathname = '/overzicht/schulden'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}))

beforeEach(() => {
  mockPush.mockReset()
  mockPathname = '/overzicht/schulden'
})

describe('SchuldenFilter', () => {
  it('toont default-label "Alle schulden"', () => {
    render(<SchuldenFilter />)
    expect(screen.getByText('Alle schulden')).toBeTruthy()
  })

  it('opent dropdown bij klik op trigger', () => {
    render(<SchuldenFilter />)
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(screen.getByText('Alle schulden'))
    expect(screen.getByRole('listbox')).toBeTruthy()
  })

  it('toont alle 11 debt-types + "Alle schulden" in dropdown', () => {
    render(<SchuldenFilter />)
    fireEvent.click(screen.getByText('Alle schulden'))
    // 1 (Alle) + alle DEBT_TYPE_LABELS waarden
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(10) // 11 + 1
  })

  it('navigeert naar /overzicht/schulden/[type] bij selectie', () => {
    render(<SchuldenFilter />)
    fireEvent.click(screen.getByText('Alle schulden'))
    fireEvent.click(screen.getByText('Hypotheek'))
    expect(mockPush).toHaveBeenCalledWith('/overzicht/schulden/mortgage')
  })

  it('navigeert naar /overzicht/schulden bij "Alle"-keuze vanuit detail', () => {
    mockPathname = '/overzicht/schulden/mortgage'
    render(<SchuldenFilter />)
    // Trigger toont nu "Hypotheek"
    expect(screen.getByText('Hypotheek')).toBeTruthy()
    fireEvent.click(screen.getByText('Hypotheek'))
    const allOptions = screen.getAllByRole('option')
    fireEvent.click(allOptions[0]!) // "Alle schulden"
    expect(mockPush).toHaveBeenCalledWith('/overzicht/schulden')
  })

  it('toont actieve type-label in trigger', () => {
    mockPathname = '/overzicht/schulden/student_loan'
    render(<SchuldenFilter />)
    expect(screen.getByText('Studielening')).toBeTruthy()
  })

  it('valt terug op "Alle schulden" bij onbekend type', () => {
    mockPathname = '/overzicht/schulden/onbekend_type_xyz'
    render(<SchuldenFilter />)
    expect(screen.getByText('Alle schulden')).toBeTruthy()
  })

  it('aria-expanded reflecteert dropdown-state', () => {
    const { container } = render(<SchuldenFilter />)
    const trigger = container.querySelector('button[aria-haspopup="listbox"]')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger!)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')
  })

  it('elke optie heeft min-h-[44px] (WCAG tap-target)', () => {
    const { container } = render(<SchuldenFilter />)
    fireEvent.click(screen.getByText('Alle schulden'))
    const options = container.querySelectorAll('[role="option"]')
    options.forEach((opt) => {
      expect(opt.className).toContain('min-h-[44px]')
    })
  })
})
