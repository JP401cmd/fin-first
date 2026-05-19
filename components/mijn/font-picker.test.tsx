import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FontPicker } from './font-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS } from '@/lib/color-palette'

/**
 * Tests voor FontPicker — 3 typografie-presets.
 * setFontTheme triggert intern een fetch-call naar /api/preferences;
 * voor unit-tests mocken we de fetch in setup zodat de test in isolatie
 * werkt.
 */

beforeEach(() => {
  window.localStorage.clear()
  // Stub fetch — setFontTheme persisteert via API; we hoeven het netwerk
  // niet echt aan te raken in unit-tests.
  // @ts-expect-error - vitest globalThis fetch stub
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => ({}) })
})

function renderWithProvider() {
  return render(
    <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
      <FontPicker />
    </ModuleColorProvider>,
  )
}

describe('FontPicker — render', () => {
  it('rendert drie typografie-opties', () => {
    renderWithProvider()
    expect(screen.getByText('Editorial')).toBeTruthy()
    expect(screen.getByText('Andada')).toBeTruthy()
    expect(screen.getByText('Digital')).toBeTruthy()
  })

  it('toont "Typografie" kicker', () => {
    renderWithProvider()
    expect(screen.getByText('Typografie')).toBeTruthy()
  })

  it('default actief = Editorial', () => {
    renderWithProvider()
    const editorial = screen.getByText('Editorial').closest('button')
    expect(editorial?.getAttribute('aria-pressed')).toBe('true')
  })

  it('elk thema heeft preview-tekst "Geld is opgeslagen tijd"', () => {
    renderWithProvider()
    expect(screen.getAllByText('Geld is opgeslagen tijd').length).toBe(3)
  })
})

describe('FontPicker — switching', () => {
  it('klik op Digital wisselt aria-pressed', () => {
    renderWithProvider()
    fireEvent.click(screen.getByText('Digital'))
    const digital = screen.getByText('Digital').closest('button')
    expect(digital?.getAttribute('aria-pressed')).toBe('true')
    const editorial = screen.getByText('Editorial').closest('button')
    expect(editorial?.getAttribute('aria-pressed')).toBe('false')
  })
})
