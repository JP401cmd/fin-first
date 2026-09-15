/**
 * Plan-stoplicht in het menu (15 sep 2026) — het punt naast "De toekomst" in de
 * desktop-zijbalk én de mobiele nav-sheet volgt `PlanStatusProvider`, gevoed door
 * de nagestreamde `<PlanStatusSeed>` uit de layout. Zonder oordeel (`neutral`,
 * ook tijdens het nastreamen) staat er géén punt.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import { NavMenuSheet } from './nav-menu-sheet'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { PlanStatusProvider, PlanStatusSeed } from '@/components/app/plan-status-provider'
import type { LeverageStatus } from '@/lib/leverage-status'

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
}))
// Zelfde chrome-mocks als sidebar.naamgeving.test.tsx — deze suite gaat alleen
// over het statuspunt.
vi.mock('@/components/app/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: () => {}, close: () => {}, isOpen: false }),
}))
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ isHousehold: false, loading: false }),
}))
vi.mock('@/components/app/perspective-switcher', () => ({
  PerspectiveSwitcher: () => null,
}))
vi.mock('@/lib/hooks/use-euro-view', () => ({
  useEuroView: () => ({ view: 'nominaal', setView: () => {}, loading: false }),
}))
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({ unreadCount: 0, openModal: () => {} }),
}))
vi.mock('@/components/app/cashflow-status-provider', () => ({
  useCashflowStatusContext: () => ({}),
}))
vi.mock('@/components/sync/global-sync-button', () => ({
  GlobalSyncButton: () => null,
}))
vi.mock('@/components/sync/sync-report-modal', () => ({
  SyncReportModal: () => null,
}))

function withPlan(status: LeverageStatus | null, ui: React.ReactNode) {
  return (
    <DisplayModeProvider initialMode="full">
      <PlanStatusProvider>
        {status && <PlanStatusSeed status={status} />}
        {ui}
      </PlanStatusProvider>
    </DisplayModeProvider>
  )
}

const sidebar = <Sidebar netWorth={1_100_000} actionCount={0} userInitials="JP" userName="JP" />
const sheet = <NavMenuSheet open onClose={() => {}} />

describe('Plan-stoplicht naast De toekomst — zijbalk', () => {
  afterEach(cleanup)

  it.each([
    ['bad', 'bg-red-500', 'Risico'],
    ['warn', 'bg-amber-500', 'Aandacht'],
    ['good', 'bg-emerald-500', 'Goed op koers'],
  ] as const)('%s → %s', (status, kleur, woord) => {
    render(withPlan(status, sidebar))
    const dot = screen.getByTestId('sidebar-plan-status')
    expect(dot.className).toContain(kleur)
    expect(dot.getAttribute('aria-label')).toBe(`De toekomst: ${woord}`)
    expect(dot.closest('a')?.getAttribute('href')).toBe('/toekomst')
  })

  it('zonder oordeel (nog niet nagestreamd) geen punt', () => {
    render(withPlan(null, sidebar))
    expect(screen.queryByTestId('sidebar-plan-status')).toBeNull()
    render(withPlan('neutral', sidebar))
    expect(screen.queryByTestId('sidebar-plan-status')).toBeNull()
  })
})

describe('Plan-stoplicht naast De toekomst — mobiele nav-sheet', () => {
  afterEach(cleanup)

  it('rood plan → rood punt naast De toekomst', () => {
    render(withPlan('bad', sheet))
    const dot = screen.getByTestId('nav-sheet-plan-status')
    expect(dot.className).toContain('bg-red-500')
    expect(dot.closest('a')?.getAttribute('href')).toBe('/toekomst')
  })

  it('zonder oordeel geen punt', () => {
    render(withPlan(null, sheet))
    expect(screen.queryByTestId('nav-sheet-plan-status')).toBeNull()
  })

  it('een nieuwe seed zonder oordeel (na refresh) haalt het punt weer weg', () => {
    const { rerender } = render(withPlan('bad', sheet))
    expect(screen.getByTestId('nav-sheet-plan-status')).toBeTruthy()
    rerender(withPlan('neutral', sheet))
    expect(screen.queryByTestId('nav-sheet-plan-status')).toBeNull()
  })
})
