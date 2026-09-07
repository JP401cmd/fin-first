import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ModuleAccentPicker } from './module-accent-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS, accentClashesWithStatus } from '@/lib/color-palette'

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

/**
 * Of een preset-knop als actief gemarkeerd is. De knop is sinds M19 het
 * 44×44-raakgebied (`<TapTarget>`); de zichtbare swatch — en dus de
 * actief-rand `border-[var(--ink)]` — zit op de span erbinnen.
 */
function isActivePreset(btn: HTMLButtonElement): boolean {
  if (btn.getAttribute('aria-pressed') !== 'true') return false
  const swatch = btn.querySelector('span')
  return !!swatch?.className.includes('border-[var(--ink)]')
}

describe('ModuleAccentPicker — render', () => {
  it('rendert vier ColorPickerCards (Bezittingen / Schulden / Budget / Fin)', () => {
    renderPicker()
    expect(screen.getByText('Bezittingen')).toBeTruthy()
    expect(screen.getByText('Schulden')).toBeTruthy()
    expect(screen.getByText('Budget')).toBeTruthy()
    expect(screen.getByText('Fin')).toBeTruthy()
  })

  it('elke kaart heeft een native color-input + 8 preset-swatches', () => {
    renderPicker()
    for (const label of ['Bezittingen', 'Schulden', 'Budget', 'Fin']) {
      const card = cardFor(label)
      expect(card.querySelector('input[type="color"]')).toBeTruthy()
      // 8 presets per kaart (buttons met title).
      const presets = within(card).getAllByRole('button')
      // alle preset-knoppen hebben een title; reset-knop verschijnt alleen bij afwijking.
      const presetCount = presets.filter(
        (b) => b.getAttribute('title') !== 'Reset naar standaard',
      ).length
      expect(presetCount, `kaart ${label}`).toBe(8)
    }
  })

  it('default-kleur is gemarkeerd als actieve preset per accent', () => {
    renderPicker()
    expect(isActivePreset(presetButton(cardFor('Bezittingen'), 'Groen (standaard)'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Schulden'), 'Terracotta (standaard)'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Budget'), 'Staalsblauw (standaard)'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Fin'), 'Plum (standaard)'))).toBe(true)
  })

  it('toont kicker label "Accentkleuren"', () => {
    renderPicker()
    expect(screen.getByText('Accentkleuren')).toBeTruthy()
  })

  /**
   * Acceptatiecriterium 3 uit UR3-32: het moet vastgelegd én zichtbaar zijn
   * welk accent welk deel van Fins gezicht kleurt. De uitleg boven de kaarten
   * is die zichtbare vastlegging; `fin-dots.tsx` leest de bijbehorende vars.
   */
  it('legt zichtbaar vast welk accent welke stip van Fin kleurt', () => {
    renderPicker()
    const uitleg = screen.getByText(/linkeroog Bezittingen/i)
    expect(uitleg.textContent).toContain('rechteroog Schulden')
    expect(uitleg.textContent).toContain('onderste stip')
    expect(uitleg.textContent).toContain('Budget')
  })
})

describe('ModuleAccentPicker — switching', () => {
  it('klik op andere preset markeert die als actief en deactiveert de default', () => {
    renderPicker()
    const bezittingen = cardFor('Bezittingen')
    const indigo = presetButton(bezittingen, 'Indigo')
    fireEvent.click(indigo)
    expect(isActivePreset(indigo)).toBe(true)
    expect(isActivePreset(presetButton(bezittingen, 'Groen (standaard)'))).toBe(false)
  })

  it('switch op het Fin-accent verandert alleen Fin, niet de drie hefbomen', () => {
    renderPicker()
    const fin = cardFor('Fin')
    fireEvent.click(presetButton(fin, 'Petrol'))
    expect(isActivePreset(presetButton(fin, 'Petrol'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Bezittingen'), 'Groen (standaard)'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Schulden'), 'Terracotta (standaard)'))).toBe(true)
    expect(isActivePreset(presetButton(cardFor('Budget'), 'Staalsblauw (standaard)'))).toBe(true)
  })

  it('eigen hex via de native color-input roept onChange aan met die hex', () => {
    renderPicker()
    const bezittingen = cardFor('Bezittingen')
    const colorInput = bezittingen.querySelector('input[type="color"]') as HTMLInputElement
    fireEvent.input(colorInput, { target: { value: '#123456' } })
    // De provider schrijft de nieuwe waarde terug → hex-weergave toont #123456.
    expect(within(bezittingen).getByText('#123456')).toBeTruthy()
    // Geen enkele preset is nu nog actief (custom kleur valt buiten de 8 presets).
    expect(isActivePreset(presetButton(bezittingen, 'Groen (standaard)'))).toBe(false)
  })
})

/**
 * Acceptatiecriterium 2 uit UR3-32: welke accentkeuze de gebruiker ook maakt,
 * een statuskleur moet te onderscheiden blijven van een identiteitskleur. De
 * voorkeuzes mogen daarom nooit in de verzadigde stoplichtband landen; een
 * eigen kleur mag dat wel, maar dan waarschuwt de kaart.
 */
describe('ModuleAccentPicker — identiteit botst niet met de status', () => {
  it('elke preset op elke kaart zit in de accent-band', () => {
    renderPicker()
    for (const label of ['Bezittingen', 'Schulden', 'Budget', 'Fin']) {
      const card = cardFor(label)
      const swatches = within(card)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('title') !== 'Reset naar standaard')
      for (const btn of swatches) {
        const span = btn.querySelector('span') as HTMLElement
        const hex = rgbToHex(span.style.backgroundColor)
        expect(
          accentClashesWithStatus(hex),
          `preset "${btn.getAttribute('title')}" op kaart ${label} (${hex})`,
        ).toBe('ok')
      }
    }
  })

  it('een verzadigde statuskleur als eigen kleur levert een zichtbare waarschuwing', () => {
    renderPicker()
    const card = cardFor('Bezittingen')
    const colorInput = card.querySelector('input[type="color"]') as HTMLInputElement
    // #10b981 = emerald-500 = precies de "op koers"-stoplichtkleur.
    fireEvent.input(colorInput, { target: { value: '#10b981' } })
    expect(within(card).getByText(/lijkt op een statuskleur/i)).toBeTruthy()
  })
})

/** jsdom geeft inline background-color terug als `rgb(r, g, b)`. */
function rgbToHex(value: string): string {
  const m = value.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!m) return value
  return (
    '#' +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, '0'))
      .join('')
  )
}
