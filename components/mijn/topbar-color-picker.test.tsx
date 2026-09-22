import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { TopbarColorPicker, topbarWarnings } from './topbar-color-picker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { DEFAULT_MODULE_COLORS, DEFAULT_TOPBAR_COLOR, TOPBAR_PRESETS } from '@/lib/color-palette'

/**
 * De TopBar-picker op /mijn/uiterlijk (ADR 0174 D3, F2). De rekenkant
 * (contrast, normalisatie) staat in `lib/color-palette.topbar.test.ts`; hier
 * gaat het om wat de gebruiker ziet: presets, voorbeeld, hints en reset.
 */

beforeEach(() => {
  window.localStorage.clear()
  // Stub fetch — setTopbarColor persisteert via de API.
  // @ts-expect-error - vitest globalThis fetch stub
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => ({}) })
})

function renderPicker(initialTopbarColor: string | null = null) {
  return render(
    <ModuleColorProvider initialConfig={DEFAULT_MODULE_COLORS} initialTopbarColor={initialTopbarColor}>
      <TopbarColorPicker />
    </ModuleColorProvider>,
  )
}

function card(): HTMLElement {
  const el = screen.getByText('Balk bovenaan').closest('div.rounded-\\[var\\(--r-lg\\)\\]') as HTMLElement | null
  if (!el) throw new Error('Geen ColorPickerCard voor de balk')
  return el
}

/** Het balkvoorbeeld: het aria-hidden-vlak dat de --topbar-*-vars inline draagt. */
function preview(): HTMLElement {
  const el = card().querySelector<HTMLElement>('[aria-hidden="true"][style*="--topbar-bg"]')
  if (!el) throw new Error('Geen balkvoorbeeld')
  return el
}

describe('TopbarColorPicker', () => {
  it('toont alle zeven presets als knop', () => {
    renderPicker()
    for (const { name } of TOPBAR_PRESETS) {
      expect(within(card()).getByTitle(name)).toBeTruthy()
    }
  })

  it('toont een voorbeeld van de balk in plaats van de 11-tint-strip', () => {
    renderPicker()
    expect(preview().style.getPropertyValue('--topbar-bg')).toBe(DEFAULT_TOPBAR_COLOR)
    expect(within(card()).queryByTitle('Balk bovenaan-500')).toBeNull()
  })

  it('op de standaard: geen waarschuwing en geen resetknop', () => {
    renderPicker()
    expect(within(card()).queryByText(/middentoon/)).toBeNull()
    expect(within(card()).queryByText(/kompas weg/)).toBeNull()
    expect(within(card()).queryByTitle('Reset naar standaard')).toBeNull()
  })

  it('een preset kiezen werkt het voorbeeld bij en markeert de knop', () => {
    renderPicker()
    const knop = within(card()).getByTitle('Aubergine')
    fireEvent.click(knop)
    expect(preview().style.getPropertyValue('--topbar-bg')).toBe('#4a2a45')
    expect(knop.getAttribute('aria-pressed')).toBe('true')
  })

  it('papier waarschuwt voor de statuspunten, in een status-regio, maar blokkeert niet', () => {
    renderPicker()
    fireEvent.click(within(card()).getByTitle('Papier'))
    const hint = within(card()).getByText(/kompas weg/)
    expect(hint.closest('[role="status"]')).not.toBeNull()
    expect(preview().style.getPropertyValue('--topbar-bg')).toBe('#faf9f6')
  })

  it('reset zet de standaard terug', () => {
    renderPicker('#1f2a44')
    expect(preview().style.getPropertyValue('--topbar-bg')).toBe('#1f2a44')
    fireEvent.click(within(card()).getByTitle('Reset naar standaard'))
    expect(preview().style.getPropertyValue('--topbar-bg')).toBe(DEFAULT_TOPBAR_COLOR)
  })
})

describe('topbarWarnings', () => {
  it('geen hint op een donkere balk', () => {
    expect(topbarWarnings('#1f2a44')).toEqual([])
  })

  it('een middentoon noemt de leesbaarheid van de naam, zonder vaktaal', () => {
    const [hint] = topbarWarnings('#777777')
    expect(hint).toMatch(/middentoon/)
    expect(hint).not.toMatch(/:1/)
  })

  it('een lichte balk noemt de statuspunten, niet de naam', () => {
    const hints = topbarWarnings('#faf9f6')
    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatch(/kompas weg/)
  })
})
