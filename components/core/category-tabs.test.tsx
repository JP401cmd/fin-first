/**
 * Tests voor CategoryTabs — de tab-strip van de categorie-pagina's
 * (/overzicht/bezittingen/[type], /overzicht/schulden/[type]).
 *
 * Zwaartepunt: BEZ-4 — de verdiepings-tabs (aandelen-/crypto-holdings,
 * verhuurrendement, hypotheekplanner) zijn Volledig-materiaal en verdwijnen in
 * Eenvoudig uit de tablist, terwijl een expliciete ?tab=…-deeplink bereikbaar
 * blijft.
 *
 * Let op de modus-valkuil (ADR 0026): buiten een `DisplayModeProvider` valt
 * `useDisplayMode()` stil terug op 'simple'. Elke Volledig-assertie rendert
 * hier dus expliciet in `<DisplayModeProvider initialMode="full">` — anders
 * test hij ongemerkt de Eenvoudig-tak.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  DisplayModeProvider,
  type DisplayMode,
} from '@/lib/hooks/use-display-mode'
import { CategoryTabs, type CategoryTab } from './category-tabs'

// Stub fetch zodat een eventuele modus-persist geen netwerk-call doet.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const TABS: CategoryTab[] = [
  { key: 'items', label: 'Posities' },
  { key: 'aandelen-holdings', label: 'Aandelen holdings' },
]

function renderTabs(
  mode: DisplayMode,
  opts: {
    activeKey?: string
    simpleBaseTabKey?: string
    onChange?: (key: string) => void
    tabs?: CategoryTab[]
  } = {},
) {
  const { activeKey = 'items', onChange = () => {}, tabs = TABS } = opts
  // Bewust géén default-parameter: `{ simpleBaseTabKey: undefined }` moet de
  // opt-out testen, en een default zou die undefined stil terugvullen.
  const simpleBaseTabKey = 'simpleBaseTabKey' in opts
    ? opts.simpleBaseTabKey
    : 'items'
  return render(
    <DisplayModeProvider initialMode={mode}>
      <CategoryTabs
        tabs={tabs}
        activeKey={activeKey}
        onChange={onChange}
        simpleBaseTabKey={simpleBaseTabKey}
      />
    </DisplayModeProvider>,
  )
}

function tabLabels(): string[] {
  return screen.getAllByRole('tab').map((el) => el.textContent ?? '')
}

describe('CategoryTabs — BEZ-4 verdiepings-tabs', () => {
  it('toont de verdiepings-tab in Volledig', () => {
    renderTabs('full')
    expect(tabLabels()).toEqual(['Posities', 'Aandelen holdings'])
  })

  it('verbergt de verdiepings-tab in Eenvoudig', () => {
    renderTabs('simple')
    expect(tabLabels()).toEqual(['Posities'])
    expect(screen.queryByText('Aandelen holdings')).toBeNull()
  })

  it('houdt een verdiepings-deeplink bereikbaar in Eenvoudig (tab blijft staan als weg terug)', () => {
    renderTabs('simple', { activeKey: 'aandelen-holdings' })
    expect(tabLabels()).toEqual(['Posities', 'Aandelen holdings'])
    const active = screen
      .getAllByRole('tab')
      .find((el) => el.getAttribute('aria-selected') === 'true')
    expect(active?.textContent).toBe('Aandelen holdings')
  })

  it('laat de tablist ongemoeid zonder simpleBaseTabKey (opt-in gedrag)', () => {
    renderTabs('simple', { simpleBaseTabKey: undefined })
    expect(tabLabels()).toEqual(['Posities', 'Aandelen holdings'])
  })

  it('pijltjes-navigatie blijft binnen de zichtbare tabs in Eenvoudig', () => {
    const onChange = vi.fn()
    renderTabs('simple', { onChange })
    const items = screen.getByRole('tab', { name: 'Posities' })
    // Eén zichtbare tab → ArrowRight rolt terug naar dezelfde tab i.p.v.
    // naar de verborgen verdieping te springen.
    fireEvent.keyDown(items, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('items')
    expect(onChange).not.toHaveBeenCalledWith('aandelen-holdings')
  })

  it('pijltjes-navigatie bereikt de verdieping wél in Volledig', () => {
    const onChange = vi.fn()
    renderTabs('full', { onChange })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Posities' }), {
      key: 'ArrowRight',
    })
    expect(onChange).toHaveBeenCalledWith('aandelen-holdings')
  })
})
