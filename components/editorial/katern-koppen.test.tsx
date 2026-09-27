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
import { KATERN_MODULE, KaternKoppen, type KaternKopItem } from './katern-koppen'
import { KaternAccentScope, moduleActiveVars } from './katern-accent-scope'
import { LEVERAGE_STATUS_DOT } from '@/lib/leverage-status'

const ITEMS: KaternKopItem[] = [
  { key: 'plan', label: 'Plan', href: '/toekomst', samenvatting: '61% van je doelbedrag' },
  { key: 'doelen', label: 'Doelen', href: '/toekomst/doelen', samenvatting: 'stopmoment 58 · ruim gedekt' },
  {
    key: 'instellingen',
    label: 'Instellingen',
    href: '/toekomst/instellingen',
    samenvatting: 'nog 2 voorkeuren open · AOW ontbreekt',
    status: { ernst: 'warn', label: 'melding: AOW ontbreekt' },
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
    // Eén toegankelijke naam: de kopnaam één keer, dan de melding (C1 punt 5 — was
    // "Instellingen Instellingen, melding: …").
    expect(link).toHaveAccessibleName('Instellingen, melding: AOW ontbreekt')
    expect(within(link).queryByText('1')).toBeNull()
    // Kleur is nooit module-accent.
    expect(punt.className).not.toMatch(/horizon-|kern-|wil-|module-active/)
  })

  it('bij meer dan één melding staat het aantal bij het punt', () => {
    const items: KaternKopItem[] = [
      ITEMS[0],
      { ...ITEMS[1], status: { ernst: 'bad', label: 'melding: doel loopt achter', aantal: 3 } },
      ITEMS[2],
    ]
    renderKoppen('plan', items)
    const link = screen.getByTestId('katern-kop-doelen')
    expect(within(link).getByText('3')).toBeTruthy()
    expect(link).toHaveAccessibleName('Doelen, melding: doel loopt achter (3 meldingen)')
    expect(screen.getByTestId('katern-kop-punt-doelen').className).toContain(LEVERAGE_STATUS_DOT.bad)
  })

  it('de samenvatting blijft voor schermlezers bereikbaar als beschrijving naast de meldingsnaam', () => {
    renderKoppen('plan')
    const link = screen.getByTestId('katern-kop-instellingen')
    expect(link).toHaveAccessibleDescription('nog 2 voorkeuren open · AOW ontbreekt')
    // Zonder melding blijft de naam de inhoud: label plus samenvatting (jsdom telt geen
    // witruimte tussen flex-items; een browser wel).
    const doelen = screen.getByTestId('katern-kop-doelen')
    expect(doelen.hasAttribute('aria-label')).toBe(false)
    expect(doelen).toHaveAccessibleName(/^Doelen\s*stopmoment 58 · ruim gedekt$/)
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

  it('zonder accent: het oorspronkelijke kicker-gedrag (mono, inkt-streep, ink-3 in rust)', () => {
    renderKoppen('plan')
    const actief = screen.getByTestId('katern-kop-plan')
    const rust = screen.getByTestId('katern-kop-doelen')
    expect(actief.className).toContain('border-t-2')
    expect(actief.className).toContain('border-[var(--ink)]')
    expect(rust.className).toContain('text-[var(--ink-3)]')
    expect(rust.className).toContain('border-transparent')
    expect(actief.className).not.toMatch(/--color-(kern|wil|horizon|fin)-/)
    expect(actief.firstElementChild?.className).toContain('font-mono')
    expect(actief.firstElementChild?.className).toContain('uppercase')
    // Geen tab-overloop zonder accent.
    expect(actief.parentElement?.className).not.toContain('-mb-px')
  })
})

describe('KaternKoppen — accent per kop', () => {
  const MET_ACCENT: KaternKopItem[] = [
    { ...ITEMS[0], accent: 'kern' },
    { ...ITEMS[1], accent: 'wil' },
    { ...ITEMS[2], accent: 'horizon' },
  ]

  it('tabbladen: een strook op een basislijn, elke tab een eigen omkaderd vlak met ruimte ertussen', () => {
    renderKoppen('plan', MET_ACCENT)
    const ul = screen.getByTestId('katern-koppen').querySelector('ul')!
    expect(ul.className).toContain('border-b')
    expect(ul.className).toContain('gap-1')
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('border-x')
      expect(link.className).toContain('border-t-[3px]')
      expect(link.className).toContain('border-x-[color:var(--border-ed)]')
    }
  })

  it('inactieve tabs liggen achter: geen eigen tint (op de pagina), ink-2, gedempte accentstreep', () => {
    renderKoppen('plan', MET_ACCENT)
    const doelen = screen.getByTestId('katern-kop-doelen')
    const instellingen = screen.getByTestId('katern-kop-instellingen')
    // Eigenaar 27 sep: een gemengde tint gaf een roze waas — de tab ligt gewoon op de pagina.
    expect(doelen.className).toContain('bg-transparent')
    expect(doelen.className).not.toContain('color-mix')
    expect(doelen.className).toContain('text-[var(--ink-2)]')
    expect(doelen.className).not.toContain('text-[var(--ink-3)]')
    expect(doelen.className).toContain('border-t-[color:var(--color-wil-400)]')
    expect(doelen.className).toContain('hover:border-t-[color:var(--color-wil-500)]')
    expect(instellingen.className).toContain('border-t-[color:var(--color-horizon-400)]')
    // Zwaardere, grotere naam.
    expect(doelen.firstElementChild?.className).toContain('font-display')
    expect(doelen.firstElementChild?.className).toContain('font-semibold')
    expect(doelen.firstElementChild?.className).not.toContain('uppercase')
  })

  it('de actieve tab: sterkere streep, wit (papier, zoals de module eronder), sluit zonder lijn aan; het accent is nooit een vlak', () => {
    renderKoppen('doelen', MET_ACCENT)
    const doelen = screen.getByTestId('katern-kop-doelen')
    expect(doelen.getAttribute('aria-current')).toBe('page')
    expect(doelen.className).toContain('border-t-[color:var(--color-wil-600)]')
    expect(doelen.className).toContain('bg-[var(--paper)]')
    expect(doelen.className).toContain('text-[var(--ink)]')
    expect(doelen.parentElement?.className).toContain('-mb-px')
    // Elke tab vult de rij: vanaf lg maken de samenvattingen van de inactieve tabs de rij
    // hoger, en de actieve (zonder samenvatting) moet dan nog steeds de basislijn raken.
    for (const link of screen.getAllByRole('link')) expect(link.className).toContain('h-full')
    // Geen enkele tab heeft een accent als achtergrond.
    for (const link of screen.getAllByRole('link')) expect(link.className).not.toMatch(/bg-\[var\(--color-/)
  })

  it('de witte katern-module: papier, hairline zonder bovenrand (die is de tabstrook), geen accent-vlak', () => {
    expect(KATERN_MODULE).toContain('bg-[var(--paper)]')
    expect(KATERN_MODULE).toContain('border-t-0')
    expect(KATERN_MODULE).toContain('sm:border-x')
    expect(KATERN_MODULE).not.toMatch(/--color-|module-active/)
  })

  it('raakgebied en hoogte gelijk aan de kicker-variant (één-scherm-eis Doelen mobiel)', () => {
    renderKoppen('doelen', MET_ACCENT)
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('min-h-[44px]')
      expect(link.className).toContain('pt-2.5')
      expect(link.className).toContain('pb-2')
      expect(link.className).not.toMatch(/\b(py|pt|pb)-(3|4|5|6)\b/)
      expect(link.className).toContain('focus-visible:outline-2')
    }
  })

  it('het statuspunt blijft stoplicht, los van het accent; naam en beschrijving ongewijzigd', () => {
    renderKoppen('plan', MET_ACCENT)
    const punt = screen.getByTestId('katern-kop-punt-instellingen')
    expect(punt.className).toContain(LEVERAGE_STATUS_DOT.warn)
    expect(punt.className).not.toMatch(/horizon-|kern-|wil-|fin-|module-active/)
    const link = screen.getByTestId('katern-kop-instellingen')
    expect(link).toHaveAccessibleName('Instellingen, melding: AOW ontbreekt')
    expect(link).toHaveAccessibleDescription('nog 2 voorkeuren open · AOW ontbreekt')
  })
})

describe('KaternAccentScope', () => {
  it('zet --module-active-50..950 op het accent, als contents-wrapper zonder vlak', () => {
    render(
      <KaternAccentScope accent="wil">
        <p>inhoud</p>
      </KaternAccentScope>,
    )
    const scope = screen.getByTestId('katern-accent-scope')
    expect(scope.getAttribute('data-accent')).toBe('wil')
    expect(scope.className).toBe('contents')
    for (const t of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
      expect(scope.style.getPropertyValue(`--module-active-${t}`)).toBe(`var(--color-wil-${t})`)
    }
    // Geen achtergrond, geen padding: het accent is nooit een vlak.
    expect(scope.style.background).toBe('')
    expect(scope.style.backgroundImage).toBe('')
    expect(scope.style.backgroundColor).toBe('')
    expect(screen.getByText('inhoud')).toBeTruthy()
  })

  it('raakt alleen module-active: stoplicht-, status- en fasetokens blijven buiten de scope', () => {
    const vars = Object.keys(moduleActiveVars('horizon'))
    expect(vars).toHaveLength(11)
    for (const v of vars) expect(v).toMatch(/^--module-active-\d+$/)
  })

  it('zonder accent: geen override, de subtree erft het route-accent', () => {
    render(
      <KaternAccentScope>
        <p>inhoud</p>
      </KaternAccentScope>,
    )
    const scope = screen.getByTestId('katern-accent-scope')
    expect(scope.getAttribute('style')).toBeNull()
    expect(scope.hasAttribute('data-accent')).toBe(false)
  })
})
