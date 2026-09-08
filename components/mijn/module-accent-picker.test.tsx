import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ModuleAccentPicker } from './module-accent-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import {
  DEFAULT_MODULE_COLORS,
  accentClashesWithStatus,
  contrastRatio,
  hexToOklch,
} from '@/lib/color-palette'

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

  it('elke kaart heeft een native color-input + 19 preset-swatches', () => {
    renderPicker()
    for (const label of ['Bezittingen', 'Schulden', 'Budget', 'Fin']) {
      const card = cardFor(label)
      expect(card.querySelector('input[type="color"]')).toBeTruthy()
      // 19 presets per kaart: de default + de achttien ring-tinten.
      const presets = within(card).getAllByRole('button')
      // alle preset-knoppen hebben een title; reset-knop verschijnt alleen bij afwijking.
      const presetCount = presets.filter(
        (b) => b.getAttribute('title') !== 'Reset naar standaard',
      ).length
      expect(presetCount, `kaart ${label}`).toBe(19)
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
    const ultramarijn = presetButton(bezittingen, 'Ultramarijn')
    fireEvent.click(ultramarijn)
    expect(isActivePreset(ultramarijn)).toBe(true)
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

/** De swatch draagt een inline rgb()-achtergrond; terug naar hex om te meten. */
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

/**
 * Acceptatiecriterium 2 van UR3-32 ("een statuskleur blijft te onderscheiden van
 * de identiteitskleur") is op 8 sep 2026 door de eigenaar losgelaten voor de
 * accenten: de ring staat nu op de sRGB-gamutgrens en er is geen status-toets
 * meer op de presets, ook geen waarschuwing.
 *
 * Wat een gecureerd palet dan nog moet waarmaken, en wat deze tests pinnen:
 * leesbaarheid, en dat het écht een palet is (geen bijna-dubbele tinten).
 */
describe('ModuleAccentPicker — wat een gecureerd palet moet waarmaken', () => {
  it('elke preset op elke kaart haalt WCAG AA tegen papier', () => {
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
          contrastRatio(hex, '#faf9f6'),
          `preset "${btn.getAttribute('title')}" op kaart ${label} (${hex})`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  /**
   * Achttien swatches hebben pas zin als ze onderscheidbaar zijn. De ring zelf
   * staat op een raster van 20°; de krapste paren zijn ring-tint tegen de
   * standaard van díé kaart (minimaal 7,1°, Karamel naast Schulden). Onder 6°
   * is het op een swatch geen keuze meer maar ruis — dát is de ondergrens die
   * we hier bewaken, niet de rasterstap.
   */
  it('geen twee swatches op een kaart liggen binnen 6° van elkaar', () => {
    renderPicker()
    const card = cardFor('Bezittingen')
    const hues = within(card)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('title') !== 'Reset naar standaard')
      .map((b) => {
        const span = b.querySelector('span') as HTMLElement
        return { naam: b.getAttribute('title'), h: hexToOklch(rgbToHex(span.style.backgroundColor)).h }
      })
      .sort((a, b) => a.h - b.h)
    for (let i = 1; i < hues.length; i++) {
      const delta = hues[i].h - hues[i - 1].h
      expect(delta, `${hues[i - 1].naam} en ${hues[i].naam} liggen te dicht bij elkaar`)
        .toBeGreaterThan(6)
    }
  })

  /**
   * Het besluit zelf, vastgelegd: er ZIJN nu presets die de status-toets laat
   * waarschuwen (Framboos en Vermiljoen liggen naast "actie"-rood). Wordt deze
   * test rood omdat er geen enkele meer waarschuwt, dan is de oude koppeling
   * stilletjes teruggekropen.
   */
  it('presets mogen bij de stoplichtkleuren liggen — dat is het besluit', () => {
    renderPicker()
    const card = cardFor('Bezittingen')
    const uitkomsten = within(card)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('title') !== 'Reset naar standaard')
      .map((b) => {
        const span = b.querySelector('span') as HTMLElement
        return accentClashesWithStatus(rgbToHex(span.style.backgroundColor))
      })
    expect(uitkomsten).toContain('warn')
  })
})
