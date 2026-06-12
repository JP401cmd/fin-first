import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

/** De ColorPickerCard waarvan de zichtbare titel `label` is. */
function cardFor(label: string): HTMLElement {
  // De label-paragraaf zit binnen de kaart-div; pak de dichtstbijzijnde kaart.
  const labelEl = screen.getByText(label)
  // ColorPickerCard root = de buitenste div met border + bg-paper.
  const card = labelEl.closest('div.rounded-\\[var\\(--r-lg\\)\\]') as HTMLElement | null
  if (!card) throw new Error(`Geen ColorPickerCard gevonden voor "${label}"`)
  return card
}

/** Preset-knop binnen een kaart met de gegeven titel (preset.name). */
function presetButton(card: HTMLElement, presetName: string): HTMLButtonElement {
  const btn = within(card).getByTitle(presetName)
  return btn as HTMLButtonElement
}

/** Of een preset-knop als actief gemarkeerd is (border-[var(--ink)]). */
function isActivePreset(btn: HTMLButtonElement): boolean {
  return btn.className.includes('border-[var(--ink)]')
}

describe('ModuleAccentPicker — render', () => {
  it('rendert drie ColorPickerCards (Overzicht / Will & acties / Toekomst)', () => {
    renderPicker()
    expect(screen.getByText('Overzicht')).toBeTruthy()
    expect(screen.getByText('Will & acties')).toBeTruthy()
    expect(screen.getByText('Toekomst')).toBeTruthy()
  })

  it('elke kaart heeft een native color-input + 8 preset-swatches', () => {
    renderPicker()
    const overzicht = cardFor('Overzicht')
    const colorInput = overzicht.querySelector('input[type="color"]')
    expect(colorInput).toBeTruthy()
    // 8 presets per kaart (buttons met title).
    const presets = within(overzicht).getAllByRole('button')
    // alle preset-knoppen hebben een title; reset-knop verschijnt alleen bij afwijking.
    const presetCount = presets.filter((b) => b.getAttribute('title') !== 'Reset naar standaard').length
    expect(presetCount).toBe(8)
  })

  it('default-kleur is gemarkeerd als actieve preset per accent', () => {
    renderPicker()
    // DEFAULT_MODULE_COLORS.kern = #6b4339 = "Aardetint (default)", kaart "Overzicht".
    const overzicht = cardFor('Overzicht')
    expect(isActivePreset(presetButton(overzicht, 'Aardetint (default)'))).toBe(true)
  })

  it('toont kicker label "Accentkleuren"', () => {
    renderPicker()
    expect(screen.getByText('Accentkleuren')).toBeTruthy()
  })
})

describe('ModuleAccentPicker — switching', () => {
  it('klik op andere preset markeert die als actief en deactiveert de default', () => {
    renderPicker()
    const overzicht = cardFor('Overzicht')
    const amber = presetButton(overzicht, 'Amber')
    fireEvent.click(amber)
    expect(isActivePreset(amber)).toBe(true)
    expect(isActivePreset(presetButton(overzicht, 'Aardetint (default)'))).toBe(false)
  })

  it('switch op Will-accent verandert alleen Will, niet Overzicht of Toekomst', () => {
    renderPicker()
    const wil = cardFor('Will & acties')
    fireEvent.click(presetButton(wil, 'Teal'))
    expect(isActivePreset(presetButton(wil, 'Teal'))).toBe(true)
    // Overzicht en Toekomst houden hun default actief.
    expect(isActivePreset(presetButton(cardFor('Overzicht'), 'Aardetint (default)'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Toekomst'), 'Camel (default)'))).toBe(true)
  })

  it('eigen hex via de native color-input roept onChange aan met die hex', () => {
    renderPicker()
    const overzicht = cardFor('Overzicht')
    const colorInput = overzicht.querySelector('input[type="color"]') as HTMLInputElement
    fireEvent.input(colorInput, { target: { value: '#123456' } })
    // De provider schrijft de nieuwe waarde terug → hex-weergave toont #123456.
    expect(within(overzicht).getByText('#123456')).toBeTruthy()
    // Geen enkele preset is nu nog actief (custom kleur valt buiten de 8 presets).
    expect(isActivePreset(presetButton(overzicht, 'Aardetint (default)'))).toBe(false)
  })
})
