/**
 * De mobiele TopBar na ADR 0174: de paginanaam staat links naast de terugknop
 * (of op de gutter als er geen knop is), op een balk in de `--topbar-*`-kleur.
 * De browserchrome volgt die kleur onder `lg`, en alleen daar.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'

type Entry = { pathname: string; title: string; topBar?: { kind: 'rich' | 'simple' | 'hidden' } }
let navState: { activeTab: string; currentStack: Entry[]; pop: () => void } = {
  activeTab: 'kern',
  currentStack: [],
  pop: () => {},
}

vi.mock('./nav-stack-provider', () => ({ useNavStack: () => navState }))
vi.mock('@/lib/hooks/use-home-screen', () => ({
  useHomeScreen: () => ({ homeScreen: 'overzicht', homeHref: '/overzicht' }),
}))
let unreadCount = 0
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({ unreadCount, openModal: () => {} }),
}))
vi.mock('@/components/app/shell/shell-contexts', () => ({ useLeverScores: () => ({}) }))
vi.mock('@/components/app/perspective-switcher', () => ({ PerspectiveSwitcher: () => null }))
vi.mock('@/components/app/shell/lever-compass', () => ({ LeverCompassMobile: () => null }))
vi.mock('@/components/sync/global-sync-button', () => ({ GlobalSyncButton: () => null }))
vi.mock('@/components/sync/sync-report-modal', () => ({ SyncReportModal: () => null }))

import { TopBar } from './top-bar'
import { TOPBAR_THEME_MEDIA } from './theme-color-sync'
import { DEFAULT_TOPBAR_COLOR } from '@/lib/color-palette'

const OVERZICHT: Entry = { pathname: '/overzicht', title: 'Overzicht', topBar: { kind: 'rich' } }
const BEZITTINGEN: Entry = { pathname: '/overzicht/bezittingen', title: 'Bezittingen', topBar: { kind: 'simple' } }

function topbarMetas(): HTMLMetaElement[] {
  return Array.from(document.head.querySelectorAll('meta[data-topbar-theme-color]'))
}

afterEach(() => {
  cleanup()
  document.head.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove())
})

describe('TopBar — de naam staat links naast de terugknop (ADR 0174)', () => {
  it('subpagina: chevron-terug, daarna de naam, links uitgelijnd', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT, BEZITTINGEN], pop: vi.fn() }
    const { container } = render(<TopBar />)

    const terug = screen.getByRole('button', { name: 'Terug' })
    expect(terug.querySelector('svg.lucide-chevron-left')).not.toBeNull()

    const naam = container.querySelector('p[aria-hidden="true"]')!
    expect(naam.textContent).toBe('Bezittingen')
    // Volgorde in de rij: eerst de knop, direct daarna de naam.
    expect(terug.nextElementSibling).toBe(naam)
    expect(naam.className).toContain('text-left')
    expect(naam.className).not.toContain('text-center')
    // Mét knop geen gutter-inspringing: de knop levert de afstand al.
    expect(naam.className).not.toMatch(/\bpl-3\b/)
  })

  it('tab-root zonder terugknop: geen lege placeholder, de naam lijnt op de gutter', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT], pop: vi.fn() }
    const { container } = render(<TopBar />)

    expect(screen.queryByRole('button', { name: 'Terug' })).toBeNull()
    const rij = container.querySelector('header > div')!
    const naam = rij.firstElementChild as HTMLElement
    expect(naam.tagName).toBe('P')
    expect(naam.textContent).toBe('Overzicht')
    expect(naam.className).toMatch(/\bpl-3\b/)
  })

  it('secundaire tab-root: de home-terugknop staat vóór de naam', () => {
    navState = {
      activeTab: 'horizon',
      currentStack: [{ pathname: '/toekomst', title: 'Toekomst', topBar: { kind: 'rich' } }],
      pop: vi.fn(),
    }
    const { container } = render(<TopBar />)

    const home = screen.getByRole('link', { name: 'Terug naar overzicht' })
    expect(home.getAttribute('href')).toBe('/overzicht')
    const naam = container.querySelector('p[aria-hidden="true"]')!
    expect(home.nextElementSibling).toBe(naam)
    expect(naam.textContent).toBe('Toekomst')
  })

  it('de naam blijft een aria-hidden <p>, geen kop (ADR 0110)', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT, BEZITTINGEN], pop: vi.fn() }
    const { container } = render(<TopBar />)
    expect(container.querySelector('h1, h2, h3')).toBeNull()
  })
})

describe('TopBar — kleur via de --topbar-*-tokens', () => {
  it('de balk staat op --topbar-bg en draagt geen module-onderlijn meer', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT, BEZITTINGEN], pop: vi.fn() }
    const { container } = render(<TopBar />)
    const header = container.querySelector('header')!

    expect(header.hasAttribute('data-topbar')).toBe(true)
    expect(header.className).toContain('bg-[var(--topbar-bg)]')
    expect(header.className).not.toContain('--paper')
    expect(header.style.borderBottom).toBe('')
    expect(header.outerHTML).not.toContain('--module-active')
  })

  it('naam en terugknop staan op --topbar-fg', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT, BEZITTINGEN], pop: vi.fn() }
    const { container } = render(<TopBar />)
    expect(container.querySelector('p[aria-hidden="true"]')!.className).toContain('text-[var(--topbar-fg)]')
    expect(screen.getByRole('button', { name: 'Terug' }).className).toContain('text-[var(--topbar-fg)]')
  })

  it('de header zet zelf géén tekstkleur: de uitklapmenu’s erin blijven op inkt', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT], pop: vi.fn() }
    const { container } = render(<TopBar email="jan@example.nl" initials="JS" />)
    expect(container.querySelector('header')!.className).not.toMatch(/\btext-/)
  })

  it('utility-cluster: iconen op muted, avatar omgekeerd', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT], pop: vi.fn() }
    render(<TopBar email="jan@example.nl" initials="JS" />)

    expect(screen.getByRole('link', { name: 'Krant' }).className).toContain('text-[var(--topbar-fg-muted)]')
    expect(screen.getByRole('button', { name: 'Meldingen' }).className).toContain('text-[var(--topbar-fg-muted)]')
    const avatar = screen.getByText('JS')
    expect(avatar.className).toContain('bg-[var(--topbar-fg)]')
    expect(avatar.className).toContain('text-[var(--topbar-bg)]')
  })

  it('de ongelezen-badge krijgt een ring in de balkvoorgrond (rood-500 haalt op leisteen geen 3:1)', () => {
    unreadCount = 3
    try {
      navState = { activeTab: 'kern', currentStack: [OVERZICHT], pop: vi.fn() }
      render(<TopBar email="jan@example.nl" initials="JS" />)
      const badge = screen.getByText('3')
      expect(badge.className).toContain('bg-red-500')
      expect(badge.className).toContain('ring-[var(--topbar-fg)]')
    } finally {
      unreadCount = 0
    }
  })
})

describe('TopBar — de browserchrome volgt de balk (ThemeColorSync)', () => {
  it('zet een theme-color vóór de statische meta, alleen onder lg', () => {
    const statisch = document.createElement('meta')
    statisch.name = 'theme-color'
    statisch.content = '#faf9f6'
    document.head.appendChild(statisch)

    navState = { activeTab: 'kern', currentStack: [OVERZICHT, BEZITTINGEN], pop: vi.fn() }
    render(<TopBar />)

    const [meta] = topbarMetas()
    expect(meta).toBeDefined()
    expect(meta.getAttribute('content')).toBe(DEFAULT_TOPBAR_COLOR)
    expect(meta.getAttribute('media')).toBe(TOPBAR_THEME_MEDIA)
    // De eerste passende meta wint: de onze moet vóór de papier-meta staan.
    const alle = Array.from(document.head.querySelectorAll('meta[name="theme-color"]'))
    expect(alle.indexOf(meta)).toBeLessThan(alle.indexOf(statisch))
    // De statische meta blijft onaangeroerd staan (desktop en buiten de shell).
    expect(statisch.content).toBe('#faf9f6')
  })

  it('ruimt de meta op bij unmount', () => {
    navState = { activeTab: 'kern', currentStack: [OVERZICHT], pop: vi.fn() }
    const { unmount } = render(<TopBar />)
    expect(topbarMetas()).toHaveLength(1)
    unmount()
    expect(topbarMetas()).toHaveLength(0)
  })

  it('zonder balk (kind hidden) geen theme-color: de chrome blijft op papier', () => {
    navState = {
      activeTab: 'kern',
      currentStack: [OVERZICHT, { pathname: '/x', title: 'X', topBar: { kind: 'hidden' } }],
      pop: vi.fn(),
    }
    const { container } = render(<TopBar />)
    expect(container.querySelector('header')).toBeNull()
    expect(topbarMetas()).toHaveLength(0)
  })
})
