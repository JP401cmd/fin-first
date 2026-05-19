import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BudgetTintPicker } from './budget-tint-picker'
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
      <BudgetTintPicker />
    </ModuleColorProvider>,
  )
}

describe('BudgetTintPicker — render', () => {
  it('rendert vijf categorie-rijen', () => {
    renderPicker()
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.getByText('Sparen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Overig')).toBeTruthy()
  })

  it('toont 6 swatches per categorie (30 totaal)', () => {
    const { container } = renderPicker()
    const swatches = container.querySelectorAll('button[aria-pressed]')
    expect(swatches.length).toBe(30)
  })

  it('default-kleur is geactiveerd per categorie', () => {
    renderPicker()
    expect(
      screen.getByLabelText('Inkomen: Donkergroen (default)').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByLabelText('Schulden: Bordeaux (default)').getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('toont kicker label', () => {
    renderPicker()
    expect(screen.getByText('Budget-categorie-tints')).toBeTruthy()
  })
})

describe('BudgetTintPicker — switching', () => {
  it('klik op andere swatch wisselt aria-pressed', () => {
    renderPicker()
    const emerald = screen.getByLabelText('Inkomen: Emerald')
    fireEvent.click(emerald)
    expect(emerald.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByLabelText('Inkomen: Donkergroen (default)').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('switch op Sparen verandert alleen Sparen-status', () => {
    renderPicker()
    const sky = screen.getByLabelText('Sparen: Sky')
    fireEvent.click(sky)
    expect(sky.getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.getByLabelText('Inkomen: Donkergroen (default)').getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByLabelText('Schulden: Bordeaux (default)').getAttribute('aria-pressed'),
    ).toBe('true')
  })
})
