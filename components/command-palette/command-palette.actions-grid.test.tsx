import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CommandPalette } from './command-palette'

/**
 * W-006 — de acties in ⌘K staan als knoppen in een grid (2 kolommen mobiel,
 * 3 breder), met icoon, korte titel en korte sublabel. De vier schakelaars
 * noemen hun doelstand ("Switch naar …"); Uitloggen is ondergeschikt.
 *
 * Toetsenbord: ↑/↓ blijft de bestaande platte navigatie over álle items,
 * ←/→ beweegt binnen het grid, ⏎ activeert de geselecteerde knop.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

vi.mock('@/components/sync/global-sync-provider', () => ({
  useGlobalSync: () => ({ triggerGlobalSync: vi.fn(), getBankAttempts: () => ({}) }),
}))

vi.mock('@/components/app/feature-access-provider', () => ({
  useModuleAccess: () => ({
    activeModules: ['inzicht_acties'],
    subscriptions: [],
    isModuleActive: () => true,
    refreshModules: vi.fn(),
  }),
}))

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function grid(): HTMLElement {
  return document.querySelector('[data-cmd-grid="actions"]') as HTMLElement
}

function knoppen(): HTMLElement[] {
  return within(grid()).getAllByRole('option')
}

function geselecteerd(): string {
  const el = document.querySelector('[data-cmd-selected="true"]') as HTMLElement
  return el?.textContent ?? ''
}

describe('CommandPalette — acties als knoppen (W-006)', () => {
  it('rendert de zes acties als knoppen in een 2/3-koloms grid', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    expect(grid().className).toContain('grid-cols-2')
    expect(grid().className).toContain('sm:grid-cols-3')
    expect(knoppen()).toHaveLength(6)
  })

  it('toont per knop icoon, titel en sublabel', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    for (const knop of knoppen()) {
      expect(knop.querySelector('svg')).toBeTruthy()
      expect(knop.querySelectorAll('span.line-clamp-2').length).toBe(2)
    }
  })

  it('vier schakelaars noemen hun doelstand, sync en uitloggen hun werkwoord', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    const titels = knoppen().map((k) => k.querySelector('span')!.textContent)
    expect(titels.filter((t) => t?.startsWith('Switch naar '))).toHaveLength(4)
    expect(titels).toContain('Alles synchroniseren')
    expect(titels).toContain('Uitloggen')
  })

  it('Uitloggen is visueel ondergeschikt (gestippeld, geen vulling)', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    const uitloggen = screen.getByText('Uitloggen').closest('button') as HTMLElement
    expect(uitloggen.dataset.subordinate).toBe('true')
    expect(uitloggen.className).toContain('border-dashed')
    const andere = screen.getByText('Alles synchroniseren').closest('button') as HTMLElement
    expect(andere.dataset.subordinate).toBeUndefined()
  })

  it('pijl rechts/links beweegt binnen het grid en loopt rond', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    const eerste = knoppen()[0].textContent
    const tweede = knoppen()[1].textContent
    const laatste = knoppen()[5].textContent
    expect(geselecteerd()).toBe(eerste)

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(geselecteerd()).toBe(tweede)

    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(geselecteerd()).toBe(laatste)
  })

  it('pijl omlaag blijft de platte navigatie (volgende item)', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(geselecteerd()).toBe(knoppen()[1].textContent)
  })

  it('Enter activeert de geselecteerde knop', () => {
    const onClose = vi.fn()
    render(<CommandPalette open onClose={onClose} userId="u1" />)
    // Naar "Uitloggen" (laatste knop): runner sluit het palet.
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(geselecteerd()).toContain('Uitloggen')
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('zoeken op de oude benaming vindt de schakelaar nog ("verberg")', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    fireEvent.change(screen.getByLabelText('Zoekopdracht'), { target: { value: 'verberg' } })
    expect(within(grid()).getByText('Switch naar verborgen bedragen')).toBeTruthy()
  })

  it('met tekst in het zoekveld blijven links/rechts van de cursor', () => {
    render(<CommandPalette open onClose={vi.fn()} userId="u1" />)
    const input = screen.getByLabelText('Zoekopdracht') as HTMLInputElement
    input.focus()
    fireEvent.change(input, { target: { value: 'switch' } })
    const voor = geselecteerd()
    const event = fireEvent.keyDown(document, { key: 'ArrowRight' })
    // Niet onderschept: geen preventDefault, selectie ongewijzigd.
    expect(event).toBe(true)
    expect(geselecteerd()).toBe(voor)
  })
})
