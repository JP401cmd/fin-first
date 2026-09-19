import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PalettePicker } from './palette-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS } from '@/lib/color-palette'

/**
 * Tests voor PalettePicker — preset-keuze met persistence via
 * localStorage (`tf-palette-theme`). Het palet "Redactioneel wit" zet daarnaast
 * `data-palette` op <html> (label-typografie-scoping).
 *
 * UR3-30/K3: dat palet heette tot 19 sep 2026 "Krant" — hetzelfde woord als de
 * nieuwsrubriek op /nieuws. Het LABEL is hernoemd, de SLEUTEL (`krant`) niet:
 * die zit in localStorage en in `data-palette`, dus de assertions hieronder
 * pinnen bewust het nieuwe label én de ongewijzigde sleutel.
 */

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.palette
})

function renderWithProvider() {
  return render(
    <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
      <PalettePicker />
    </ModuleColorProvider>,
  )
}

describe('PalettePicker — render', () => {
  it('rendert de vier palet-opties', () => {
    renderWithProvider()
    expect(screen.getByText('Cream')).toBeTruthy()
    expect(screen.getByText('Licht')).toBeTruthy()
    expect(screen.getByText('FD-bruin')).toBeTruthy()
    expect(screen.getByText('Redactioneel wit')).toBeTruthy()
    // Het homoniem is weg: de nieuwsrubriek is de enige "Krant" in de app.
    expect(screen.queryByText('Krant')).toBeNull()
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

  it('Redactioneel wit zet data-palette op <html>; een ander palet wist het weer', () => {
    renderWithProvider()
    fireEvent.click(screen.getByText('Redactioneel wit'))
    expect(document.documentElement.dataset.palette).toBe('krant')
    // Terug naar een palet zonder eigen label-font → attribuut verdwijnt.
    fireEvent.click(screen.getByText('Cream'))
    expect(document.documentElement.dataset.palette).toBeUndefined()
  })
})
