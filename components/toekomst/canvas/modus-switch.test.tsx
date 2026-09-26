import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { ModusSwitch, type ModusSwitchProps } from './modus-switch'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderSwitch(mode: DisplayMode, props: Partial<ModusSwitchProps> = {}) {
  const onChange = vi.fn()
  const onSubChange = vi.fn()
  render(
    <DisplayModeProvider initialMode={mode}>
      <ModusSwitch value="vermogen" onChange={onChange} sub="lijnen" onSubChange={onSubChange} {...props} />
    </DisplayModeProvider>,
  )
  return { onChange, onSubChange }
}

describe('ModusSwitch', () => {
  it('is een radiogroup met Vermogen · Samenstelling · Geldstroom', () => {
    renderSwitch('full')
    const groep = screen.getByRole('radiogroup', { name: 'Weergave van de grafiek' })
    const radios = within(groep).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Vermogen', 'Samenstelling', 'Geldstroom'])
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1])
  })

  it('klik en pijltoetsen kiezen een modus', () => {
    const { onChange } = renderSwitch('full')
    fireEvent.click(screen.getByRole('radio', { name: 'Samenstelling' }))
    expect(onChange).toHaveBeenLastCalledWith('samenstelling')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Vermogen' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('geldstroom')
  })

  it('de sub-toggle staat er alleen bij Geldstroom', () => {
    renderSwitch('full')
    expect(screen.queryByRole('radiogroup', { name: 'Geldstroom tonen als' })).toBeNull()
  })

  it('Volledig: Lijnen en Bronnen', () => {
    const { onSubChange } = renderSwitch('full', { value: 'geldstroom' })
    const sub = screen.getByRole('radiogroup', { name: 'Geldstroom tonen als' })
    expect(within(sub).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Lijnen', 'Bronnen'])
    fireEvent.click(within(sub).getByRole('radio', { name: 'Bronnen' }))
    expect(onSubChange).toHaveBeenCalledWith('bronnen')
  })

  it('Eenvoudig: alleen Lijnen (via HideInSimple)', () => {
    renderSwitch('simple', { value: 'geldstroom' })
    const sub = screen.getByRole('radiogroup', { name: 'Geldstroom tonen als' })
    expect(within(sub).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Lijnen'])
  })

  it('beperkt tot de modi van het katern', () => {
    renderSwitch('full', { modi: ['vermogen'] })
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })

  it('raakgebied 44px onder lg', () => {
    renderSwitch('full')
    for (const r of screen.getAllByRole('radio')) expect(r.className).toContain('min-h-[44px]')
  })
})

describe('ModusSwitch — mobiel één keuzelijst (spec §4.4, ADR 0179 D7)', () => {
  it('onder lg een keuzelijst van 44px, vanaf lg de segmented control', () => {
    const { onChange } = renderSwitch('full')
    const menu = screen.getByTestId('modus-menu') as HTMLSelectElement
    expect(menu.closest('label')!.className).toContain('lg:hidden')
    expect(menu.className).toContain('min-h-[44px]')
    expect(screen.getByTestId('modus-switch').className).toContain('hidden lg:inline-flex')
    expect(Array.from(menu.options).map((o) => o.textContent)).toEqual(['Vermogen', 'Samenstelling', 'Geldstroom'])
    fireEvent.change(menu, { target: { value: 'samenstelling' } })
    expect(onChange).toHaveBeenCalledWith('samenstelling')
    expect(screen.getByLabelText('Weergave van de grafiek', { selector: 'select' })).toBe(menu)
  })

  it('één modus: geen keuzelijst', () => {
    renderSwitch('full', { modi: ['vermogen'] })
    expect(screen.queryByTestId('modus-menu')).toBeNull()
  })
})
