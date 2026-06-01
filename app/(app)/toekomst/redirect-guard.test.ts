import { describe, it, expect, vi } from 'vitest'

/**
 * Tests voor de redirect-guard-logica van de /toekomst-landing.
 *
 * `resolveTabRedirect` is de pure helper die de server-page gebruikt om oude
 * `?tab=`-deeplinks naar de nieuwe subpagina's (`/toekomst/<tab>`) te leiden,
 * met behoud van alle overige query-params. De page-render zelf (Supabase,
 * data-loaders, HorizonPage) is niet relevant voor deze logica en wordt
 * gemockt zodat de import van page.tsx licht blijft.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/horizon-data-loader', () => ({ loadHorizonData: vi.fn() }))
vi.mock('@/lib/will-data-loader', () => ({ loadWillData: vi.fn() }))
vi.mock('@/components/app/horizon/horizon-client', () => ({ default: () => null }))
vi.mock('@/components/future/toekomst-nav-cards', () => ({ ToekomstNavCards: () => null }))
vi.mock('@/components/future/print-tijdas-button', () => ({ PrintTijdasButton: () => null }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import { resolveTabRedirect } from './page'

describe('resolveTabRedirect — bekende sub-tabs', () => {
  it('tab=voorkeuren → /toekomst/voorkeuren', () => {
    expect(resolveTabRedirect({ tab: 'voorkeuren' })).toBe('/toekomst/voorkeuren')
  })

  it('tab=doelen → /toekomst/doelen', () => {
    expect(resolveTabRedirect({ tab: 'doelen' })).toBe('/toekomst/doelen')
  })

  it('tab=rekenhulp → /toekomst/rekenhulp', () => {
    expect(resolveTabRedirect({ tab: 'rekenhulp' })).toBe('/toekomst/rekenhulp')
  })

  it('behoudt overige query-params (tab=gebeurtenissen&strategie=aow)', () => {
    expect(resolveTabRedirect({ tab: 'gebeurtenissen', strategie: 'aow' })).toBe(
      '/toekomst/gebeurtenissen?strategie=aow',
    )
  })

  it('behoudt meerdere overige params', () => {
    const target = resolveTabRedirect({ tab: 'doelen', focus: 'g1', mode: 'edit' })
    expect(target?.startsWith('/toekomst/doelen?')).toBe(true)
    const qs = new URLSearchParams(target!.split('?')[1])
    expect(qs.get('focus')).toBe('g1')
    expect(qs.get('mode')).toBe('edit')
    expect(qs.has('tab')).toBe(false)
  })

  it('neemt het eerste element bij een array-tab', () => {
    expect(resolveTabRedirect({ tab: ['voorkeuren', 'doelen'] })).toBe('/toekomst/voorkeuren')
  })
})

describe('resolveTabRedirect — niet redirecten', () => {
  it('geen tab + strategie=open → null (blijft op /toekomst)', () => {
    expect(resolveTabRedirect({ strategie: 'open' })).toBeNull()
  })

  it('geen tab + whatif=open → null', () => {
    expect(resolveTabRedirect({ whatif: 'open' })).toBeNull()
  })

  it('leeg searchParams → null', () => {
    expect(resolveTabRedirect({})).toBeNull()
  })

  it('onbekende tab → null', () => {
    expect(resolveTabRedirect({ tab: 'bestaat-niet' })).toBeNull()
  })

  it('tab=undefined → null', () => {
    expect(resolveTabRedirect({ tab: undefined })).toBeNull()
  })
})
