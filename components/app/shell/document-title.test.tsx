/**
 * UR3-17 #22 — het browsertabblad toonde op ~78 van de 119 (app)-pagina's de
 * LANDINGSTITEL ("Ken je waarheid. Kies je vrijheid…"), omdat
 * `app/(app)/layout.tsx` geen eigen `metadata` had en per-pagina metadata voor
 * de 41 `'use client'`-pagina's onmogelijk is.
 *
 * De paginanaam komt daarom uit dezelfde bron als de enige <h1> van de route
 * (`resolveRouteTitle`, ADR 0110) en wordt door de shell op `document.title`
 * gezet. Deze test bewaakt die koppeling — niet de exacte woorden: de
 * verwachting wordt uit `resolveRouteTitle` zelf afgeleid, zodat een
 * hernoemde route hier geen vals alarm geeft maar een losgeraakte bron wél.
 *
 * Bijt-proef: zonder het effect in mobile-stack-shell.tsx blijft de titel op
 * de jsdom-default staan en faalt de eerste assertie.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MobileStackShell } from './mobile-stack-shell'
import { NavStackProvider } from './nav-stack-provider'
import { resolveRouteTitle } from '@/lib/nav-config'

const PAD = '/overzicht'
// Route zonder naam in de nav-config: /beheer heeft juist wél een eigen
// `metadata.title`, dus daar moet de shell van de titel afblijven.
const PAD_ZONDER_NAAM = '/beheer/architectuur'

let huidigPad = PAD

vi.mock('next/navigation', () => ({
  usePathname: () => huidigPad,
  useRouter: () => ({ back: () => {}, push: () => {}, replace: () => {} }),
}))

// De chrome is voor deze test irrelevant; mocken scheelt een stapel providers.
vi.mock('./top-bar', () => ({ TopBar: () => null }))
vi.mock('./mobile-bottom-bar', () => ({ MobileBottomBar: () => null }))
vi.mock('./pull-refresh-indicator', () => ({ PullRefreshIndicator: () => null }))

// jsdom implementeert `Element.scrollTo` niet; de scroll-reset van de shell
// roept 'm bij mount aan. Stub 'm zodat de titel-effecten aan bod komen.
beforeAll(() => {
  if (!('scrollTo' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: () => {}, writable: true })
  }
})

describe('ShellFrame — tabtitel volgt de paginanaam (UR3-17 #22)', () => {
  beforeEach(() => {
    huidigPad = PAD
  })

  it('zet document.title op "<paginanaam> — TriFinity"', () => {
    document.title = 'iets-anders'
    render(
      <NavStackProvider>
        <MobileStackShell>
          <div>PAGINA</div>
        </MobileStackShell>
      </NavStackProvider>,
    )

    const naam = resolveRouteTitle(PAD)
    expect(naam).toBeTruthy()
    expect(document.title).toBe(`${naam} — TriFinity`)
  })

  it('gebruikt dezelfde naam als de enige <h1> van de route', () => {
    document.title = 'iets-anders'
    const { container } = render(
      <NavStackProvider>
        <MobileStackShell>
          <div>PAGINA</div>
        </MobileStackShell>
      </NavStackProvider>,
    )

    const h1 = container.querySelector('h1')
    expect(h1?.textContent).toBeTruthy()
    expect(document.title).toBe(`${h1!.textContent} — TriFinity`)
  })

  it('laat de titel met rust op een route zonder naam in de nav-config', () => {
    // Die routes (/beheer/**) dragen hun eigen `metadata.title`; overschrijven
    // met de kale default zou daar een verslechtering zijn.
    expect(resolveRouteTitle(PAD_ZONDER_NAAM)).toBeNull()
    huidigPad = PAD_ZONDER_NAAM
    document.title = 'Architectuur — Beheer'
    render(
      <NavStackProvider>
        <MobileStackShell>
          <div>PAGINA</div>
        </MobileStackShell>
      </NavStackProvider>,
    )
    expect(document.title).toBe('Architectuur — Beheer')
  })
})
