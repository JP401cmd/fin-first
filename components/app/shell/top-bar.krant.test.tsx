/**
 * Krant 2B — de TopBar van een Krant-account.
 *
 *  - De "← home"-knop op een secundaire tab-root (/mijn/account zit op de tab
 *    'identity') gaat naar /nieuws en heet "Terug naar de Krant" — nooit
 *    "Terug naar overzicht", ook niet als de homescherm-bron nog 'overzicht'
 *    zegt (de productgrens wint).
 *  - Het accountmenu: Mijn → /mijn/account, geen Rapportages, geen sync.
 * Een Geheel-account houdt het label van zijn homescherm-keuze.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import type { FeatureAccessData } from '@/lib/compute-feature-access'

const state = vi.hoisted(() => ({
  home: { homeScreen: 'overzicht', homeHref: '/overzicht' } as { homeScreen: string; homeHref: string },
}))

vi.mock('./nav-stack-provider', () => ({
  useNavStack: () => ({
    activeTab: 'identity',
    currentStack: [{ pathname: '/mijn/account', title: 'Account', topBar: { kind: 'rich' } }],
    pop: () => {},
  }),
}))
vi.mock('@/lib/hooks/use-home-screen', () => ({ useHomeScreen: () => state.home }))
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({ unreadCount: 0, openModal: () => {} }),
}))
vi.mock('@/components/app/shell/shell-contexts', () => ({ useLeverScores: () => ({}) }))
vi.mock('@/components/app/perspective-switcher', () => ({ PerspectiveSwitcher: () => null }))
vi.mock('@/components/app/shell/lever-compass', () => ({ LeverCompassMobile: () => <span>kompas</span> }))
vi.mock('@/components/sync/global-sync-button', () => ({ GlobalSyncButton: () => <span>sync-knop</span> }))
vi.mock('@/components/sync/sync-report-modal', () => ({ SyncReportModal: () => null }))

import { TopBar, homeBackLabelFor } from './top-bar'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'

const DATA = {
  features: {},
  phase: 'stability',
  level: 1,
  subscriptions: [],
  netWorth: 0,
  monthlyExpenses: 0,
  freedomPct: 0,
} as unknown as FeatureAccessData

function renderTopBar(modules: ModuleId[]) {
  return render(
    <FeatureAccessProvider data={DATA} activeModules={modules}>
      <TopBar email="jan@test.nl" initials="JS" />
    </FeatureAccessProvider>,
  )
}

afterEach(() => {
  cleanup()
  state.home = { homeScreen: 'overzicht', homeHref: '/overzicht' }
})

describe('homeBackLabelFor — het label volgt de bestemming', () => {
  it.each([
    ['/nieuws', 'Terug naar de Krant'],
    ['/overzicht/budget', 'Terug naar budgetteren'],
    ['/overzicht', 'Terug naar overzicht'],
  ])('%s → %s', (href, label) => {
    expect(homeBackLabelFor(href)).toBe(label)
  })
})

describe('TopBar voor een Krant-account', () => {
  it('← home gaat naar de Krant, óók als de homescherm-bron nog /overzicht zegt', () => {
    state.home = { homeScreen: 'overzicht', homeHref: '/overzicht' }
    renderTopBar(['nieuws'])
    const terug = screen.getByRole('link', { name: 'Terug naar de Krant' })
    expect(terug.getAttribute('href')).toBe('/nieuws')
    expect(screen.queryByRole('link', { name: 'Terug naar overzicht' })).toBeNull()
  })

  it('accountmenu: Mijn → /mijn/account, geen Rapportages, geen sync, geen kompas', () => {
    renderTopBar(['nieuws'])
    expect(screen.queryByText('kompas')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    const menu = screen.getByRole('menu')
    const hrefs = Array.from(menu.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/mijn/account')
    expect(hrefs).not.toContain('/mijn')
    expect(hrefs).not.toContain('/rapportages')
    expect(menu.textContent).not.toContain('sync-knop')
  })
})

describe('TopBar voor een Geheel-account (ongewijzigd)', () => {
  it('← home volgt de homescherm-keuze', () => {
    state.home = { homeScreen: 'budget', homeHref: '/overzicht/budget' }
    renderTopBar([...ALL_MODULES])
    const terug = screen.getByRole('link', { name: 'Terug naar budgetteren' })
    expect(terug.getAttribute('href')).toBe('/overzicht/budget')
  })

  it('accountmenu: Mijn → /mijn, Rapportages en sync zoals voorheen, kompas zichtbaar', () => {
    renderTopBar([...ALL_MODULES])
    expect(screen.getByText('kompas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    const menu = screen.getByRole('menu')
    const hrefs = Array.from(menu.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/mijn', '/rapportages']))
    expect(menu.textContent).toContain('sync-knop')
  })
})
