/**
 * Krant 2B — het ⌘K-palet voor een Krant-account.
 *
 * Een Krant-account ziet in het palet alleen wat binnen de productgrens ligt:
 *   - pagina's: alleen de grensroutes (navSurfaceFor);
 *   - acties: alleen de acties met `krantZichtbaar` (bedragen verbergen,
 *     weergave, uitloggen) — geen startscherm-wissel, geen sync, geen
 *     euro-weergave, geen perspectief;
 *   - recents uit localStorage: alleen die binnen de grens (een recent kan van
 *     vóór een productwissel zijn).
 * Een Geheel-account ziet alles zoals voorheen.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import type { FeatureAccessData } from '@/lib/compute-feature-access'
import { CMDK_RECENTS_KEY_PREFIX } from '@/lib/browser-account-storage'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/nieuws',
}))
vi.mock('@/components/sync/global-sync-provider', () => ({
  useGlobalSync: () => ({ triggerGlobalSync: vi.fn(), getBankAttempts: () => ({}) }),
}))

import { CommandPalette } from './command-palette'
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

const USER = 'u-krant'

function palet(modules: ModuleId[]): ReactNode {
  return (
    <FeatureAccessProvider data={DATA} activeModules={modules}>
      <CommandPalette open onClose={vi.fn()} userId={USER} />
    </FeatureAccessProvider>
  )
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) })))
  window.localStorage.setItem(
    `${CMDK_RECENTS_KEY_PREFIX}:${USER}`,
    JSON.stringify([
      { id: 'page:/overzicht/bezittingen', kind: 'page', label: 'Bezittingen', ts: 2, href: '/overzicht/bezittingen' },
      { id: 'page:/nieuws', kind: 'page', label: 'Krant', ts: 1, href: '/nieuws' },
    ]),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

function sectie(label: string): HTMLElement | null {
  return screen.queryByRole('listbox', { name: label })
}

describe('⌘K voor een Krant-account', () => {
  it('acties: alleen bedragen verbergen, weergave en uitloggen', () => {
    render(palet(['nieuws']))
    const acties = sectie('Acties')
    expect(acties).not.toBeNull()
    const tekst = acties!.textContent ?? ''
    expect(tekst).toContain('Switch naar verborgen bedragen')
    expect(tekst).toMatch(/Switch naar (eenvoudig|volledig)/)
    expect(tekst).toContain('Uitloggen')
    for (const weg of ['Alles synchroniseren', 'Switch naar Budgetteren', 'Switch naar Overzicht', "euro's"]) {
      expect(tekst, weg).not.toContain(weg)
    }
  })

  it('recents: de oude Bezittingen-recent valt weg, de Krant blijft', () => {
    render(palet(['nieuws']))
    const recent = sectie('Recent')
    expect(recent).not.toBeNull()
    expect(within(recent!).queryByText('Bezittingen')).not.toBeInTheDocument()
    expect(within(recent!).getByText('Krant')).toBeInTheDocument()
  })

  it('zoeken vindt geen pagina buiten de grens, wél de Krant', () => {
    render(palet(['nieuws']))
    const input = screen.getByLabelText('Zoekopdracht')
    fireEvent.change(input, { target: { value: 'Bezittingen' } })
    expect(sectie("Pagina's")).toBeNull()
    fireEvent.change(input, { target: { value: 'Krant' } })
    expect(within(sectie("Pagina's")!).getByText('Krant')).toBeInTheDocument()
  })
})

describe('⌘K voor een Geheel-account (ongewijzigd)', () => {
  it('alle acties en alle recents', () => {
    render(palet([...ALL_MODULES]))
    const tekst = sectie('Acties')!.textContent ?? ''
    expect(tekst).toContain('Alles synchroniseren')
    expect(tekst).toContain('Switch naar Budgetteren')
    expect(tekst).toContain("Switch naar huidige euro's")
    const recent = sectie('Recent')!
    expect(within(recent).getByText('Bezittingen')).toBeInTheDocument()
    expect(within(recent).getByText('Krant')).toBeInTheDocument()
  })
})
