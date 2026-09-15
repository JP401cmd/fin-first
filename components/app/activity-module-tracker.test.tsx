/**
 * De tracker vertaalt het pad lokaal naar een module en meldt die; beheer en
 * andere niet-meetellende paden melden niets (ADR 0147 fase 2).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'

const pad = vi.hoisted(() => ({ waarde: '/overzicht' as string | null }))
vi.mock('next/navigation', () => ({
  usePathname: () => pad.waarde,
}))

import { ActivityModuleTracker } from './activity-module-tracker'

let fetchSpy: ReturnType<typeof vi.fn>

function modules(): string[] {
  return fetchSpy.mock.calls.map(
    ([, init]) => (JSON.parse((init as RequestInit).body as string) as { module: string }).module,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  fetchSpy = vi.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 })))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => vi.unstubAllGlobals())

describe('ActivityModuleTracker', () => {
  it.each([
    ['/overzicht', 'overzicht'],
    ['/overzicht/bezittingen/aandelen', 'bezittingen'],
    ['/toekomst', 'toekomst'],
    ['/core/cash', 'budget'],
    ['/mijn/uiterlijk', 'mijn'],
  ])('%s → %s', (pathname, verwacht) => {
    pad.waarde = pathname
    const { container } = render(<ActivityModuleTracker />)
    expect(container).toBeEmptyDOMElement()
    expect(modules()).toEqual([verwacht])
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/activity/module')
  })

  it.each(['/beheer', '/beheer/vragenlijsten', '/onboarding'])('%s → geen POST', (pathname) => {
    pad.waarde = pathname
    render(<ActivityModuleTracker />)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('navigeren binnen hetzelfde app-deel post niet opnieuw', () => {
    pad.waarde = '/toekomst'
    const { rerender } = render(<ActivityModuleTracker />)
    pad.waarde = '/toekomst/doel'
    rerender(<ActivityModuleTracker />)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
