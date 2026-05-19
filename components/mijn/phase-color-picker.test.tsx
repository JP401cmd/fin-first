import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PhaseColorPicker } from './phase-color-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS } from '@/lib/color-palette'

beforeEach(() => {
  window.localStorage.clear()
  // @ts-expect-error - vitest globalThis fetch stub
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => ({}) })
})

function renderPicker() {
  return render(
    <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS}>
      <PhaseColorPicker />
    </ModuleColorProvider>,
  )
}

describe('PhaseColorPicker — render', () => {
  it('rendert vier fase-rijen', () => {
    renderPicker()
    expect(screen.getByText('Recovery')).toBeTruthy()
    expect(screen.getByText('Stability')).toBeTruthy()
    expect(screen.getByText('Momentum')).toBeTruthy()
    expect(screen.getByText('Mastery')).toBeTruthy()
  })

  it('toont 6 swatches per fase (24 totaal)', () => {
    const { container } = renderPicker()
    const swatches = container.querySelectorAll('button[aria-pressed]')
    expect(swatches.length).toBe(24)
  })

  it('default-kleur is geactiveerd per fase', () => {
    renderPicker()
    expect(
      screen.getByLabelText('Recovery: Donkerrood (default)').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByLabelText('Mastery: Goud (default)').getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('toont kicker label + per-fase beschrijving', () => {
    renderPicker()
    expect(screen.getByText('Phase-kleuren')).toBeTruthy()
    expect(screen.getByText(/Herstel-fase/i)).toBeTruthy()
    expect(screen.getByText(/Fundament-fase/i)).toBeTruthy()
  })
})

describe('PhaseColorPicker — switching', () => {
  it('klik op andere swatch wisselt aria-pressed', () => {
    renderPicker()
    const violet = screen.getByLabelText('Momentum: Violet')
    fireEvent.click(violet)
    expect(violet.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByLabelText('Momentum: Plum (default)').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('switch op Recovery verandert alleen Recovery-status', () => {
    renderPicker()
    const bordeaux = screen.getByLabelText('Recovery: Bordeaux')
    fireEvent.click(bordeaux)
    expect(bordeaux.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByLabelText('Stability: Staalsblauw (default)').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByLabelText('Mastery: Goud (default)').getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
