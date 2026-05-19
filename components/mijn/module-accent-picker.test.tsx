import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModuleAccentPicker } from './module-accent-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS } from '@/lib/color-palette'

beforeEach(() => {
  window.localStorage.clear()
  // Stub fetch — setConfig persisteert via API.
  // @ts-expect-error - vitest globalThis fetch stub
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => ({}) })
})

function renderPicker() {
  return render(
    <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
      <ModuleAccentPicker />
    </ModuleColorProvider>,
  )
}

describe('ModuleAccentPicker — render', () => {
  it('rendert drie module-rijen (Kern / Wil / Horizon)', () => {
    renderPicker()
    expect(screen.getByText('Kern')).toBeTruthy()
    expect(screen.getByText('Wil')).toBeTruthy()
    expect(screen.getByText('Horizon')).toBeTruthy()
  })

  it('toont 8 swatches per module (24 totaal)', () => {
    const { container } = renderPicker()
    const swatches = container.querySelectorAll('button[aria-pressed]')
    expect(swatches.length).toBe(24)
  })

  it('default-kleur is geactiveerd per module', () => {
    renderPicker()
    // DEFAULT_MODULE_COLORS.kern = #6b4339 = "Aardetint"
    const aardetint = screen.getByLabelText('Kern: Aardetint (default)')
    expect(aardetint.getAttribute('aria-pressed')).toBe('true')
  })

  it('toont kicker label "Module-accentkleuren"', () => {
    renderPicker()
    expect(screen.getByText('Module-accentkleuren')).toBeTruthy()
  })
})

describe('ModuleAccentPicker — switching', () => {
  it('klik op andere swatch wisselt aria-pressed', () => {
    renderPicker()
    const amberKern = screen.getByLabelText('Kern: Amber')
    fireEvent.click(amberKern)
    expect(amberKern.getAttribute('aria-pressed')).toBe('true')
    // Default aardetint moet nu false zijn
    expect(
      screen.getByLabelText('Kern: Aardetint (default)').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('switch op Wil verandert alleen Wil-status, niet Kern of Horizon', () => {
    renderPicker()
    const wilTeal = screen.getByLabelText('Wil: Teal')
    fireEvent.click(wilTeal)
    expect(wilTeal.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByLabelText('Kern: Aardetint (default)').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByLabelText('Horizon: Camel (default)').getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
