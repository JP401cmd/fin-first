/**
 * Katernwissel zonder scrollsprong (fixronde C1 punt 7).
 *
 * Wat er misging: de katern-koppen waren gewone `Link`s. Bij een navigatie scrolt Next
 * (layout-router, `InnerScrollAndFocusHandler`) het nieuwe segment in beeld: staat de
 * bovenkant van het nieuwe katern niet in het viewport, dan eerst `scrollTop = 0` en
 * daarna `scrollIntoView()` op het eerste element van het katern (668 px). Twee
 * sprongen per klik.
 *
 * Nu: `scroll={false}` op de koppen (Next scrolt niet), en de layout zelf houdt één regel
 * aan — staan de koppen op hun eigen plek in beeld, dan blijft de pagina staan; kleven
 * ze (mobiel, ver naar beneden gescrold) of zijn ze boven uit beeld, dan komen ze
 * bovenaan het zichtbare deel met het nieuwe katern er direct onder.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ToekomstKaternKoppen, ToekomstKaternAccentScope } from './toekomst-katern-navigatie'
import { KATERN_ACCENT } from './katern-accent'

vi.mock('next/link', () => ({
  default: ({ href, children, scroll, ...rest }: { href: string; children: ReactNode; scroll?: boolean }) => (
    <a href={href} data-scroll={String(scroll)} {...rest}>
      {children}
    </a>
  ),
}))

let segment: string | null = null
vi.mock('next/navigation', () => ({ useSelectedLayoutSegment: () => segment }))

const scrollIntoView = vi.fn()

/** Zet de schermposities van het anker (natuurlijke plek) en de nav (evt. kleef-plek). */
function posities(ankerTop: number, navTop: number) {
  const anker = screen.getByTestId('katern-koppen-anker')
  const nav = screen.getByTestId('katern-koppen')
  anker.getBoundingClientRect = () => ({ top: ankerTop }) as DOMRect
  nav.getBoundingClientRect = () => ({ top: navTop }) as DOMRect
}

beforeEach(() => {
  segment = null
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
  window.history.replaceState(null, '', '/toekomst')
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('ToekomstKaternKoppen — wisselen zonder sprong', () => {
  it('de koppen navigeren zonder Next-scroll (scroll={false})', () => {
    render(<ToekomstKaternKoppen />)
    for (const a of screen.getAllByRole('link')) expect(a.getAttribute('data-scroll')).toBe('false')
  })

  it('koppen op hun eigen plek en in beeld: de pagina blijft staan', () => {
    const { rerender } = render(<ToekomstKaternKoppen />)
    posities(300, 300)
    segment = 'doelen'
    rerender(<ToekomstKaternKoppen />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('de eigen marge van de nav (mt-6 uit de layout) telt niet als kleven', () => {
    const { rerender } = render(<ToekomstKaternKoppen />)
    posities(276, 300)
    screen.getByTestId('katern-koppen').style.marginTop = '24px'
    segment = 'doelen'
    rerender(<ToekomstKaternKoppen />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('kleven de koppen (mobiel, ver gescrold), dan komen ze bovenaan met het katern eronder', () => {
    const { rerender } = render(<ToekomstKaternKoppen />)
    posities(-900, 0)
    segment = 'doelen'
    rerender(<ToekomstKaternKoppen />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.instances[0]).toBe(screen.getByTestId('katern-koppen-anker'))
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
  })

  it('boven uit beeld (desktop, statisch): ook naar boven, één keer', () => {
    const { rerender } = render(<ToekomstKaternKoppen />)
    posities(-50, -50)
    segment = 'instellingen'
    rerender(<ToekomstKaternKoppen />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('elke kop draagt het accent uit KATERN_ACCENT (Fins drie kleuren: Plan kern, Doelen wil, Instellingen horizon)', () => {
    expect(KATERN_ACCENT).toEqual({ plan: 'kern', doelen: 'wil', instellingen: 'horizon' })
    segment = 'doelen'
    render(<ToekomstKaternKoppen />)
    for (const key of ['plan', 'doelen', 'instellingen'] as const) {
      expect(screen.getByTestId(`katern-kop-${key}`).parentElement?.getAttribute('data-accent')).toBe(KATERN_ACCENT[key])
    }
    const doelen = screen.getByTestId('katern-kop-doelen')
    expect(doelen.getAttribute('aria-current')).toBe('page')
    expect(doelen.className).toContain('border-t-[color:var(--color-wil-600)]')
  })

  it('de subpagina krijgt het accent van het actieve katern als module-accent', () => {
    const { rerender } = render(
      <ToekomstKaternAccentScope>
        <p>katern</p>
      </ToekomstKaternAccentScope>,
    )
    const scope = () => screen.getByTestId('katern-accent-scope')
    expect(scope().getAttribute('data-accent')).toBe('kern')
    expect(scope().style.getPropertyValue('--module-active-700')).toBe('var(--color-kern-700)')
    segment = 'instellingen'
    rerender(
      <ToekomstKaternAccentScope>
        <p>katern</p>
      </ToekomstKaternAccentScope>,
    )
    expect(scope().getAttribute('data-accent')).toBe('horizon')
    expect(scope().style.getPropertyValue('--module-active-700')).toBe('var(--color-horizon-700)')
  })

  it('niet bij de eerste render en niet bij een hash (die scrolt zelf naar zijn anker)', () => {
    const { rerender } = render(<ToekomstKaternKoppen />)
    posities(-900, 0)
    rerender(<ToekomstKaternKoppen />)
    expect(scrollIntoView).not.toHaveBeenCalled()
    window.history.replaceState(null, '', '/toekomst/doelen#verken-je-aannames')
    segment = 'doelen'
    rerender(<ToekomstKaternKoppen />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
