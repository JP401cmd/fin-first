import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PalettePicker } from './palette-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS } from '@/lib/color-palette'

/**
 * Tests voor PalettePicker — 3-preset keuze met persistence via
 * localStorage (`tf-palette-theme`).
 */

beforeEach(() => {
  window.localStorage.clear()
})

function renderWithProvider() {
  return render(
    <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
      <PalettePicker />
    </ModuleColorProvider>,
  )
}

describe('PalettePicker — render', () => {
  it('rendert drie palet-opties', () => {
    renderWithProvider()
    expect(screen.getByText('Cream')).toBeTruthy()
    expect(screen.getByText('Licht')).toBeTruthy()
    expect(screen.getByText('FD-bruin')).toBeTruthy()
  })

  it('toont Palet-kicker label', () => {
    renderWithProvider()
    expect(screen.getByText('Palet')).toBeTruthy()
  })

  it('default actief = Cream', () => {
    renderWithProvider()
    const creamButton = screen.getByText('Cream').closest('button')
    expect(creamButton?.getAttribute('aria-pressed')).toBe('true')
  })

  it('beschrijvingen renderen per preset', () => {
    renderWithProvider()
    expect(screen.getByText(/Warm cream/i)).toBeTruthy()
    expect(screen.getByText(/Lichter cream/i)).toBeTruthy()
    expect(screen.getByText(/Donkerder cream/i)).toBeTruthy()
  })
})

describe('PalettePicker — switching', () => {
  it('klik op andere preset wisselt aria-pressed', () => {
    renderWithProvider()
    fireEvent.click(screen.getByText('Licht'))
    const lichtButton = screen.getByText('Licht').closest('button')
    expect(lichtButton?.getAttribute('aria-pressed')).toBe('true')
    const creamButton = screen.getByText('Cream').closest('button')
    expect(creamButton?.getAttribute('aria-pressed')).toBe('false')
  })

  it('switch persisteert via localStorage', () => {
    renderWithProvider()
    fireEvent.click(screen.getByText('FD-bruin'))
    expect(window.localStorage.getItem('tf-palette-theme')).toBe('fd-bruin')
  })
})
