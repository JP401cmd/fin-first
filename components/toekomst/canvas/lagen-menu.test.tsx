import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import {
  LAAG_VOLGORDE,
  laagLabel,
  laagUitleg,
  type HoofdlijnGrondslag,
  type LaagId,
} from '@/lib/horizon/katern-copy'
import { LagenMenu } from './lagen-menu'

vi.mock('@/lib/hooks/use-media-query', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsLgUp: vi.fn(() => true),
}))

// De sheet-mechaniek (portal, focus-trap, animatie) is van ShellOverlay zelf en
// elders getest; hier gaat het erom dát mobiel de sheet-kind gebruikt.
vi.mock('@/components/app/shell/shell-overlay', () => ({
  ShellOverlay: ({ open, kind, title, children }: { open: boolean; kind: string; title?: string; children: ReactNode }) =>
    open ? (
      <div data-testid="shell-overlay" data-kind={kind} aria-label={title}>
        {children}
      </div>
    ) : null,
}))

import { useIsLgUp } from '@/lib/hooks/use-media-query'

const UIT = Object.fromEntries(LAAG_VOLGORDE.map((id) => [id, false])) as Record<LaagId, boolean>

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  vi.mocked(useIsLgUp).mockReturnValue(true)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderMenu(
  mode: DisplayMode,
  props: Partial<{
    lagen: Record<LaagId, boolean>
    vast: LaagId[]
    beschikbaar: LaagId[]
    hoofdlijn: HoofdlijnGrondslag
  }> = {},
) {
  const onToggle = vi.fn()
  render(
    <DisplayModeProvider initialMode={mode}>
      <LagenMenu
        lagen={props.lagen ?? { ...UIT, gebeurtenissen: true, mijlpalen: true }}
        vast={props.vast ?? []}
        beschikbaar={props.beschikbaar ?? [...LAAG_VOLGORDE]}
        onToggle={onToggle}
        hoofdlijn={props.hoofdlijn ?? 'liquid'}
      />
    </DisplayModeProvider>,
  )
  return { onToggle }
}

describe('LagenMenu', () => {
  it('desktop: knop "Lagen" opent een popover met kop, labels en uitleg', () => {
    renderMenu('full')
    const knop = screen.getByRole('button', { name: /Lagen/ })
    expect(knop.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(knop)
    expect(knop.getAttribute('aria-expanded')).toBe('true')
    const pop = screen.getByTestId('lagen-popover')
    expect(within(pop).getByText('Lagen op de grafiek')).toBeTruthy()
    for (const id of LAAG_VOLGORDE) {
      expect(within(pop).getByText(laagLabel(id, 'liquid'))).toBeTruthy()
      expect(within(pop).getByText(laagUitleg(id, 'liquid'))).toBeTruthy()
    }
    expect(screen.queryByTestId('shell-overlay')).toBeNull()
  })

  it('huislaag: hoofdlijn zonder je huis ⇒ de laag heet "Met je huis"', () => {
    renderMenu('full', { hoofdlijn: 'liquid' })
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    const rij = screen.getByTestId('laag-metHuis')
    expect(within(rij).getByRole('checkbox', { name: /^Met je huis/ })).toBeTruthy()
    expect(rij.textContent).toContain('De hoofdlijn is het deel waar je direct bij kunt.')
    expect(rij.textContent).not.toContain('Zonder je huis')
  })

  it('huislaag: hoofdlijn met je huis ⇒ de laag heet "Zonder je huis"', () => {
    renderMenu('full', { hoofdlijn: 'total' })
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    const rij = screen.getByTestId('laag-metHuis')
    expect(within(rij).getByRole('checkbox', { name: /^Zonder je huis/ })).toBeTruthy()
    expect(rij.textContent).toContain(
      'De lijn zonder je huis toont het deel van je vermogen waar je direct bij kunt.',
    )
    expect(rij.textContent).not.toContain('Met je huis')
  })

  it('checkbox weerspiegelt de stand en roept onToggle', () => {
    const { onToggle } = renderMenu('full')
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    const cb = screen.getByRole('checkbox', { name: /Gebeurtenissen/ }) as HTMLInputElement
    expect(cb.checked).toBe(true)
    const mc = screen.getByRole('checkbox', { name: /Marktcheck/ }) as HTMLInputElement
    expect(mc.checked).toBe(false)
    fireEvent.click(mc)
    expect(onToggle).toHaveBeenCalledWith('marktcheck')
  })

  it('vaste lagen: aangevinkt, niet te wijzigen, met "vast"', () => {
    renderMenu('full', { vast: ['doelscenario', 'doelen'] })
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    const rij = screen.getByTestId('laag-doelscenario')
    const cb = within(rij).getByRole('checkbox') as HTMLInputElement
    expect(cb.checked).toBe(true)
    expect(cb.disabled).toBe(true)
    expect(within(rij).getByText('vast')).toBeTruthy()
  })

  it('Escape sluit de popover en zet de focus terug op de knop', () => {
    renderMenu('full')
    const knop = screen.getByRole('button', { name: /Lagen/ })
    fireEvent.click(knop)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('lagen-popover')).toBeNull()
    expect(document.activeElement).toBe(knop)
  })

  it('Eenvoudig toont alleen Gebeurtenissen, Mijlpalen, Doelen en Je doelscenario', () => {
    renderMenu('simple')
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    const labels = screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent ?? '')
    expect(labels).toHaveLength(4)
    expect(screen.queryByText('Marktcheck')).toBeNull()
    expect(screen.getByText('Je doelscenario')).toBeTruthy()
  })

  it('alleen beschikbare lagen; zonder beschikbare lagen geen knop', () => {
    renderMenu('full', { beschikbaar: ['gebeurtenissen', 'marktcheck'] })
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
  })

  it('zonder beschikbare lagen rendert niets', () => {
    renderMenu('full', { beschikbaar: [] })
    expect(screen.queryByRole('button', { name: /Lagen/ })).toBeNull()
  })

  it('mobiel: ShellOverlay kind="sheet" in plaats van een popover', () => {
    vi.mocked(useIsLgUp).mockReturnValue(false)
    renderMenu('full')
    fireEvent.click(screen.getByRole('button', { name: /Lagen/ }))
    const sheet = screen.getByTestId('shell-overlay')
    expect(sheet.getAttribute('data-kind')).toBe('sheet')
    expect(within(sheet).getAllByRole('checkbox')).toHaveLength(LAAG_VOLGORDE.length)
    expect(screen.queryByTestId('lagen-popover')).toBeNull()
  })
})
