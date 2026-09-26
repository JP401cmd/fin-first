// components/editorial/katern-koppen.test.tsx
//
// KaternKoppen (ADR 0179 D6). Vastgepind wordt wat stil kan breken:
//  1. navigatie met links en `aria-current="page"` op precies de actieve kop;
//  2. samenvatting alleen op inactieve koppen, en dan alleen vanaf lg (CSS, geen
//     JS-breakpoint — anders verschilt server- en client-HTML);
//  3. statuspunt in STOPLICHTkleur met tekstlabel, aantal alleen bij > 1;
//  4. mobiel sticky bovenaan, desktop statisch; raakgebied 44px.

import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KaternKoppen, type KaternKopItem } from './katern-koppen'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'

const ITEMS: KaternKopItem[] = [
  { key: 'plan', label: 'Plan', href: '/toekomst', samenvatting: '61% van je doelbedrag' },
  { key: 'doelen', label: 'Doelen', href: '/toekomst/doelen', samenvatting: 'stopmoment 58 · ruim gedekt' },
  {
    key: 'instellingen',
    label: 'Instellingen',
    href: '/toekomst/instellingen',
    samenvatting: 'nog 2 voorkeuren open · AOW ontbreekt',
    status: { ernst: 'warn', label: 'Instellingen, melding: AOW ontbreekt' },
  },
]

function renderKoppen(actiefKey = 'plan', items = ITEMS) {
  return render(<KaternKoppen items={items} actiefKey={actiefKey} label="Katernen van je toekomstplan" />)
}

describe('KaternKoppen', () => {
  it('is een nav met één link per katern en aria-current op de actieve', () => {
    renderKoppen('doelen')
    const nav = screen.getByRole('navigation', { name: 'Katernen van je toekomstplan' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/toekomst', '/toekomst/doelen', '/toekomst/instellingen'])
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page')).toEqual([
      screen.getByTestId('katern-kop-doelen'),
    ])
  })

  it('samenvatting alleen op inactieve koppen, alleen vanaf lg', () => {
    renderKoppen('plan')
    expect(screen.queryByText('61% van je doelbedrag')).toBeNull()
    const doelen = screen.getByText('stopmoment 58 · ruim gedekt')
    expect(doelen.className).toContain('hidden')
    expect(doelen.className).toContain('lg:block')
  })

  it('statuspunt in stoplichtkleur met tekstlabel, zonder aantal bij één melding', () => {
    renderKoppen('plan')
    const punt = screen.getByTestId('katern-kop-punt-instellingen')
    expect(punt.className).toContain(LEVERAGE_STATUS_DOT.warn)
    expect(punt.getAttribute('aria-hidden')).toBe('true')
    const link = screen.getByTestId('katern-kop-instellingen')
    expect(within(link).getByText('Instellingen, melding: AOW ontbreekt').className).toContain('sr-only')
    expect(within(link).queryByText('1')).toBeNull()
    // Kleur is nooit module-accent.
    expect(punt.className).not.toMatch(/horizon-|kern-|wil-|module-active/)
  })

  it('bij meer dan één melding staat het aantal bij het punt', () => {
    const items: KaternKopItem[] = [
      ITEMS[0],
      { ...ITEMS[1], status: { ernst: 'bad', label: 'Doelen, melding: doel loopt achter', aantal: 3 } },
      ITEMS[2],
    ]
    renderKoppen('plan', items)
    const link = screen.getByTestId('katern-kop-doelen')
    expect(within(link).getByText('3')).toBeTruthy()
    expect(within(link).getByText('Doelen, melding: doel loopt achter (3 meldingen)')).toBeTruthy()
    expect(screen.getByTestId('katern-kop-punt-doelen').className).toContain(LEVERAGE_STATUS_DOT.bad)
  })

  it('mobiel sticky bovenaan, desktop statisch; elke kop ≥ 44px', () => {
    renderKoppen()
    const nav = screen.getByTestId('katern-koppen')
    expect(nav.className).toContain('sticky')
    expect(nav.className).toContain('top-0')
    expect(nav.className).toContain('lg:static')
    for (const link of screen.getAllByRole('link')) expect(link.className).toContain('min-h-[44px]')
  })

  it('rendert geen kop-element (de shell draagt de h1, de pagina de koppen)', () => {
    const { container } = renderKoppen()
    expect(container.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull()
  })
})
