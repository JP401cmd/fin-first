import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import { HomeScreenProvider, useHomeScreen } from './use-home-screen'
import type { HomeScreen } from '@/lib/home-screen'

function hrefFor(initialHomeScreen: HomeScreen, activeModules?: ModuleId[]): string {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <HomeScreenProvider initialHomeScreen={initialHomeScreen} activeModules={activeModules}>
      {children}
    </HomeScreenProvider>
  )
  return renderHook(() => useHomeScreen(), { wrapper }).result.current.homeHref
}

describe('useHomeScreen().homeHref — zelfde resolutie als de proxy (Krant 2A)', () => {
  it('bestaande profielen: alle modules of geen set → volgt de homescherm-keuze', () => {
    expect(hrefFor('overzicht')).toBe('/overzicht')
    expect(hrefFor('budget')).toBe('/overzicht/budget')
    expect(hrefFor('overzicht', [...ALL_MODULES])).toBe('/overzicht')
    expect(hrefFor('budget', [...ALL_MODULES])).toBe('/overzicht/budget')
  })

  it("alleen 'nieuws' → /nieuws, ook bij keuze 'budget'", () => {
    expect(hrefFor('budget', ['nieuws'])).toBe('/nieuws')
    expect(hrefFor('overzicht', ['nieuws'])).toBe('/nieuws')
  })

  it("server-gezette waarde 'nieuws' (ADR 0184) → /nieuws", () => {
    expect(hrefFor('nieuws', ['nieuws'])).toBe('/nieuws')
    expect(hrefFor('nieuws')).toBe('/nieuws')
  })
})

describe("useHomeScreen().toggle vanaf 'nieuws' (ADR 0184)", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("schrijft een kiesbare waarde ('overzicht'), nooit 'nieuws'", async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HomeScreenProvider initialHomeScreen="nieuws">{children}</HomeScreenProvider>
    )
    const { result } = renderHook(() => useHomeScreen(), { wrapper })

    await act(async () => {
      result.current.toggle()
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ screen: 'overzicht' }))
    expect(result.current.homeScreen).toBe('overzicht')
  })
})
