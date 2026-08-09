/**
 * lever-compass.deeplinks.test.tsx
 *
 * IA-DRIFT-GUARD: de kompas-deeplinks moeten naar de canonieke /overzicht/*-
 * routes wijzen, niet naar de oude legacy-backing-routes (/core/*, /will#...).
 *
 * Achtergrond: UAT-NAV-06 / kaart "Mobiele kompas-deeplinks wijzen naar
 * legacy-routes". `LEVERS` in lever-compass.tsx is de ENIGE bron voor alle vier
 * render-varianten (Mobile/Collapsed/Dots/Expanded). Deze test rendert de
 * varianten en bewijst dat elke deeplink onder /overzicht valt, zodat een
 * toekomstige terugval naar een legacy-route hier meteen faalt.
 */

import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import {
  LeverCompassDots,
  LeverCompassExpanded,
  LeverCompassCollapsed,
  LeverCompassMobile,
} from './lever-compass'
import type { LeverScores } from '@/components/app/shell/lever-scores'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

function makeScores(): LeverScores {
  const entry = { score: 50, status: 'green' as const, detail: 'detail' }
  return { assets: entry, debts: entry, cashflow: entry, tax: entry }
}

function hrefsIn(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')!)
}

describe('lever-compass deeplinks — canonieke /overzicht/*-routes', () => {
  const variants: Array<[string, React.ReactElement]> = [
    ['LeverCompassDots', <LeverCompassDots key="dots" scores={makeScores()} />],
    ['LeverCompassExpanded', <LeverCompassExpanded key="expanded" scores={makeScores()} />],
    ['LeverCompassCollapsed', <LeverCompassCollapsed key="collapsed" scores={makeScores()} />],
  ]

  for (const [name, element] of variants) {
    it(`${name}: alle deeplinks vallen onder /overzicht (geen /core, geen /will)`, () => {
      const { container } = render(element)
      const hrefs = hrefsIn(container)
      expect(hrefs.length).toBe(4)
      for (const href of hrefs) {
        expect(href.startsWith('/overzicht')).toBe(true)
        expect(href).not.toContain('/core/')
        expect(href).not.toContain('/will')
      }
    })
  }

  it('exacte canonieke bestemmingen (spiegelt lib/nav-config.ts)', () => {
    const { container } = render(<LeverCompassDots scores={makeScores()} />)
    const hrefs = hrefsIn(container)
    expect(hrefs).toEqual([
      '/overzicht/bezittingen',
      '/overzicht/schulden',
      '/overzicht/cashflow',
      '/overzicht/belasting',
    ])
  })

  it('LeverCompassMobile: geen legacy-anker en geen legacy-route in het paneel', () => {
    // Expliciet 'full': in Eenvoudig draagt de trigger één samengevat punt met
    // een andere aria-label (NAV-6). Het PANEEL — waar deze test over gaat —
    // is in beide modi identiek; zie lever-compass.simple-view.test.tsx.
    const { container, getByRole } = render(
      <DisplayModeProvider initialMode="full">
        <LeverCompassMobile scores={makeScores()} />
      </DisplayModeProvider>,
    )
    // Paneel is standaard dicht — open het via de trigger-knop.
    fireEvent.click(getByRole('button', { name: 'Kompas openen' }))
    const hrefs = hrefsIn(container)
    expect(hrefs.length).toBe(4)
    for (const href of hrefs) {
      expect(href.startsWith('/overzicht')).toBe(true)
      expect(href).not.toContain('#cashflow')
    }
  })
})
