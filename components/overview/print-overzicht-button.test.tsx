import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PrintOverzichtButton } from './print-overzicht-button'

describe('PrintOverzichtButton — render', () => {
  it('rendert knop met aria-label', () => {
    render(<PrintOverzichtButton />)
    expect(
      screen.getByLabelText(/Overzicht afdrukken of als PDF opslaan/i),
    ).toBeTruthy()
  })

  it('heeft print-hidden class', () => {
    const { container } = render(<PrintOverzichtButton />)
    expect(container.querySelector('.print\\:hidden')).toBeTruthy()
  })

  it('bevat Printer-icoon', () => {
    const { container } = render(<PrintOverzichtButton />)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('toont keyboard-hint in title-attribuut', () => {
    const { container } = render(<PrintOverzichtButton />)
    const button = container.querySelector('button')
    expect(button?.getAttribute('title')).toMatch(/Cmd\/Ctrl \+ P/)
  })
})

describe('PrintOverzichtButton — click', () => {
  it('roept window.print bij klik', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<PrintOverzichtButton />)
    fireEvent.click(screen.getByRole('button'))
    expect(printSpy).toHaveBeenCalled()
    printSpy.mockRestore()
  })
})
